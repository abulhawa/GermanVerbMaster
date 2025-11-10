import { useEffect, useState } from "react";
import type { FormEventHandler, MouseEventHandler } from "react";

import type { AuthSessionState } from "@/auth/session";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "@/locales";

import {
  AuthDialogAccountPanel,
  AuthDialogForms,
  AuthDialogHeader,
  AuthDialogProviderButtons,
} from "./auth-dialog/index";
import {
  type AuthDialogMode,
  useAuthDialogForm,
} from "./use-auth-dialog-form";
import { useAuthMutations } from "./hooks/use-auth-mutation";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: AuthDialogMode;
  session: AuthSessionState;
  isSessionLoading?: boolean;
}

export function AuthDialog({ open, onOpenChange, defaultMode = "sign-in", session, isSessionLoading }: AuthDialogProps) {
  const { toast } = useToast();
  const copy = useTranslations().auth;
  const [mode, setMode] = useState<AuthDialogMode>(defaultMode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { formState, handleFieldChange, resetForm, validateSignIn, validateSignUp, validateEmailOnly } =
    useAuthDialogForm({ validation: copy.dialog.validation });

  const {
    signInMutation,
    signUpMutation,
    signOutMutation,
    resendVerificationMutation,
    requestPasswordResetMutation,
    resetAll,
    isSubmitting,
  } = useAuthMutations({ mode, session });

  useEffect(() => {
    // Reset state when dialog opens
    if (open) {
      setMode(defaultMode);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [defaultMode, open]);

  // Separate effect for cleanup to avoid race conditions
  useEffect(() => {
    return () => {
      if (!open) {
        resetForm();
        setErrorMessage(null);
        setSuccessMessage(null);
      }
    };
  }, [open, resetForm]);

  const handleError = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim().length > 0) {
      setErrorMessage(error.message);
      return;
    }
    setErrorMessage(fallback);
  };

  const handleSignIn: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = validateSignIn();
    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }

    try {
      await signInMutation.mutateAsync(result.data);
      toast({ title: copy.feedback.signInSuccess });
      onOpenChange(false);
    } catch (error) {
      handleError(error, copy.feedback.unknownError);
    }
  };

  const handleSignUp: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = validateSignUp();
    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }

    try {
      await signUpMutation.mutateAsync(result.data);
      toast({ title: copy.feedback.signUpSuccess });
      setSuccessMessage(copy.dialog.verificationNotice);
      setMode("sign-in");
    } catch (error) {
      handleError(error, copy.feedback.unknownError);
    }
  };

  const handleResendVerificationEmail: MouseEventHandler<HTMLButtonElement> = async (event) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = validateEmailOnly();
    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }

    try {
      await resendVerificationMutation.mutateAsync({ email: result.data.email });
      setSuccessMessage(copy.dialog.resendVerificationSuccess);
    } catch (error) {
      handleError(error, copy.feedback.unknownError);
    }
  };

  const handleRequestPasswordReset: MouseEventHandler<HTMLButtonElement> = async (event) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = validateEmailOnly();
    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }

    try {
      await requestPasswordResetMutation.mutateAsync({ email: result.data.email });
      setSuccessMessage(copy.dialog.forgotPasswordSuccess);
    } catch (error) {
      handleError(error, copy.feedback.unknownError);
    }
  };

  const handleSignOut = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await signOutMutation.mutateAsync();
      toast({ title: copy.feedback.signOutSuccess });
      onOpenChange(false);
    } catch (error) {
      handleError(error, copy.feedback.unknownError);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-xl space-y-6">
        <AuthDialogHeader session={session} mode={mode} copy={copy.dialog} />
        <AuthDialogProviderButtons />
        {session ? (
          <AuthDialogAccountPanel
            session={session}
            copy={copy.dialog}
            onSignOut={handleSignOut}
            isSubmitting={isSubmitting}
            errorMessage={errorMessage}
          />
        ) : (
          <AuthDialogForms
            mode={mode}
            onModeChange={setMode}
            formState={formState}
            handleFieldChange={handleFieldChange}
            isSubmitting={isSubmitting}
            copy={copy.dialog}
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
            onResendVerificationEmail={handleResendVerificationEmail}
            onRequestPasswordReset={handleRequestPasswordReset}
            resendVerificationPending={resendVerificationMutation.isPending}
            requestPasswordResetPending={requestPasswordResetMutation.isPending}
            errorMessage={errorMessage}
            successMessage={successMessage}
          />
        )}
        {isSessionLoading ? <p className="text-xs text-muted-foreground">{copy.dialog.loadingStatus}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
