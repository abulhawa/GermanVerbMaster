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
    signInMutation.reset();
    signUpMutation.reset();
    signOutMutation.reset();
    resendVerificationMutation.reset();
    requestPasswordResetMutation.reset();
  }, [requestPasswordResetMutation, resendVerificationMutation, signInMutation, signOutMutation, signUpMutation]);

  const { isPending: isSignInPending } = signInMutation;
  const { isPending: isSignUpPending } = signUpMutation;
  const { isPending: isSignOutPending } = signOutMutation;

  const isSubmitting = useMemo(() => {
    if (session) {
      return isSignOutPending;
    }

    return mode === "sign-in" ? isSignInPending : isSignUpPending;
  }, [isSignInPending, isSignOutPending, isSignUpPending, mode, session]);

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
