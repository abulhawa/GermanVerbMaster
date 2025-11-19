/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';

import {
  PRACTICE_QUEUE_REFRESH_EVENT,
  dispatchPracticeQueueRefreshEvent,
  type PracticeQueueRefreshEventDetail,
} from '@/lib/practice-queue-events';

describe('practice queue events', () => {
  it('emits queue refresh events with optional detail', () => {
    const listener = vi.fn();
    window.addEventListener(PRACTICE_QUEUE_REFRESH_EVENT, listener as EventListener);

    dispatchPracticeQueueRefreshEvent({ mode: 'shuffle' });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<PracticeQueueRefreshEventDetail>;
    expect(event.detail).toEqual({ mode: 'shuffle' });

    window.removeEventListener(PRACTICE_QUEUE_REFRESH_EVENT, listener as EventListener);
  });
});
