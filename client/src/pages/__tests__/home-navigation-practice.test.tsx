/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  createConjugationTask,
  buildPracticeTask,
  renderHome,
  seedPracticeSettings,
  setupHomeNavigationTest,
  mockFetchPracticeTasks,
  MIGRATION_MARKER_KEY,
  SETTINGS_STORAGE_KEY,
} from './home-navigation/utils';

import type { PracticeSettingsState, TaskType } from '@shared';
import type { PracticeTask } from '@/lib/tasks';

describe('Home navigation - practice workflows', () => {
  beforeEach(() => {
    setupHomeNavigationTest();
  });

  it('advances to the next task when skipping', async () => {
    mockFetchPracticeTasks.mockResolvedValueOnce({
      conjugate_form: [
        createConjugationTask('task-1', 'gehen'),
        createConjugationTask('task-2', 'kommen'),
      ],
    });
    mockFetchPracticeTasks.mockResolvedValue({ conjugate_form: [] });

    renderHome();

    const practiceCard = await screen.findByTestId('practice-card');
    const initialLemma = within(practiceCard).getByRole('heading', { level: 1 }).textContent;
    expect(['gehen', 'kommen']).toContain(initialLemma);

    const skipButton = await screen.findByRole('button', { name: /skip to next/i });
    await userEvent.click(skipButton);

    await waitFor(() => {
      const updatedCard = screen.getByTestId('practice-card');
      const nextLemma = within(updatedCard).getByRole('heading', { level: 1 }).textContent;
      expect(['gehen', 'kommen']).toContain(nextLemma);
      expect(nextLemma).not.toBe(initialLemma);
    });
  });

  it('reloads practice tasks for the selected verb level', async () => {
    seedPracticeSettings();

    mockFetchPracticeTasks.mockImplementation(async ({ level }) => {
      const resolvedLevel = Array.isArray(level) ? level[0] : level;
      if (resolvedLevel === 'B2') {
        return { conjugate_form: [createConjugationTask('task-b2', 'reisen')] };
      }
      return { conjugate_form: [createConjugationTask('task-a1', 'gehen')] };
    });

    renderHome();

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({ level: ['A1'], taskTypes: ['conjugate_form'], limit: 15 }),
      );
    });

    const practiceCard = await screen.findByTestId('practice-card');
    expect(
      within(practiceCard).getByRole('heading', { name: 'gehen', level: 1 }),
    ).toBeInTheDocument();

    const levelTrigger = await screen.findByRole('combobox', { name: /verb level/i });
    await userEvent.click(levelTrigger);
    const b2Option = await screen.findByRole('option', { name: 'B2' });
    await userEvent.click(b2Option);

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({ level: ['B2'], taskTypes: ['conjugate_form'], limit: 15 }),
      );
    });

    await waitFor(() => {
      const updatedCard = screen.queryByTestId('practice-card');
      expect(updatedCard).not.toBeNull();
      expect(
        within(updatedCard!).getByRole('heading', { name: 'reisen', level: 1 }),
      ).toBeInTheDocument();
    });
  });

  it('requests tasks for each preferred task type in settings', async () => {
    seedPracticeSettings({
      preferredTaskTypes: ['conjugate_form', 'noun_case_declension'],
      defaultTaskType: 'conjugate_form',
    });

    mockFetchPracticeTasks.mockImplementation(async ({ taskTypes = [], limit = 15 }) => {
      return taskTypes.reduce((acc, type) => {
        acc[type] = Array.from({ length: limit }, (_, index) => buildPracticeTask(type, index));
        return acc;
      }, {} as Record<TaskType, PracticeTask[]>);
    });

    renderHome();

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          taskTypes: ['conjugate_form', 'noun_case_declension'],
          limit: 8,
          level: ['A1', 'A1'],
        }),
      );
    });
  });

  it('uses the verb level as the fallback for other parts of speech', async () => {
    seedPracticeSettings({
      preferredTaskTypes: ['noun_case_declension'],
      defaultTaskType: 'noun_case_declension',
      cefrLevelByPos: { verb: 'B1' },
    });

    mockFetchPracticeTasks.mockImplementation(async ({ taskTypes = [], limit = 15 }) => {
      return taskTypes.reduce((acc, type) => {
        acc[type] = Array.from({ length: limit }, (_, index) => buildPracticeTask(type, index));
        return acc;
      }, {} as Record<TaskType, PracticeTask[]>);
    });

    renderHome();

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({ taskTypes: ['noun_case_declension'], level: ['B1'] }),
      );
    });
  });

  it('keeps B2 writing on a separate tab from word tasks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    try {
      seedPracticeSettings({
        b2ExamMode: true,
        preferredTaskTypes: ['conjugate_form'],
        defaultTaskType: 'conjugate_form',
      });

      mockFetchPracticeTasks.mockImplementation(async ({ taskTypes = [], limit = 15 }) => {
        return taskTypes.reduce((acc, type) => {
          acc[type] = Array.from({ length: limit }, (_, index) => buildPracticeTask(type, index));
          return acc;
        }, {} as Record<TaskType, PracticeTask[]>);
      });

      renderHome();

      await waitFor(() => {
        expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
          expect.objectContaining({
            taskTypes: ['conjugate_form', 'adj_ending', 'noun_case_declension'],
            level: ['B1', 'B2'],
            limit: 5,
          }),
        );
      });

      expect(await screen.findByText('B2 Exam Mode')).toBeInTheDocument();
      expect(screen.getByText('Focusing on B1/B2 level tasks.')).toBeInTheDocument();
      expect(screen.getByText(/B2 in \d+ days/)).toBeInTheDocument();

      mockFetchPracticeTasks.mockClear();

      await userEvent.click(await screen.findByRole('tab', { name: /writing/i }));

      await waitFor(() => {
        expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
          expect.objectContaining({
            taskTypes: ['b2_writing_prompt'],
            level: ['B2'],
            limit: 15,
          }),
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates preferred task types when selecting a custom mix', async () => {
    seedPracticeSettings();

    mockFetchPracticeTasks.mockImplementation(async ({ taskTypes = [], limit = 15 }) => {
      return taskTypes.reduce((acc, type) => {
        acc[type] = Array.from({ length: limit }, (_, index) => buildPracticeTask(type, index));
        return acc;
      }, {} as Record<TaskType, PracticeTask[]>);
    });

    renderHome();

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalled();
    });

    mockFetchPracticeTasks.mockClear();

    const customMixButton = await screen.findByRole('button', { name: /adjust practice scope/i });
    await userEvent.click(customMixButton);
    const adjectiveCheckbox = await screen.findByLabelText(/Adjective endings/i);
    await userEvent.click(adjectiveCheckbox);

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          taskTypes: ['conjugate_form', 'adj_ending'],
          limit: 8,
        }),
      );
    });

    await waitFor(() => {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed = stored ? (JSON.parse(stored) as PracticeSettingsState) : null;
      expect(parsed?.preferredTaskTypes).toEqual(['conjugate_form', 'adj_ending']);
      expect(localStorage.getItem(MIGRATION_MARKER_KEY)).toBe('1');
    });
  });
});
