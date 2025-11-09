/* @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from 'vitest';

import { fetchTasksForActiveTypes } from '@/pages/home';
import type { PracticeTask, TaskType } from '@/lib/tasks';
import { clientTaskRegistry } from '@/lib/tasks';
import type { CEFRLevel, LexemePos } from '@shared';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildTask(taskType: TaskType, index: number): PracticeTask {
  const registryEntry = clientTaskRegistry[taskType];
  if (!registryEntry) {
    throw new Error(`Unknown task type: ${taskType}`);
  }

  const lemma = `${taskType}-${index}`;

  switch (taskType) {
    case 'conjugate_form':
      return {
        taskId: `${taskType}-${index}`,
        lexemeId: `lex-${taskType}-${index}`,
        taskType,
        pos: 'verb',
        renderer: registryEntry.renderer,
        prompt: {
          lemma,
          pos: 'verb',
          requestedForm: { tense: 'participle' },
          instructions: `Gib das Partizip II von „${lemma}“ an.`,
        },
        expectedSolution: { form: `${lemma}-pp` },
        queueCap: registryEntry.defaultQueueCap,
        lexeme: {
          id: `lex-${taskType}-${index}`,
          lemma,
          metadata: { level: 'A1' },
        },
        assignedAt: new Date().toISOString(),
        source: 'seed',
      } satisfies PracticeTask<'conjugate_form'>;
    case 'noun_case_declension':
      return {
        taskId: `${taskType}-${index}`,
        lexemeId: `lex-${taskType}-${index}`,
        taskType,
        pos: 'noun',
        renderer: registryEntry.renderer,
        prompt: {
          lemma,
          pos: 'noun',
          gender: 'die',
          requestedCase: 'accusative',
          requestedNumber: 'plural',
          instructions: `Bilde die Akkusativ Plural-Form von „${lemma}“.`,
        },
        expectedSolution: { form: `${lemma}e`, article: 'die' },
        queueCap: registryEntry.defaultQueueCap,
        lexeme: {
          id: `lex-${taskType}-${index}`,
          lemma,
          metadata: { level: 'A1' },
        },
        assignedAt: new Date().toISOString(),
        source: 'seed',
      } satisfies PracticeTask<'noun_case_declension'>;
    case 'adj_ending':
      return {
        taskId: `${taskType}-${index}`,
        lexemeId: `lex-${taskType}-${index}`,
        taskType,
        pos: 'adjective',
        renderer: registryEntry.renderer,
        prompt: {
          lemma,
          pos: 'adjective',
          degree: 'comparative',
          instructions: `Bilde die Komparativform von „${lemma}“.`,
        },
        expectedSolution: { form: `${lemma}er` },
        queueCap: registryEntry.defaultQueueCap,
        lexeme: {
          id: `lex-${taskType}-${index}`,
          lemma,
          metadata: { level: 'A2' },
        },
        assignedAt: new Date().toISOString(),
        source: 'seed',
      } satisfies PracticeTask<'adj_ending'>;
    default:
      throw new Error(`Unsupported task type: ${taskType}`);
  }
}

const resolveLevelForPos = (pos: LexemePos): CEFRLevel => {
  switch (pos) {
    case 'verb':
      return 'A1';
    case 'noun':
      return 'A2';
    case 'adjective':
      return 'B1';
    default:
      return 'A1';
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchTasksForActiveTypes', () => {
  it('requests tasks concurrently and preserves the configured order', async () => {
    const first = createDeferred<PracticeTask[]>();
    const second = createDeferred<PracticeTask[]>();

    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const promise = fetchTasksForActiveTypes({
      taskTypes: ['conjugate_form', 'noun_case_declension'],
      perTypeLimit: 5,
      resolveLevelForPos,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);

    const nounTasks = [buildTask('noun_case_declension', 1)];
    const verbTasks = [buildTask('conjugate_form', 1)];

    second.resolve(nounTasks);
    first.resolve(verbTasks);

    const result = await promise;
    expect(result.tasksByType).toEqual([verbTasks, nounTasks]);
    expect(result.errors).toHaveLength(0);
  });

  it('continues loading other task types when one fetch fails', async () => {
    const error = new Error('network failure');
    const successfulTasks = [buildTask('noun_case_declension', 2)];

    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(successfulTasks);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await fetchTasksForActiveTypes({
      taskTypes: ['conjugate_form', 'noun_case_declension'],
      perTypeLimit: 5,
      resolveLevelForPos,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.tasksByType).toEqual([[], successfulTasks]);
    expect(result.errors).toEqual([
      { taskType: 'conjugate_form', error },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[home] Unable to fetch conjugate_form practice tasks',
      error,
    );
  });
});
