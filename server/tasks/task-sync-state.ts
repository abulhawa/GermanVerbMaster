import { eq, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { taskSyncState } from '@db/schema';

const TASK_SPEC_SYNC_ID = 'task_specs';

export async function loadTaskSpecSyncMarker(): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ lastSyncedAt: taskSyncState.lastSyncedAt })
    .from(taskSyncState)
    .where(eq(taskSyncState.id, TASK_SPEC_SYNC_ID))
    .limit(1);

  return rows[0]?.lastSyncedAt ?? null;
}

export async function storeTaskSpecSyncMarker(marker: Date): Promise<void> {
  const db = getDb();

  await db
    .insert(taskSyncState)
    .values({ id: TASK_SPEC_SYNC_ID, lastSyncedAt: marker })
    .onConflictDoUpdate({
      target: taskSyncState.id,
      set: {
        lastSyncedAt: marker,
        updatedAt: sql`now()`,
      },
    });
}

export async function clearTaskSpecSyncMarker(): Promise<void> {
  const db = getDb();
  await db.delete(taskSyncState).where(eq(taskSyncState.id, TASK_SPEC_SYNC_ID));
}
