import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitPracticeAttempt, flushPendingAttempts, getPendingAttempts } from '@/lib/api';
import { practiceDb, practiceDbReady } from '@/lib/db';
import type { TaskAttemptPayload } from '@shared';

const basePayload: Omit<TaskAttemptPayload, 'deviceId'> = {
  taskId: 'legacy:verb:sein',
  lexemeId: 'legacy:verb:sein',
  taskType: 'conjugate_form',
  pos: 'verb',
  renderer: 'conjugate_form',
  result: 'correct',
  submittedResponse: 'war',
  expectedResponse: 'war',
  timeSpentMs: 1500,
  answeredAt: new Date().toISOString(),
  queuedAt: new Date().toISOString(),
  cefrLevel: 'A1',
  legacyVerb: {
    infinitive: 'sein',
    mode: 'präteritum',
    level: 'A1',
    attemptedAnswer: 'war',
  },
};

const nounPayload: Omit<TaskAttemptPayload, 'deviceId'> = {
  taskId: 'task:de:noun:kind:dative',
  lexemeId: 'lex:de:noun:kind',
  taskType: 'noun_case_declension',
  pos: 'noun',
  renderer: 'noun_case_declension',
  result: 'correct',
  submittedResponse: 'den Kindern',
  expectedResponse: { form: 'Kindern', article: 'den' },
  timeSpentMs: 2100,
  answeredAt: new Date().toISOString(),
  cefrLevel: 'A2',
};

async function resetDb() {
  await practiceDbReady;
  await practiceDb.pendingAttempts.clear();
}

describe('offline queue', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    global.fetch = vi.fn();
  });

  it('queues attempts when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await submitPracticeAttempt(basePayload);
    expect(result.queued).toBe(true);

    const attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.payload.taskId).toBe('legacy:verb:sein');
  });

  it('stores noun declension attempts with article metadata when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await submitPracticeAttempt(nounPayload);
    expect(result.queued).toBe(true);

    const attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(1);
    const payload = attempts[0]?.payload;
    expect(payload?.taskType).toBe('noun_case_declension');
    expect(payload?.pos).toBe('noun');
    expect(payload?.submittedResponse).toBe('den Kindern');
    expect(payload?.expectedResponse).toEqual({ form: 'Kindern', article: 'den' });
  });

  it('flushes queued attempts when back online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await submitPracticeAttempt(basePayload);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flushed = await flushPendingAttempts();
    expect(flushed.succeeded).toBe(1);
    expect(flushed.failed).toBe(0);
    expect(flushed.deferred).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(0);
  });

  it('continues flushing attempts when one fails and backs off retries', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await submitPracticeAttempt(basePayload);
    await submitPracticeAttempt(nounPayload);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    const responses = [
      { ok: false, status: 500, json: () => Promise.resolve({ error: 'retry' }) },
      { ok: true, json: () => Promise.resolve({ success: true }) },
      { ok: true, json: () => Promise.resolve({ success: true }) },
    ];

    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!));
    global.fetch = fetchMock as unknown as typeof fetch;

    const firstFlush = await flushPendingAttempts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstFlush.succeeded).toBe(1);
    expect(firstFlush.failed).toBe(1);
    expect(firstFlush.deferred).toBe(0);

    let attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(1);
    const pendingAttempt = attempts[0];
    expect(pendingAttempt?.retryCount).toBe(1);
    expect(pendingAttempt?.lastTriedAt).toBeDefined();

    const secondFlush = await flushPendingAttempts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secondFlush.succeeded).toBe(0);
    expect(secondFlush.failed).toBe(0);
    expect(secondFlush.deferred).toBe(1);

    if (pendingAttempt?.id) {
      await practiceDb.pendingAttempts.update(pendingAttempt.id, {
        lastTriedAt: Date.now() - 1500,
      });
    }

    const thirdFlush = await flushPendingAttempts();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(thirdFlush.succeeded).toBe(1);
    expect(thirdFlush.failed).toBe(0);
    expect(thirdFlush.deferred).toBe(0);

    attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(0);
  });
});
