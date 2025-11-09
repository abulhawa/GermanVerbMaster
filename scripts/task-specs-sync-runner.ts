import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool } from '@db';

import { ensureTaskSpecsSynced, getTaskSpecSyncMetadata } from '../server/tasks/synchronizer.js';
import { loadTaskSpecSyncState } from '../server/tasks/task-sync-state.js';

const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

function resolveSyncIntervalMs(): number {
  const raw = process.env.TASK_SPEC_SYNC_INTERVAL_MS;
  if (!raw) {
    return DEFAULT_SYNC_INTERVAL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SYNC_INTERVAL_MS;
  }

  return parsed;
}

async function shouldRunSync(now: Date, intervalMs: number): Promise<boolean> {
  const state = await loadTaskSpecSyncState();
  if (!state?.updatedAt) {
    return true;
  }

  const elapsed = now.getTime() - state.updatedAt.getTime();
  return elapsed >= intervalMs;
}

async function runSyncCycle(now: Date): Promise<boolean> {
  const intervalMs = resolveSyncIntervalMs();
  if (!(await shouldRunSync(now, intervalMs))) {
    console.log(
      `[${now.toISOString()}] Task spec sync is fresh (interval ${intervalMs}ms); skipping refresh.`,
    );
    return false;
  }

  console.log(`[${now.toISOString()}] Running task spec synchronisation…`);
  const result = await ensureTaskSpecsSynced();
  const metadata = getTaskSpecSyncMetadata();
  const completedAt = metadata.lastRunCompletedAt ?? new Date();

  console.log(
    `[${completedAt.toISOString()}] Sync complete: ` +
      `lexemes processed=${result.stats.lexemesProcessed}, ` +
      `tasks processed=${result.stats.taskSpecsProcessed}.`,
  );

  return true;
}

export async function runTaskSpecSyncRunner(now: Date = new Date()): Promise<boolean> {
  const pool = getPool();
  try {
    return await runSyncCycle(now);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  try {
    await runTaskSpecSyncRunner();
  } catch (error) {
    console.error('Task spec sync runner failed:', error);
    process.exit(1);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = path.resolve(process.argv[1] ?? '');

if (scriptPath === invokedPath) {
  await main();
}
