import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  emailVerified: boolean;
  role: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SessionInfo {
  id: string | null;
  expiresAt: string | null;
}

export interface SessionResponse {
  session: SessionInfo;
  user: SessionUser;
}

export type AuthSessionState = SessionResponse | null;

const SESSION_QUERY_KEY = ['auth', 'session'] as const;

interface EmailCredentials {
  email: string;
  password: string;
  name?: string;
}

interface EmailPayload {
  email: string;
}

function mapSupabaseUser(user: User, expiresAt?: number): SessionResponse {
  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};
  const name =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null;
  const image =
    typeof metadata.avatar_url === 'string'
      ? metadata.avatar_url
      : typeof metadata.picture === 'string'
        ? metadata.picture
        : null;
  const role = typeof appMetadata.role === 'string' ? appMetadata.role : 'standard';

  return {
    session: {
      id: user.id,
      expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    },
    user: {
      id: user.id,
      name,
      email: user.email ?? null,
      image,
      emailVerified: Boolean(user.email_confirmed_at),
      role,
      createdAt: user.created_at ?? null,
      updatedAt: user.updated_at ?? null,
    },
  };
}

async function fetchSession(): Promise<AuthSessionState> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const session = data.session;
  return session?.user ? mapSupabaseUser(session.user, session.expires_at) : null;
}

async function signInWithEmail(credentials: EmailCredentials): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    throw error;
  }
}

async function signUpWithEmail(credentials: EmailCredentials): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      data: credentials.name ? { name: credentials.name, full_name: credentials.name } : undefined,
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    throw error;
  }
}

async function signOutRequest(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

async function resendVerificationEmailRequest(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    throw error;
  }
}

async function requestPasswordResetEmail(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });

  if (error) {
    throw error;
  }
}

export function useAuthSession() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return undefined;
    }

    const { data } = supabase.auth.onAuthStateChange(() => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return useQuery<AuthSessionState, Error>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function useSignInMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, EmailCredentials>({
    mutationFn: signInWithEmail,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
    onError: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
    retry: false,
  });
}

export function useSignUpMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, EmailCredentials>({
    mutationFn: signUpWithEmail,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useSignOutMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: signOutRequest,
    onSuccess: async () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null satisfies AuthSessionState);
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useResendVerificationEmailMutation() {
  return useMutation<void, Error, EmailPayload>({
    mutationFn: async ({ email }) => resendVerificationEmailRequest(email),
  });
}

export function useRequestPasswordResetMutation() {
  return useMutation<void, Error, EmailPayload>({
    mutationFn: async ({ email }) => requestPasswordResetEmail(email),
  });
}

export function getRoleFromSession(session: AuthSessionState): string | null {
  return session?.user.role ?? null;
}

export const sessionQueryKey = SESSION_QUERY_KEY;
