import Dexie, { type Table } from 'dexie';
import type { PracticeAttemptPayload } from '@shared';

export interface PendingAttempt {
  id?: number;
  payload: PracticeAttemptPayload;
  createdAt: number;
}

class PracticeDatabase extends Dexie {
  pendingAttempts!: Table<PendingAttempt, number>;

  constructor() {
    super('german-verb-master');
    this.version(1).stores({
      pendingAttempts: '++id, createdAt',
    });
  }
}

export const practiceDb = new PracticeDatabase();
