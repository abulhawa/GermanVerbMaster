import { getSupabaseAuthRedirectUrl, getSupabaseClient } from '@/lib/supabase';

function requireSupabaseClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

export async function signInWithGoogle() {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getSupabaseAuthRedirectUrl(),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    throw error;
  }
}

export async function signInWithMicrosoft() {
  throw new Error('Microsoft sign-in is not configured for Supabase Auth.');
}
