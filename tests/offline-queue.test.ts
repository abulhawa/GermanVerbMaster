import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitPracticeAttempt, flushPendingAttempts, getPendingAttempts } from '@/lib/api';
import { practiceDb } from '@/lib/db';
import type { PracticeAttemptPayload } from '@shared';

const basePayload: Omit<PracticeAttemptPayload, 'deviceId'> = {
  verb: 'sein',
  mode: 'präteritum',
  result: 'correct',
  attemptedAnswer: 'war',
  timeSpent: 1500,
  level: 'A1',
  queuedAt: new Date().toISOString(),
};

async function resetDb() {
  await practiceDb.pendingAttempts.clear();
}

describe('offline queue', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    global.fetch = vi.fn();
  });

  it('queues attempts when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await submitPracticeAttempt(basePayload);
    expect(result.queued).toBe(true);

    const attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.payload.verb).toBe('sein');
  });

  it('flushes queued attempts when back online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await submitPracticeAttempt(basePayload);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flushed = await flushPendingAttempts();
    expect(flushed).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(0);
  });
});
