import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const configuredAuthSiteUrl = import.meta.env.VITE_AUTH_SITE_URL as string | undefined;

const PRODUCTION_AUTH_SITE_URL = 'https://gvm.qortxai.com';
const DEVELOPMENT_AUTH_SITE_URL = 'http://localhost:3000';
const SENSITIVE_AUTH_HASH_PARAMS = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token'];

let client: SupabaseClient | null = null;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveDefaultAuthSiteUrl(location: Location | URL = window.location): string {
  if (import.meta.env.PROD) {
    return PRODUCTION_AUTH_SITE_URL;
  }

  if (configuredAuthSiteUrl?.trim()) {
    return trimTrailingSlash(configuredAuthSiteUrl.trim());
  }

  const currentOrigin = location.origin;
  return currentOrigin.startsWith('http://localhost:') ? currentOrigin : DEVELOPMENT_AUTH_SITE_URL;
}

export function getSupabaseAuthRedirectUrl(location: Location | URL = window.location): string {
  const redirectUrl = new URL(resolveDefaultAuthSiteUrl(location));
  redirectUrl.pathname = location.pathname;
  redirectUrl.search = '';
  redirectUrl.hash = '';
  return redirectUrl.toString();
}

export function cleanupSupabaseAuthUrl(win: Window = window): void {
  const currentUrl = new URL(win.location.href);
  const hashParams = new URLSearchParams(currentUrl.hash.startsWith('#') ? currentUrl.hash.slice(1) : currentUrl.hash);
  const hasSensitiveHash = SENSITIVE_AUTH_HASH_PARAMS.some((param) => hashParams.has(param));
  const hasAuthCode = currentUrl.searchParams.has('code');

  if (!hasSensitiveHash && !hasAuthCode) {
    return;
  }

  if (hasSensitiveHash) {
    currentUrl.hash = '';
  }
  if (hasAuthCode) {
    currentUrl.search = '';
  }

  // Auth tokens must not remain visible in the URL after Supabase has processed the callback.
  win.history.replaceState(win.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) {
    return client;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
    },
  });

  return client;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function createSupabaseAuthHeaders(headers?: HeadersInit): Promise<Headers> {
  const nextHeaders = new Headers(headers);
  const token = await getSupabaseAccessToken();

  if (token && !nextHeaders.has('authorization')) {
    nextHeaders.set('authorization', `Bearer ${token}`);
  }

  return nextHeaders;
}
