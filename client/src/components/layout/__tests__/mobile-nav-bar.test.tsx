import { forwardRef, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import type { LucideIcon, LucideProps } from 'lucide-react';

import { MobileNavBar } from '../mobile-nav-bar';
import type { AppNavigationItem } from '../navigation';

function MemoryRouter({ initialPath, children }: { initialPath: string; children: ReactNode }) {
  const hook = () => {
    const [location, setLocation] = useState(initialPath);
    const navigate = (path: string) => {
      setLocation(path);
    };
    return [location, navigate] as [string, (path: string) => void];
  };

  return <Router hook={hook}>{children}</Router>;
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

    expect(screen.getByText('Analytics')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Practice')).not.toHaveAttribute('aria-current');
  });

  it('updates the active indicator when navigating', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialPath="/">
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Practice')).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByText('Analytics'));

    expect(screen.getByText('Analytics')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Practice')).not.toHaveAttribute('aria-current');
  });
});
