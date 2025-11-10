import { z } from 'zod';
import type { CEFRLevel, TaskAnswerHistoryItem, TaskAttemptPayload } from '@shared';
import { practiceDb, practiceDbReady, type PendingAttempt } from './db';
import { getDeviceId } from './device';
import { recordSubmissionMetric } from './metrics';

const TASK_ENDPOINT = '/api/submission';
const PRACTICE_HISTORY_ENDPOINT = '/api/practice/history';

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const DEFAULT_FLUSH_BATCH_SIZE = 3;

type SubmitPayload = Omit<TaskAttemptPayload, 'deviceId'>;

function getRetryBackoffMs(retryCount: number): number {
  if (retryCount <= 0) {
    return 0;
  }

  const cappedRetry = Math.min(retryCount, 10);
  const delay = Math.pow(2, cappedRetry - 1) * 1000;
  return Math.min(MAX_BACKOFF_MS, delay);
}

const answerHistoryLexemeSchema = z.object({
  id: z.string(),
  lemma: z.string(),
  pos: z.string(),
  level: z.string().optional(),
  english: z.string().optional(),
  example: z
    .object({
      de: z.string().optional(),
      en: z.string().optional(),
    })
    .optional(),
  auxiliary: z.string().optional(),
});

const practiceHistoryItemSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  lexemeId: z.string(),
  taskType: z.string(),
  pos: z.string(),
  renderer: z.string(),
  result: z.enum(['correct', 'incorrect']),
  submittedResponse: z.unknown(),
  expectedResponse: z.unknown().optional(),
  promptSummary: z.string(),
  answeredAt: z.string(),
  timeSpentMs: z.number(),
  timeSpent: z.number(),
  cefrLevel: z.string().optional(),
  mode: z.string().optional(),
  attemptedAnswer: z.string().optional(),
  correctAnswer: z.string().optional(),
  prompt: z.string().optional(),
  level: z.string().optional(),
  lexeme: answerHistoryLexemeSchema.optional(),
  verb: z.unknown().optional(),
  legacyVerb: z.unknown().optional(),
});

const practiceHistoryResponseSchema = z.object({
  history: z.array(practiceHistoryItemSchema),
});

function withDeviceId(payload: SubmitPayload): TaskAttemptPayload {
  return {
    ...payload,
    deviceId: getDeviceId(),
    queuedAt: payload.queuedAt ?? new Date().toISOString(),
  } satisfies TaskAttemptPayload;
}

async function queueAttempt(payload: TaskAttemptPayload): Promise<void> {
  await practiceDbReady;
  await practiceDb.pendingAttempts.add({
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  });
}

