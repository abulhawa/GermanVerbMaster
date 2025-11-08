import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool } from '@db';

import { applyMigrations } from './db-push';
import { ensureTaskSpecsSynced, resetTaskSpecSync } from '../server/tasks/synchronizer.js';

async function rebuildTaskSpecs(): Promise<void> {
  const pool = getPool();

  try {
    console.log('Applying database migrations before rebuilding task specs…');
    await applyMigrations(pool);

    console.log('Regenerating task specs from current lexeme inventory…');
    resetTaskSpecSync();
    await ensureTaskSpecsSynced();
    console.log('Task specs rebuilt successfully.');
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  try {
    await rebuildTaskSpecs();
  } catch (error) {
    console.error('Failed to rebuild task specs:', error);
    process.exit(1);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = path.resolve(process.argv[1] ?? '');

if (scriptPath === invokedPath) {
  await main();
}

export { rebuildTaskSpecs };
