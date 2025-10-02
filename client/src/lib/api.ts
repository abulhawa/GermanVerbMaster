import type { PracticeAttemptPayload, PracticeResult, TaskAttemptPayload } from '@shared';
import { practiceDb, practiceDbReady, type PendingAttempt } from './db';
import { getDeviceId } from './device';

const LEGACY_ENDPOINT = '/api/practice-history';
const TASK_ENDPOINT = '/api/submission';

type SubmitPayload = Omit<TaskAttemptPayload, 'deviceId'>;

function withDeviceId(payload: SubmitPayload): TaskAttemptPayload {
  return {
    ...payload,
    deviceId: getDeviceId(),
    queuedAt: payload.queuedAt ?? new Date().toISOString(),
  } satisfies TaskAttemptPayload;
}

function toLegacyPayload(payload: TaskAttemptPayload): PracticeAttemptPayload | null {
  if (!payload.legacyVerb) {
    return null;
  }

  const { infinitive, mode, level, attemptedAnswer } = payload.legacyVerb;
  const result: PracticeResult = payload.result;

  return {
    verb: infinitive,
    mode,
    result,
    attemptedAnswer: typeof payload.submittedResponse === 'string' ? payload.submittedResponse : attemptedAnswer ?? '',
    timeSpent: payload.timeSpentMs,
    level: level ?? 'A1',
    deviceId: payload.deviceId,
    queuedAt: payload.queuedAt,
  } satisfies PracticeAttemptPayload;
}

async function queueAttempt(payload: TaskAttemptPayload): Promise<void> {
  await practiceDbReady;
  await practiceDb.pendingAttempts.add({
    payload,
    createdAt: Date.now(),
  });
}

async function sendAttempt(payload: TaskAttemptPayload): Promise<Response> {
  const legacyPayload = toLegacyPayload(payload);
  if (legacyPayload) {
    return fetch(LEGACY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyPayload),
    });
  }

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