async function sendAttempt(payload: TaskAttemptPayload): Promise<Response> {
  return fetch(TASK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function submitPracticeAttempt(payload: SubmitPayload): Promise<{ queued: boolean }>;
export async function submitPracticeAttempt(
  payload: SubmitPayload,
  options: { forceQueue?: boolean },
): Promise<{ queued: boolean }>;
export async function submitPracticeAttempt(
  payload: SubmitPayload,
  options: { forceQueue?: boolean } = {},
): Promise<{ queued: boolean }> {
  const enrichedPayload = withDeviceId(payload);

  if (options.forceQueue || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    await queueAttempt(enrichedPayload);
    try {
      recordSubmissionMetric(0, true);
    } catch {}
    return { queued: true };
  }

  try {
    const start = Date.now();
    const response = await sendAttempt(enrichedPayload);
    if (!response.ok) {
      const shouldQueue = response.status >= 500 || response.status === 429;
      if (shouldQueue) {
        await queueAttempt(enrichedPayload);
        try {
          recordSubmissionMetric(Date.now() - start, true);
        } catch {}
        return { queued: true };
      }

      const body = await response.json().catch(() => ({ error: 'Failed to record practice attempt' }));
      throw new Error(body.error ?? 'Failed to record practice attempt');
    }
    try {
      recordSubmissionMetric(Date.now() - start, false);
    } catch {}
    return { queued: false };
  } catch (error) {
    console.warn('Unable to submit practice attempt, queueing for later', error);
    await queueAttempt(enrichedPayload);
    try {
      recordSubmissionMetric(0, true);
    } catch {}
    return { queued: true };
  }
}

export interface FlushPendingAttemptsResult {
  attempted: number;
  succeeded: number;
  failed: number;
  deferred: number;
  dropped: number;
}

export interface FlushPendingAttemptsOptions {
  batchSize?: number;
}

export async function flushPendingAttempts(
  options: FlushPendingAttemptsOptions = {},
): Promise<FlushPendingAttemptsResult> {
  await practiceDbReady;
  const queued = await practiceDb.pendingAttempts.orderBy('createdAt').toArray();
  const result: FlushPendingAttemptsResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    deferred: 0,
    dropped: 0,
  };

  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_FLUSH_BATCH_SIZE));

  const readyAttempts: PendingAttempt[] = [];

  for (const attempt of queued) {
    const now = Date.now();
    const retryCount = attempt.retryCount ?? 0;
    const lastTriedAt = attempt.lastTriedAt ?? 0;
    const backoffMs = getRetryBackoffMs(retryCount);

    if (retryCount > 0 && now - lastTriedAt < backoffMs) {
      result.deferred += 1;
      continue;
    }

    readyAttempts.push(attempt);
  }

  for (let index = 0; index < readyAttempts.length; index += batchSize) {
    const chunk = readyAttempts.slice(index, index + batchSize);
    result.attempted += chunk.length;

    const settlements = await Promise.allSettled(
      chunk.map(async (attempt) => {
        try {
          const response = await sendAttempt(attempt.payload);
          return { attempt, response };
        } catch (error) {
          throw { attempt, error };
        }
      }),
    );

    for (const settlement of settlements) {
      if (settlement.status === 'fulfilled') {
        const { attempt, response } = settlement.value;

        if (!response.ok) {
          const retriable = response.status >= 500 || response.status === 429;
          if (!retriable) {
            console.error('Dropping invalid queued attempt', await response.json().catch(() => undefined));
            if (attempt.id !== undefined) {
              await practiceDb.pendingAttempts.delete(attempt.id);
            }
            result.dropped += 1;
            continue;
          }

          console.warn('Failed to flush queued practice attempt', new Error(`Server responded with ${response.status}`));
          const now = Date.now();
          if (attempt.id !== undefined) {
            await practiceDb.pendingAttempts.update(attempt.id, {
              retryCount: (attempt.retryCount ?? 0) + 1,
              lastTriedAt: now,
            });
          }
          result.failed += 1;
          continue;
        }

        if (attempt.id !== undefined) {
          await practiceDb.pendingAttempts.delete(attempt.id);
        }
        result.succeeded += 1;
      } else {
        const { attempt, error } = settlement.reason as { attempt: PendingAttempt; error: unknown };
        console.warn('Failed to flush queued practice attempt', error);
        const now = Date.now();
        if (attempt.id !== undefined) {
          await practiceDb.pendingAttempts.update(attempt.id, {
            retryCount: (attempt.retryCount ?? 0) + 1,
            lastTriedAt: now,
          });
        }
        result.failed += 1;
      }
    }
  }

  return result;
}

export async function getPendingAttempts(): Promise<PendingAttempt[]> {
  await practiceDbReady;
  return practiceDb.pendingAttempts.orderBy('createdAt').toArray();
}

export interface PracticeHistoryFilters {
  deviceId: string;
  result?: 'correct' | 'incorrect';
  level?: CEFRLevel;
  limit?: number;
}

export async function fetchPracticeHistory(filters: PracticeHistoryFilters): Promise<TaskAnswerHistoryItem[]> {
  const params = new URLSearchParams();
  params.set('deviceId', filters.deviceId);
  if (filters.result) {
    params.set('result', filters.result);
  }
  if (filters.level) {
    params.set('level', filters.level);
  }
  if (filters.limit) {
    params.set('limit', String(filters.limit));
  }

  const query = params.toString();
  const response = await fetch(
    query ? `${PRACTICE_HISTORY_ENDPOINT}?${query}` : PRACTICE_HISTORY_ENDPOINT,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to load practice history (${response.status})`);
  }

  const payload = await response.json().catch(() => ({ history: [] }));
  const parsed = practiceHistoryResponseSchema.parse(payload);
  return parsed.history as TaskAnswerHistoryItem[];
}

export async function clearPracticeHistory(filters: { deviceId: string }): Promise<void> {
  const response = await fetch(PRACTICE_HISTORY_ENDPOINT, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: filters.deviceId }),
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to clear practice history (${response.status})`);
  }
}
