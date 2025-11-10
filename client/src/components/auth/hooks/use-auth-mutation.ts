import { useCallback, useMemo } from "react";

import type { AuthSessionState } from "@/auth/session";
import {
  useRequestPasswordResetMutation,
  useResendVerificationEmailMutation,
  useSignInMutation,
  useSignOutMutation,
  useSignUpMutation,
} from "@/auth/session";

import type { AuthDialogMode } from "../use-auth-dialog-form";

export interface UseAuthMutationsConfig {
  mode: AuthDialogMode;
  session: AuthSessionState;
}

export function useAuthMutations({ mode, session }: UseAuthMutationsConfig) {
  const signInMutation = useSignInMutation();
  const signUpMutation = useSignUpMutation();
  const signOutMutation = useSignOutMutation();
  const resendVerificationMutation = useResendVerificationEmailMutation();
  const requestPasswordResetMutation = useRequestPasswordResetMutation();

  const resetAll = useCallback(() => {
    if (!signInMutation.isPending) signInMutation.reset();
    if (!signUpMutation.isPending) signUpMutation.reset();
    if (!signOutMutation.isPending) signOutMutation.reset();
    if (!resendVerificationMutation.isPending) resendVerificationMutation.reset();
    if (!requestPasswordResetMutation.isPending) requestPasswordResetMutation.reset();
  }, [
    signInMutation,
    signUpMutation,
    signOutMutation,
    resendVerificationMutation,
    requestPasswordResetMutation
  ]);

  const isSubmitting = useMemo(() => {
    if (!session) {
      return mode === "sign-in" ? signInMutation.isPending : signUpMutation.isPending;
    }
    return signOutMutation.isPending;
  }, [mode, session, signInMutation.isPending, signOutMutation.isPending, signUpMutation.isPending]);

  return {
    signInMutation,
    signUpMutation,
    signOutMutation,
    resendVerificationMutation,
    requestPasswordResetMutation,
    resetAll,
    isSubmitting,
  } as const;
}
