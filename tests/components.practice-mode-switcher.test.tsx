import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PracticeModeSwitcher, type PracticeScope } from '@/components/practice-mode-switcher';
import type { TaskType } from '@shared';

const AVAILABLE_TYPES: TaskType[] = ['conjugate_form', 'noun_case_declension', 'adj_ending'];

describe('PracticeModeSwitcher', () => {
  it('invokes onScopeChange when selecting nouns', async () => {
    const handleScopeChange = vi.fn<(scope: PracticeScope) => void>();
    const handleTaskTypesChange = vi.fn();

    render(
      <PracticeModeSwitcher
        scope="verbs"
        onScopeChange={handleScopeChange}
        selectedTaskTypes={['conjugate_form']}
        onTaskTypesChange={handleTaskTypesChange}
        availableTaskTypes={AVAILABLE_TYPES}
        scopeBadgeLabel="Verbs only"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /adjust practice scope/i }));
    await userEvent.click(screen.getByRole('tab', { name: /nouns/i }));

    expect(handleScopeChange).toHaveBeenCalledWith('nouns');
    expect(handleTaskTypesChange).not.toHaveBeenCalled();
  });

  it('invokes onTaskTypesChange when adjusting custom mix', async () => {
    const handleScopeChange = vi.fn();
    const handleTaskTypesChange = vi.fn<(types: TaskType[]) => void>();

    render(
      <PracticeModeSwitcher
        scope="custom"
        onScopeChange={handleScopeChange}
        selectedTaskTypes={['conjugate_form']}
        onTaskTypesChange={handleTaskTypesChange}
        availableTaskTypes={AVAILABLE_TYPES}
        scopeBadgeLabel="Custom mix"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /adjust practice scope/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /adjective endings/i }));

    expect(handleTaskTypesChange).toHaveBeenCalled();
  });

  it('renders task types in the provided order without duplicates', async () => {
    render(
      <PracticeModeSwitcher
        scope="custom"
        onScopeChange={vi.fn()}
        selectedTaskTypes={['conjugate_form', 'adj_ending']}
        onTaskTypesChange={vi.fn()}
        availableTaskTypes={['noun_case_declension', 'conjugate_form', 'adj_ending', 'conjugate_form']}
        scopeBadgeLabel="Custom mix"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /adjust practice scope/i }));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]).toHaveAccessibleName(/noun declension/i);
    expect(checkboxes[1]).toHaveAccessibleName(/verb conjugation/i);
    expect(checkboxes[2]).toHaveAccessibleName(/adjective endings/i);
  });
});
