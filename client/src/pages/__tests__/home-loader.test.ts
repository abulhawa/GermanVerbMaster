/* @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from 'vitest';

import { fetchTasksForActiveTypes } from '@/pages/home';
import type { PracticeTask } from '@/lib/tasks';
import { buildPracticeTask, resetPracticeTaskFactoryState } from './practice-task-factory';
import type { CEFRLevel, LexemePos } from '@shared';

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
  resetPracticeTaskFactoryState();
});

describe('fetchTasksForActiveTypes', () => {
  it('requests grouped tasks and preserves the configured order', async () => {
    const nounTasks = [buildPracticeTask('noun_case_declension', 1)];
    const verbTasks = [buildPracticeTask('conjugate_form', 1)];

    const fetcher = vi.fn().mockResolvedValue({
      conjugate_form: verbTasks,
      noun_case_declension: nounTasks,
    });

    const result = await fetchTasksForActiveTypes({
      taskTypes: ['conjugate_form', 'noun_case_declension'],
      perTypeLimit: 5,
      resolveLevelForPos,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith({
      taskTypes: ['conjugate_form', 'noun_case_declension'],
      limit: 5,
      level: ['A1', 'A2'],
    });
    expect(result.tasksByType).toEqual([verbTasks, nounTasks]);
    expect(result.errors).toHaveLength(0);
  });

  it('returns an error snapshot when fetching grouped tasks fails', async () => {
    const error = new Error('network failure');

    const fetcher = vi.fn().mockRejectedValueOnce(error);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await fetchTasksForActiveTypes({
      taskTypes: ['conjugate_form', 'noun_case_declension'],
      perTypeLimit: 5,
      resolveLevelForPos,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith({
      taskTypes: ['conjugate_form', 'noun_case_declension'],
      limit: 5,
      level: ['A1', 'A2'],
    });
    expect(result.tasksByType).toEqual([[], []]);
    expect(result.errors).toEqual([
      { taskType: 'conjugate_form', error },
      { taskType: 'noun_case_declension', error },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[home] Unable to fetch practice tasks',
      error,
    );
  });
});
