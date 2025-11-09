import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool } from '@db';

import { applyMigrations } from './db-push';
import { aggregateWords } from './seed/loaders/words';
import { ensureDatabase, ensureLegacySchema, resetSeededContent } from './seed/database';
import type { DatabaseClient } from './seed/database';
import { parseSeedOptions, type SeedOptions } from './seed/options';
import { syncLegacyWords, upsertLexemeInventory } from './seed/persistence';

export async function seedDatabase(
  rootDir: string,
  db: DatabaseClient = ensureDatabase(),
  options: SeedOptions = {},
): Promise<{
  aggregatedCount: number;
  lexemeCount: number;
  inflectionCount: number;
}> {
  await ensureLegacySchema(db);

  if (options.reset) {
    console.log('Resetting seeded lexemes, inflections, and legacy words before seeding…');
    await resetSeededContent(db);
  }

  const aggregated = await aggregateWords(rootDir);
  await syncLegacyWords(db, aggregated);

  const { lexemeCount, inflectionCount } = await upsertLexemeInventory(db, aggregated);

  return {
    aggregatedCount: aggregated.length,
    lexemeCount,
    inflectionCount,
  };
}

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(__filename), '..');

  console.log('Applying database migrations before seeding…');
  const pool = getPool();
  await applyMigrations(pool);

  const options = parseSeedOptions(process.argv.slice(2));
  const database = ensureDatabase();
  const { aggregatedCount, lexemeCount, inflectionCount } = await seedDatabase(
    root,
    database,
    options,
  );

  console.log(`Seeded ${aggregatedCount} words into legacy table.`);
  console.log(`Upserted ${lexemeCount} lexemes and ${inflectionCount} inflections.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .then(() => {
      console.log('Word seeding completed');
    })
    .catch((error) => {
      console.error('Failed to seed content', error);
      process.exit(1);
    });
}
