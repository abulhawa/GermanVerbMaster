import { z } from 'zod';
import type { CEFRLevel, TaskAnswerHistoryItem, TaskAttemptPayload } from '@shared';
import { practiceDb, practiceDbReady, type PendingAttempt } from './db';
import { getDeviceId } from './device';

const TASK_ENDPOINT = '/api/submission';
const PRACTICE_HISTORY_ENDPOINT = '/api/practice/history';

type SubmitPayload = Omit<TaskAttemptPayload, 'deviceId'>;

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
  packId: z.string().nullable().optional(),
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
    return { queued: true };
  }

  try {
    const response = await sendAttempt(enrichedPayload);
    if (!response.ok) {
      const shouldQueue = response.status >= 500 || response.status === 429;
      if (shouldQueue) {
        await queueAttempt(enrichedPayload);
        return { queued: true };
      }

      const body = await response.json().catch(() => ({ error: 'Failed to record practice attempt' }));
      throw new Error(body.error ?? 'Failed to record practice attempt');
    }
    return { queued: false };
  } catch (error) {
    console.warn('Unable to submit practice attempt, queueing for later', error);
    await queueAttempt(enrichedPayload);
    return { queued: true };
  }
}

export async function flushPendingAttempts(): Promise<number> {
  await practiceDbReady;
  const queued = await practiceDb.pendingAttempts.orderBy('createdAt').toArray();
  let flushed = 0;

  for (const attempt of queued) {
    try {
      const response = await sendAttempt(attempt.payload);
      if (!response.ok) {
        const retriable = response.status >= 500 || response.status === 429;
        if (!retriable) {
          console.error('Dropping invalid queued attempt', await response.json().catch(() => undefined));
          await practiceDb.pendingAttempts.delete(attempt.id!);
          flushed += 1;
          continue;
        }
        throw new Error(`Server responded with ${response.status}`);
      }

      await practiceDb.pendingAttempts.delete(attempt.id!);
      flushed += 1;
    } catch (error) {
      console.warn('Failed to flush queued practice attempt', error);
      break;
    }
  }

  return flushed;
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
