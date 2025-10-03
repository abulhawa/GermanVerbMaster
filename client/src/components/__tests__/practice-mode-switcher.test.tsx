/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PracticeModeSwitcher } from '@/components/practice-mode-switcher';
import type { PracticeScope } from '@/components/practice-mode-switcher';
import type { TaskType } from '@shared';

describe('PracticeModeSwitcher', () => {
  const availableTaskTypes: TaskType[] = ['conjugate_form', 'noun_case_declension', 'adj_ending'];

  function renderSwitcher({
    scope = 'all' as PracticeScope,
    selectedTaskTypes = availableTaskTypes,
  }: Partial<{ scope: PracticeScope; selectedTaskTypes: TaskType[] }> = {}) {
    const onScopeChange = vi.fn();
    const onTaskTypesChange = vi.fn();

    render(
      <PracticeModeSwitcher
        scope={scope}
        onScopeChange={onScopeChange}
        selectedTaskTypes={selectedTaskTypes}
        onTaskTypesChange={onTaskTypesChange}
        availableTaskTypes={availableTaskTypes}
      />,
    );

    return { onScopeChange, onTaskTypesChange };
  }

  it('switches scope when selecting a different segment', async () => {
    const user = userEvent.setup();
    const { onScopeChange } = renderSwitcher({ scope: 'all' });

    await user.click(screen.getByRole('tab', { name: /nouns/i }));

    expect(onScopeChange).toHaveBeenCalledWith('nouns');
  });

  it('opens custom mix dropdown and toggles task types', async () => {
    const user = userEvent.setup();
    const { onScopeChange, onTaskTypesChange } = renderSwitcher({
      scope: 'verbs',
      selectedTaskTypes: ['conjugate_form'],
    });

    await user.click(screen.getByRole('button', { name: /configure custom task mix/i }));

    const nounOption = await screen.findByRole('menuitemcheckbox', { name: /noun/i });
    await user.click(nounOption);

    expect(onScopeChange).toHaveBeenCalledWith('custom');
    expect(onTaskTypesChange).toHaveBeenCalledWith(['conjugate_form', 'noun_case_declension']);
  });
});
