import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

import { createDb, createPool } from '@db/client';

interface JournalEntry {
  tag: string;
  when: number;
}

interface LocalMigration {
  tag: string;
  when: number;
  hash: string;
  filePath: string;
}

interface DbMigrationRow {
  hash: string;
  created_at: string | number | null;
}

async function readLocalMigrations(migrationsFolder: string): Promise<LocalMigration[]> {
  const journalPath = join(migrationsFolder, 'meta/_journal.json');
  const journalRaw = await readFile(journalPath, 'utf8');
  const journal: { entries?: JournalEntry[] } = JSON.parse(journalRaw);

  const entries = journal.entries ?? [];
  const migrations = await Promise.all(
    entries.map(async (entry) => {
      const filePath = join(migrationsFolder, `${entry.tag}.sql`);
      const sql = await readFile(filePath);
      const hash = createHash('sha256').update(sql).digest('hex');
      return {
        tag: entry.tag,
        when: entry.when,
        hash,
        filePath,
      } satisfies LocalMigration;
    }),
  );

  return migrations;
}

function normalizeCreatedAt(createdAt: DbMigrationRow['created_at']): number | null {
  if (createdAt === null || createdAt === undefined) {
    return null;
  }

  const numeric = typeof createdAt === 'string' ? Number.parseInt(createdAt, 10) : Number(createdAt);
  return Number.isFinite(numeric) ? numeric : null;
}

async function verifyMigrationsApplied(pool: Pool, migrationsFolder: string): Promise<void> {
  const localMigrations = await readLocalMigrations(migrationsFolder);

  if (localMigrations.length === 0) {
    return;
  }

  let rows: DbMigrationRow[];
  try {
    const result = await pool.query<DbMigrationRow>(
      'select hash, created_at from drizzle."__drizzle_migrations" order by created_at asc',
    );
    rows = result.rows;
  } catch (error: unknown) {
    if (error instanceof Error && /relation "?drizzle\.?__drizzle_migrations"? does not exist/i.test(error.message)) {
      // The migrations table has not been created yet. The subsequent migrate() call will do it.
      return;
    }

    throw error;
  }

  const rowsByHash = new Map(rows.map((row) => [row.hash, row] as const));
  const rowsByCreatedAt = new Map(
    rows
      .map((row) => {
        const createdAt = normalizeCreatedAt(row.created_at);
        return createdAt === null ? null : ([createdAt, row] as const);
      })
      .filter((entry): entry is readonly [number, DbMigrationRow] => entry !== null),
  );

  const localHashes = new Set(localMigrations.map((migration) => migration.hash));
  const localTimestamps = new Set(localMigrations.map((migration) => migration.when));

  const missingMigrations: LocalMigration[] = [];
  const mismatchedMigrations: { expected: LocalMigration; actualHash: string }[] = [];
  const unexpectedDbRows: { hash: string; createdAt: number | null }[] = [];

  for (const migration of localMigrations) {
    if (rowsByHash.has(migration.hash)) {
      continue;
    }

    const matchingTimestamp = rowsByCreatedAt.get(migration.when);
    if (matchingTimestamp) {
      mismatchedMigrations.push({ expected: migration, actualHash: matchingTimestamp.hash });
    } else {
      missingMigrations.push(migration);
    }
  }

  for (const row of rows) {
    if (localHashes.has(row.hash)) {
      continue;
    }

    const createdAt = normalizeCreatedAt(row.created_at);
    if (createdAt !== null && localTimestamps.has(createdAt)) {
      // Already reported as a mismatch for the corresponding local migration.
      continue;
    }

    unexpectedDbRows.push({ hash: row.hash, createdAt });
  }

  if (missingMigrations.length > 0 || mismatchedMigrations.length > 0 || unexpectedDbRows.length > 0) {
    const details: string[] = [];

    if (missingMigrations.length > 0) {
      const summary = missingMigrations
        .map((migration) => `${migration.tag} (hash ${migration.hash.slice(0, 8)}…, when ${migration.when})`)
        .join('\n  - ');
      details.push(`Missing migrations detected:\n  - ${summary}`);
    }

    if (mismatchedMigrations.length > 0) {
      const summary = mismatchedMigrations
        .map((migration) => {
          return `${migration.expected.tag} expected hash ${migration.expected.hash.slice(0, 8)}… but found ${migration.actualHash.slice(0, 8)}…`;
        })
        .join('\n  - ');
      details.push(`Mismatched migration hashes detected:\n  - ${summary}`);
    }

    if (unexpectedDbRows.length > 0) {
      const summary = unexpectedDbRows
        .map((row) => {
          const createdAt = row.createdAt !== null ? `created_at ${row.createdAt}` : 'created_at <null>';
          return `${row.hash.slice(0, 8)}… (${createdAt})`;
        })
        .join('\n  - ');
      details.push(
        `Unexpected migrations present in the database only:\n  - ${summary}\n` +
          'These entries do not correspond to any migration in the local project.',
      );
    }

    details.push(
      'The database migration history is out of sync with the local project. ' +
        'Reconcile the drizzle.__drizzle_migrations table so it matches the migrations checked into the repository, then rerun the script.',
    );

    const createdAtValues = [
      ...new Set(
        [
          ...missingMigrations.map((migration) => migration.when),
          ...mismatchedMigrations.map((migration) => migration.expected.when),
          ...unexpectedDbRows.map((row) => row.createdAt).filter((value): value is number => value !== null),
        ],
      ),
    ].sort();

    if (createdAtValues.length > 0) {
      details.push(
        'Hint: to inspect the conflicting entries, run:\n' +
          '  select * from drizzle."__drizzle_migrations"\n' +
          `  where created_at in (${createdAtValues.join(', ')});`,
      );
      details.push(
        'Depending on the situation, you can either delete those rows so the migrator replays them, ' +
          'or update their hash to match the SQL files you expect. Make a backup before modifying the table.',
      );
    }

    throw new Error(details.join('\n\n'));
  }
}

async function applyMigrations(providedPool?: Pool): Promise<void> {
  const currentPath = fileURLToPath(import.meta.url);
  const migrationsFolder = resolve(dirname(currentPath), '../migrations');
  const pool = providedPool ?? createPool();
  const shouldClosePool = !providedPool;

  try {
    const db = createDb(pool);
    await migrate(db, { migrationsFolder });
    await verifyMigrationsApplied(pool, migrationsFolder);
    console.log('Database migrations applied successfully.');
  } finally {
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

async function main(): Promise<void> {
  try {
    await applyMigrations();
  } catch (error) {
    console.error('Failed to apply database migrations:', error);
    process.exit(1);
  }
}

const executedAsScript = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');

if (executedAsScript) {
  await main();
}

export { applyMigrations };
