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
    expect(flushed).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(0);
  });
});
