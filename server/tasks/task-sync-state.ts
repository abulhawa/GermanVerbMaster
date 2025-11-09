import { eq, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { taskSyncState } from '@db/schema';

const TASK_SPEC_SYNC_ID = 'task_specs';

export interface TaskSpecSyncCheckpoint {
  lastSyncedAt: Date;
  versionHash: string | null;
}

export interface TaskSpecSyncStateRecord {
  lastSyncedAt: Date | null;
  versionHash: string | null;
  updatedAt: Date | null;
}

export async function loadTaskSpecSyncState(): Promise<TaskSpecSyncStateRecord | null> {
  const db = getDb();
  const rows = await db
    .select({
      lastSyncedAt: taskSyncState.lastSyncedAt,
      versionHash: taskSyncState.versionHash,
      updatedAt: taskSyncState.updatedAt,
    })
    .from(taskSyncState)
    .where(eq(taskSyncState.id, TASK_SPEC_SYNC_ID))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    lastSyncedAt: row.lastSyncedAt ?? null,
    versionHash: row.versionHash ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function loadTaskSpecSyncCheckpoint(): Promise<TaskSpecSyncCheckpoint | null> {
  const state = await loadTaskSpecSyncState();
  if (!state?.lastSyncedAt) {
    return null;
  }

  return {
    lastSyncedAt: state.lastSyncedAt,
    versionHash: state.versionHash,
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

interface TaskSpecSyncHeartbeatOptions {
  checkpoint: TaskSpecSyncCheckpoint | null;
  completedAt: Date;
}

export async function recordTaskSpecSyncHeartbeat({
  checkpoint,
  completedAt,
}: TaskSpecSyncHeartbeatOptions): Promise<void> {
  const db = getDb();
  const insertValues = {
    id: TASK_SPEC_SYNC_ID,
    lastSyncedAt: checkpoint?.lastSyncedAt ?? null,
    versionHash: checkpoint?.versionHash ?? null,
    updatedAt: completedAt,
  };

  const updateValues: Partial<typeof taskSyncState.$inferInsert> = {
    updatedAt: completedAt,
  };

  if (checkpoint) {
    updateValues.lastSyncedAt = checkpoint.lastSyncedAt;
    updateValues.versionHash = checkpoint.versionHash ?? null;
  }

  await db
    .insert(taskSyncState)
    .values(insertValues)
    .onConflictDoUpdate({
      target: taskSyncState.id,
      set: updateValues,
    });
}
