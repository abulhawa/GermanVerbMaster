import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanupSupabaseAuthUrl, getSupabaseAuthRedirectUrl } from '../supabase';

describe('Supabase auth URL helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('builds a clean localhost redirect URL while preserving the current route path', () => {
    const redirectUrl = getSupabaseAuthRedirectUrl(
      new URL('http://localhost:5000/wortschatz?code=secret#access_token=secret'),
    );

    expect(redirectUrl).toBe('http://localhost:5000/wortschatz');
  });

  it('removes Supabase token fragments without changing the app route path', () => {
    window.history.replaceState(
      { from: 'test' },
      '',
      '/wortschatz#access_token=secret&refresh_token=secret&provider_token=secret',
    );

    cleanupSupabaseAuthUrl();

    expect(window.location.pathname).toBe('/wortschatz');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual({ from: 'test' });
  });

  it('removes PKCE callback query parameters and keeps a non-auth hash', () => {
    window.history.replaceState(null, '', '/writing?code=secret&state=provider-state#section');

    cleanupSupabaseAuthUrl();

    expect(window.location.pathname).toBe('/writing');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#section');
  });
});
