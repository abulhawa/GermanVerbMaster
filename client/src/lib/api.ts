import type { PracticeAttemptPayload } from '@shared';
import { practiceDb, type PendingAttempt } from './db';
import { getDeviceId } from './device';

const ENDPOINT = '/api/practice-history';

function withDeviceId(
  payload: Omit<PracticeAttemptPayload, 'deviceId'>,
): PracticeAttemptPayload {
  return {
    ...payload,
    deviceId: getDeviceId(),
    queuedAt: payload.queuedAt ?? new Date().toISOString(),
  };
}

async function queueAttempt(payload: PracticeAttemptPayload): Promise<void> {
  await practiceDb.pendingAttempts.add({
    payload,
    createdAt: Date.now(),
  });
}

async function sendAttempt(payload: PracticeAttemptPayload): Promise<Response> {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function submitPracticeAttempt(
  payload: Omit<PracticeAttemptPayload, 'deviceId'>,
): Promise<{ queued: boolean }>
export async function submitPracticeAttempt(
  payload: Omit<PracticeAttemptPayload, 'deviceId'>,
  options: { forceQueue?: boolean },
): Promise<{ queued: boolean }>
export async function submitPracticeAttempt(
  payload: Omit<PracticeAttemptPayload, 'deviceId'>,
  options: { forceQueue?: boolean } = {},
): Promise<{ queued: boolean }> {
  const enrichedPayload = withDeviceId(payload);

  if (options.forceQueue || typeof navigator !== 'undefined' && navigator.onLine === false) {
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
  return practiceDb.pendingAttempts.orderBy('createdAt').toArray();
}
