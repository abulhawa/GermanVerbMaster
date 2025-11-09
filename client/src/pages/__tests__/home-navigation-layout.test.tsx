/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';

import {
  createConjugationTask,
  renderHome,
  setupHomeNavigationTest,
  mockFetchPracticeTasks,
} from './home-navigation/utils';

describe('Home navigation - layout', () => {
  beforeEach(() => {
    setupHomeNavigationTest();
  });

  it('keeps the practice surface full width to prioritise the input experience', async () => {
    mockFetchPracticeTasks.mockResolvedValueOnce({
      conjugate_form: [createConjugationTask('task-1', 'arbeiten')],
    });
    mockFetchPracticeTasks.mockResolvedValue({ conjugate_form: [] });

    renderHome();

    const practiceCard = await screen.findByTestId('practice-card');
    expect(
      within(practiceCard).getByRole('heading', { name: 'arbeiten', level: 1 }),
    ).toBeInTheDocument();

    const practiceContainer = await screen.findByTestId('practice-card-container');
    expect(practiceContainer.className).toContain('w-full');
    expect(practiceContainer.className).toContain('xl:max-w-none');
    expect(practiceContainer.className).not.toContain('max-w-2xl');
  });
});
