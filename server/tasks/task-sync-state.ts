import { eq, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { taskSyncState } from '@db/schema';

const TASK_SPEC_SYNC_ID = 'task_specs';

export interface TaskSpecSyncCheckpoint {
  lastSyncedAt: Date;
  versionHash: string | null;
}

export async function loadTaskSpecSyncCheckpoint(): Promise<TaskSpecSyncCheckpoint | null> {
  const db = getDb();
  const rows = await db
    .select({
      lastSyncedAt: taskSyncState.lastSyncedAt,
      versionHash: taskSyncState.versionHash,
    })
    .from(taskSyncState)
    .where(eq(taskSyncState.id, TASK_SPEC_SYNC_ID))
    .limit(1);

  const row = rows[0];
  if (!row?.lastSyncedAt) {
    return null;
  }

  return {
    lastSyncedAt: row.lastSyncedAt,
    versionHash: row.versionHash ?? null,
  };
}

export async function storeTaskSpecSyncCheckpoint(
  checkpoint: TaskSpecSyncCheckpoint,
): Promise<void> {
  const db = getDb();

  await db
    .insert(taskSyncState)
    .values({
      id: TASK_SPEC_SYNC_ID,
      lastSyncedAt: checkpoint.lastSyncedAt,
      versionHash: checkpoint.versionHash ?? null,
    })
    .onConflictDoUpdate({
      target: taskSyncState.id,
      set: {
        lastSyncedAt: checkpoint.lastSyncedAt,
        versionHash: checkpoint.versionHash ?? null,
        updatedAt: sql`now()`,
      },
    });
}

export async function clearTaskSpecSyncCheckpoint(): Promise<void> {
  const db = getDb();
  await db.delete(taskSyncState).where(eq(taskSyncState.id, TASK_SPEC_SYNC_ID));
}
