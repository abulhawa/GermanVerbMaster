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
    scopeBadgeLabel = 'All tasks',
  }: Partial<{ scope: PracticeScope; selectedTaskTypes: TaskType[]; scopeBadgeLabel: string }> = {}) {
    const onScopeChange = vi.fn();
    const onTaskTypesChange = vi.fn();

    render(
      <PracticeModeSwitcher
        scope={scope}
        onScopeChange={onScopeChange}
        selectedTaskTypes={selectedTaskTypes}
        onTaskTypesChange={onTaskTypesChange}
        availableTaskTypes={availableTaskTypes}
        scopeBadgeLabel={scopeBadgeLabel}
        debugId="test-practice-mode-switcher"
      />,
    );

    return { onScopeChange, onTaskTypesChange };
  }

  it('switches scope when selecting a different segment', async () => {
    const user = userEvent.setup();
    const { onScopeChange } = renderSwitcher({ scope: 'all', scopeBadgeLabel: 'All tasks' });

    await user.click(screen.getByRole('button', { name: /adjust practice scope/i }));
    await user.click(screen.getByRole('tab', { name: /nouns/i }));

    expect(onScopeChange).toHaveBeenCalledWith('nouns');
  });

  it('opens task mix flyout and toggles task types', async () => {
    const user = userEvent.setup();
    const { onScopeChange, onTaskTypesChange } = renderSwitcher({
      scope: 'verbs',
      selectedTaskTypes: ['conjugate_form'],
      scopeBadgeLabel: 'Verbs only',
    });

    await user.click(screen.getByRole('button', { name: /adjust practice scope/i }));

    const nounOption = await screen.findByRole('checkbox', { name: /noun/i });
    await user.click(nounOption);

    expect(onScopeChange).toHaveBeenCalledWith('custom');
    expect(onTaskTypesChange).toHaveBeenCalledWith(['conjugate_form', 'noun_case_declension']);
  });
});
