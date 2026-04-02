import { describe, expect, it } from 'vitest';

import type { PracticeTask } from '@/lib/tasks';
import { createEmptySessionState, type LeitnerState } from '@/lib/practice-session/state';
import { __TEST_ONLY__, enqueueTasks } from '@/lib/practice-session/queue';

function buildTask(taskId: string): PracticeTask<'conjugate_form'> {
  return {
    taskId,
    lexemeId: `lex-${taskId}`,
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: 'conjugate_form',
    prompt: {
      lemma: `lemma-${taskId}`,
      pos: 'verb',
      requestedForm: {
        tense: 'present',
        mood: 'indicative',
        person: 1,
        number: 'singular',
      },
      instructions: `Conjugate ${taskId}`,
    },
    expectedSolution: { form: `answer-${taskId}` },
    queueCap: 30,
    lexeme: {
      id: `lex-${taskId}`,
      lemma: `lemma-${taskId}`,
      metadata: { level: 'B1' },
    },
    assignedAt: new Date().toISOString(),
    source: 'seed',
  } satisfies PracticeTask<'conjugate_form'>;
}

describe('practice queue shuffle behaviour', () => {
  it('enqueueTasks returns different queue orders across repeated runs most of the time', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => buildTask(`task-${index}`));
    let identicalOrders = 0;

    for (let iteration = 0; iteration < 20; iteration += 1) {
      const first = enqueueTasks(createEmptySessionState(), tasks, { replace: true }).queue.join(',');
      const second = enqueueTasks(createEmptySessionState(), tasks, { replace: true }).queue.join(',');
      if (first === second) {
        identicalOrders += 1;
      }
    }

    expect(identicalOrders).toBeLessThan(4);
  });

  it('refillQueueFromLeitner randomizes tasks within the same due step', () => {
    const leitner: LeitnerState = {
      intervals: [1, 3, 6],
      step: 4,
      seenUnique: 0,
      totalUnique: 10,
      serverExhausted: false,
      entries: Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [
          `same-step-${index}`,
          { box: 0, dueStep: 4, seen: 0 },
        ]),
      ),
    } satisfies LeitnerState;

    const observedOrders = new Set<string>();
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const result = __TEST_ONLY__.refillQueueFromLeitner([], leitner);
      observedOrders.add(result.queue.join(','));
    }

    expect(observedOrders.size).toBeGreaterThan(1);
  });

  it('always keeps lower dueStep tasks ahead of higher dueStep tasks', () => {
    const leitner: LeitnerState = {
      intervals: [1, 3, 6],
      step: 4,
      seenUnique: 0,
      totalUnique: 6,
      serverExhausted: false,
      entries: {
        'due-1-a': { box: 0, dueStep: 1, seen: 0 },
        'due-1-b': { box: 0, dueStep: 1, seen: 0 },
        'due-2-a': { box: 0, dueStep: 2, seen: 0 },
        'due-2-b': { box: 0, dueStep: 2, seen: 0 },
        'due-3-a': { box: 0, dueStep: 3, seen: 0 },
        'due-3-b': { box: 0, dueStep: 3, seen: 0 },
      },
    } satisfies LeitnerState;

    const queue = __TEST_ONLY__.refillQueueFromLeitner([], leitner).queue;
    const firstDue2Index = Math.min(queue.indexOf('due-2-a'), queue.indexOf('due-2-b'));
    const firstDue3Index = Math.min(queue.indexOf('due-3-a'), queue.indexOf('due-3-b'));
    const lastDue1Index = Math.max(queue.indexOf('due-1-a'), queue.indexOf('due-1-b'));
    const lastDue2Index = Math.max(queue.indexOf('due-2-a'), queue.indexOf('due-2-b'));

    expect(lastDue1Index).toBeLessThan(firstDue2Index);
    expect(lastDue2Index).toBeLessThan(firstDue3Index);
  });
});
