import { Lock, Mail, User } from "lucide-react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AuthMessages } from "@/locales/messages";

import type { AuthDialogMode, AuthDialogFormState } from "../use-auth-dialog-form";

interface AuthDialogFormsProps {
  mode: AuthDialogMode;
  onModeChange: (mode: AuthDialogMode) => void;
  formState: AuthDialogFormState;
  handleFieldChange: (field: keyof AuthDialogFormState) => (event: ChangeEvent<HTMLInputElement>) => void;
  isSubmitting: boolean;
  copy: AuthMessages["dialog"];
  onSignIn: (event: FormEvent<HTMLFormElement>) => void;
  onSignUp: (event: FormEvent<HTMLFormElement>) => void;
  onResendVerificationEmail: (event: MouseEvent<HTMLButtonElement>) => void;
  onRequestPasswordReset: (event: MouseEvent<HTMLButtonElement>) => void;
  resendVerificationPending: boolean;
  requestPasswordResetPending: boolean;
  errorMessage: string | null;
  successMessage: string | null;
}

export function AuthDialogForms({
  mode,
  onModeChange,
  formState,
  handleFieldChange,
  isSubmitting,
  copy,
  onSignIn,
  onSignUp,
  onResendVerificationEmail,
  onRequestPasswordReset,
  resendVerificationPending,
  requestPasswordResetPending,
  errorMessage,
  successMessage,
}: AuthDialogFormsProps) {
  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(value) => onModeChange(value as AuthDialogMode)}>
        <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/40 p-1">
          <TabsTrigger value="sign-in" className="rounded-2xl text-sm font-semibold">
            {copy.signInTab}
          </TabsTrigger>
          <TabsTrigger value="sign-up" className="rounded-2xl text-sm font-semibold">
            {copy.signUpTab}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sign-in">
          <form className="space-y-4" onSubmit={onSignIn}>
            <div className="space-y-2">
              <Label htmlFor="auth-email" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Mail className="h-4 w-4 text-primary" aria-hidden />
                {copy.emailLabel}
              </Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={formState.email}
                onChange={handleFieldChange("email")}
                placeholder={copy.emailPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="auth-password"
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
              >
                <Lock className="h-4 w-4 text-primary" aria-hidden />
                {copy.passwordLabel}
              </Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                value={formState.password}
                onChange={handleFieldChange("password")}
                placeholder={copy.passwordPlaceholder}
              />
            </div>
            <Button type="submit" className="w-full rounded-2xl" disabled={isSubmitting}>
              {isSubmitting ? copy.signingInLabel : copy.submitSignInLabel}
            </Button>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {copy.switchToSignUpPrompt}{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                  onClick={() => onModeChange("sign-up")}
                >
                  {copy.switchToSignUpCta}
                </button>
              </p>
              <p className="text-sm text-muted-foreground">
                {copy.resendVerificationPrompt}{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-60"
                  onClick={onResendVerificationEmail}
                  disabled={resendVerificationPending}
                >
                  {resendVerificationPending ? copy.resendVerificationPendingLabel : copy.resendVerificationCta}
                </button>
              </p>
              <p className="text-sm text-muted-foreground">
                {copy.forgotPasswordPrompt}{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-60"
                  onClick={onRequestPasswordReset}
                  disabled={requestPasswordResetPending}
                >
                  {requestPasswordResetPending ? copy.forgotPasswordPendingLabel : copy.forgotPasswordCta}
                </button>
              </p>
            </div>
          </form>
        </TabsContent>
        <TabsContent value="sign-up">
          <form className="space-y-4" onSubmit={onSignUp}>
            <div className="space-y-2">
              <Label
                htmlFor="auth-signup-name"
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
              >
                <User className="h-4 w-4 text-primary" aria-hidden />
                {copy.nameLabel}
              </Label>
              <Input
                id="auth-signup-name"
                autoComplete="name"
                value={formState.name}
                onChange={handleFieldChange("name")}
                placeholder={copy.namePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="auth-signup-email"
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
              >
                <Mail className="h-4 w-4 text-primary" aria-hidden />
                {copy.emailLabel}
              </Label>
              <Input
                id="auth-signup-email"
                type="email"
                autoComplete="email"
                value={formState.email}
                onChange={handleFieldChange("email")}
                placeholder={copy.emailPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="auth-signup-password"
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
              >
                <Lock className="h-4 w-4 text-primary" aria-hidden />
                {copy.passwordLabel}
              </Label>
              <Input
                id="auth-signup-password"
                type="password"
                autoComplete="new-password"
                value={formState.password}
                onChange={handleFieldChange("password")}
                placeholder={copy.passwordPlaceholder}
              />
            </div>
            <Button type="submit" className="w-full rounded-2xl" disabled={isSubmitting}>
              {isSubmitting ? copy.signingUpLabel : copy.submitSignUpLabel}
            </Button>
            <p className="text-sm text-muted-foreground">
              {copy.switchToSignInPrompt}{" "}
              <button
                type="button"
                className="font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => onModeChange("sign-in")}
              >
                {copy.switchToSignInCta}
              </button>
            </p>
          </form>
        </TabsContent>
      </Tabs>
      {errorMessage ? (
        <Alert variant="destructive" className="rounded-2xl border border-destructive/60 bg-destructive/10">
          <AlertTitle className="text-sm font-semibold">{copy.errorTitle}</AlertTitle>
          <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {successMessage ? (
        <Alert className="rounded-2xl border border-primary/50 bg-primary/10 text-primary">
          <AlertTitle className="text-sm font-semibold">{copy.successTitle}</AlertTitle>
          <AlertDescription className="text-sm text-primary/90">{successMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
