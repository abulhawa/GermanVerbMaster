import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

import { createDb, createPool } from '../server/db/client';

async function applyMigrations(providedPool?: Pool): Promise<void> {
  const currentPath = fileURLToPath(import.meta.url);
  const migrationsFolder = resolve(dirname(currentPath), '../migrations');
  const pool = providedPool ?? createPool();
  const shouldClosePool = !providedPool;

  try {
    const db = createDb(pool);
    await migrate(db, { migrationsFolder });
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
