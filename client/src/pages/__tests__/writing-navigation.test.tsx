/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  buildPracticeTask,
  renderWritingPage,
  setupHomeNavigationTest,
  mockFetchPracticeTasks,
} from './home-navigation/utils';

describe('Writing page', () => {
  beforeEach(() => {
    setupHomeNavigationTest();
  });

  it('loads writing tasks from a dedicated route and defaults to any level', async () => {
    mockFetchPracticeTasks.mockResolvedValueOnce({
      b2_writing_prompt: [buildPracticeTask('b2_writing_prompt', 1)],
    });
    mockFetchPracticeTasks.mockResolvedValue({ b2_writing_prompt: [] });

    renderWritingPage();

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          taskTypes: ['b2_writing_prompt'],
          level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
          limit: 15,
        }),
      );
    });

    expect(await screen.findByText(/writing practice/i)).toBeInTheDocument();
  });

  it('filters writing tasks by selected level (B1 or B2)', async () => {
    mockFetchPracticeTasks.mockImplementation(async ({ level }) => {
      const currentLevel = Array.isArray(level) ? level[0] : level;
      if (currentLevel === 'B1') {
        return { b2_writing_prompt: [buildPracticeTask('b2_writing_prompt', 2)] };
      }
      if (currentLevel === 'B2') {
        return { b2_writing_prompt: [buildPracticeTask('b2_writing_prompt', 3)] };
      }
      return { b2_writing_prompt: [buildPracticeTask('b2_writing_prompt', 1)] };
    });

    renderWritingPage();

    const levelTrigger = await screen.findByRole('combobox', { name: /writing level/i });

    await userEvent.click(levelTrigger);
    await userEvent.click(await screen.findByRole('option', { name: 'B1' }));

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          taskTypes: ['b2_writing_prompt'],
          level: ['B1'],
          limit: 15,
        }),
      );
    });

    await userEvent.click(levelTrigger);
    await userEvent.click(await screen.findByRole('option', { name: 'B2' }));

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          taskTypes: ['b2_writing_prompt'],
          level: ['B2'],
          limit: 15,
        }),
      );
    });
  });

  it('reshuffles exhausted writing queues when manually reloading', async () => {
    const recycledTask = buildPracticeTask('b2_writing_prompt', 7);

    mockFetchPracticeTasks.mockImplementation(async ({ excludeTaskIds }) => {
      if (excludeTaskIds?.includes(recycledTask.taskId)) {
        return { b2_writing_prompt: [] };
      }

      return { b2_writing_prompt: [recycledTask] };
    });

    renderWritingPage();

    await screen.findByTestId('practice-card');

    const skipButton = await screen.findByRole('button', { name: /skip to next/i });
    await userEvent.click(skipButton);

    await screen.findByText(/no writing tasks are queued right now/i);

    const reloadButton = screen.getByRole('button', { name: /reload tasks/i });
    await userEvent.click(reloadButton);

    await waitFor(() => {
      expect(screen.getByTestId('practice-card')).toBeInTheDocument();
    });
  });
});
