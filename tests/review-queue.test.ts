import { beforeEach, describe, expect, it } from 'vitest';
import { enqueueReviewTasks, getReviewQueue, clearReviewQueue } from '@/lib/review-queue';
import type { PracticeTaskQueueItem } from '@shared';

describe('review queue expiration', () => {
  const baseItem: PracticeTaskQueueItem = {
    taskId: 'task:base',
    lexemeId: 'lexeme:base',
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: 'conjugate_form',
    source: 'review',
    enqueuedAt: new Date().toISOString(),
    metadata: { lemma: 'laufen' },
  };

  beforeEach(() => {
    localStorage.clear();
    clearReviewQueue();
  });

  it('removes items older than 24 hours', () => {
    const staleItem: PracticeTaskQueueItem = {
      ...baseItem,
      taskId: 'task:stale',
      enqueuedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    };

    const freshItem: PracticeTaskQueueItem = {
      ...baseItem,
      taskId: 'task:fresh',
      enqueuedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    };

    enqueueReviewTasks([staleItem, freshItem], { replace: true });

    const queue = getReviewQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0]?.taskId).toBe(freshItem.taskId);
  });

  it('normalises invalid timestamps instead of dropping tasks', () => {
    const invalidItem: PracticeTaskQueueItem = {
      ...baseItem,
      taskId: 'task:invalid',
      enqueuedAt: 'not-a-date',
    };

    enqueueReviewTasks([invalidItem], { replace: true });

    const [queued] = getReviewQueue();

    expect(queued).toBeDefined();
    expect(queued?.taskId).toBe(invalidItem.taskId);
    expect(Date.parse(queued!.enqueuedAt)).not.toBeNaN();
  });
});
