import { describe, expect, it } from 'vitest';

import { getPrimaryNavigationItems, isNavigationItemActive } from '../navigation';

describe('navigation helpers', () => {
  it('adds Wortschatz without changing the existing primary navigation order', () => {
    expect(getPrimaryNavigationItems(null).map((item) => item.href)).toEqual([
      '/',
      '/writing',
      '/wortschatz',
      '/answers',
      '/analytics',
    ]);
  });

  it('treats the dedicated Wortschatz route as an exact navigation match', () => {
    expect(isNavigationItemActive('/wortschatz', { href: '/wortschatz', exact: true })).toBe(true);
    expect(isNavigationItemActive('/wortschatz/drill', { href: '/wortschatz', exact: true })).toBe(
      false,
    );
    expect(isNavigationItemActive('/answers', { href: '/wortschatz', exact: true })).toBe(false);
  });
});
