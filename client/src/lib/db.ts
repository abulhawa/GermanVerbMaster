import Dexie, { type Table } from 'dexie';
import type { PracticeAttemptPayload, TaskAttemptPayload } from '@shared';

const LEGACY_DB_NAME = 'german-verb-master';

export interface PendingAttempt {
  id?: number;
  payload: TaskAttemptPayload;
  createdAt: number;
}

class PracticeDatabase extends Dexie {
  pendingAttempts!: Table<PendingAttempt, number>;

  constructor() {
    super('practice');
    this.version(1).stores({
      pendingAttempts: '++id, createdAt, payload.taskId',
    });
    this.on('ready', async () => {
      await migrateLegacyPendingAttempts(this);
    });
  }
}

export const practiceDb = new PracticeDatabase();
export const practiceDbReady = practiceDb.open().catch((error) => {
  console.warn('Failed to open practice database', error);
});

async function migrateLegacyPendingAttempts(db: PracticeDatabase): Promise<void> {
  try {
    const exists = await Dexie.exists(LEGACY_DB_NAME);
    if (!exists) {
      return;
    }

    const legacyDb = new Dexie(LEGACY_DB_NAME);
    legacyDb.version(1).stores({ pendingAttempts: '++id, createdAt' });
    await legacyDb.open();

    const legacyTable = legacyDb.table<{ id?: number; payload: PracticeAttemptPayload; createdAt: number }>('pendingAttempts');
    const legacyAttempts = await legacyTable.toArray();

    if (!legacyAttempts.length) {
      await legacyDb.close();
      await Dexie.delete(LEGACY_DB_NAME);
      return;
    }

    const converted = legacyAttempts.map<PendingAttempt>((attempt) => ({
      payload: convertLegacyAttempt(attempt.payload),
      createdAt: attempt.createdAt,
    }));

    await db.transaction('rw', db.pendingAttempts, async () => {
      for (const attempt of converted) {
        await db.pendingAttempts.add(attempt);
      }
    });

    await legacyDb.close();
    await Dexie.delete(LEGACY_DB_NAME);
  } catch (error) {
    console.warn('Failed to migrate legacy practice attempts', error);
  }
}

function convertLegacyAttempt(payload: PracticeAttemptPayload): TaskAttemptPayload {
  const legacyId = `legacy:verb:${payload.verb}`;
  return {
    taskId: legacyId,
    lexemeId: legacyId,
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: 'conjugate_form',
    result: payload.result,
    submittedResponse: payload.attemptedAnswer,
    expectedResponse: undefined,
    timeSpentMs: payload.timeSpent,
    answeredAt: payload.queuedAt ?? new Date().toISOString(),
    deviceId: payload.deviceId,
    queuedAt: payload.queuedAt,
    cefrLevel: payload.level,
    packId: null,
    legacyVerb: {
      infinitive: payload.verb,
      mode: payload.mode,
      level: payload.level,
      attemptedAnswer: payload.attemptedAnswer,
    },
  } satisfies TaskAttemptPayload;
}

export async function convertLegacyPayload(payload: PracticeAttemptPayload): Promise<TaskAttemptPayload> {
  return convertLegacyAttempt(payload);
}
