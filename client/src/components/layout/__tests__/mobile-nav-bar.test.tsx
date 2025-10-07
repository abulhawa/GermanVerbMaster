import { forwardRef, useEffect, useMemo, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import type { LucideIcon, LucideProps } from 'lucide-react';

import { MobileNavBar } from '../mobile-nav-bar';
import type { AppNavigationItem } from '../navigation';

function MemoryRouter({ initialPath, children }: { initialPath: string; children: ReactNode }) {
  const location = useMemo(() => memoryLocation({ path: initialPath }), [initialPath]);

  useEffect(() => {
    window.history.replaceState({}, '', initialPath);
    location.navigate(initialPath, { replace: true });
  }, [initialPath, location]);

  return <Router hook={location.hook}>{children}</Router>;
}

const PracticeIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg ref={ref} data-testid="practice-icon" aria-hidden {...props} />
)) as LucideIcon;
const AnalyticsIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg ref={ref} data-testid="analytics-icon" aria-hidden {...props} />
)) as LucideIcon;

const items: AppNavigationItem[] = [
  { href: '/', label: 'Practice', icon: PracticeIcon, exact: true },
  { href: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
];

describe('MobileNavBar', () => {
  it('marks the active route using aria-current', () => {
    render(
      <MemoryRouter initialPath="/analytics">
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );

    const analyticsLink = screen.getByRole('link', { name: 'Analytics' });
    const practiceLink = screen.getByRole('link', { name: 'Practice' });

    expect(analyticsLink).toHaveAttribute('aria-current', 'page');
    expect(practiceLink).not.toHaveAttribute('aria-current');
  });

  it('updates the active indicator when navigating', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialPath="/">
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );

    const practiceLink = screen.getByRole('link', { name: 'Practice' });

    expect(practiceLink).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('link', { name: 'Analytics' }));

    const analyticsLink = screen.getByRole('link', { name: 'Analytics' });
    const practiceLinkAfterClick = screen.getByRole('link', { name: 'Practice' });

    await waitFor(() => {
      expect(analyticsLink).toHaveAttribute('aria-current', 'page');
    });

    expect(practiceLinkAfterClick).not.toHaveAttribute('aria-current');
  });

  it('renders a custom account action when provided', () => {
    render(
      <MemoryRouter initialPath="/analytics">
        <MobileNavBar items={items} accountAction={<button type="button">Account</button>} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });
});
