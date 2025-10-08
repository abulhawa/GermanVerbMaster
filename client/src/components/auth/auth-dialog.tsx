import { useEffect, useMemo, useState } from "react";
import { Mail, Lock, User, ShieldCheck, LogOut } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "@/locales";
import {
  type AuthSessionState,
  useSignInMutation,
  useSignOutMutation,
  useSignUpMutation,
} from "@/auth/session";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: "sign-in" | "sign-up";
  session: AuthSessionState;
  isSessionLoading?: boolean;
}

interface AuthFormState {
  email: string;
  password: string;
  name: string;
}

const INITIAL_FORM_STATE: AuthFormState = {
  email: "",
  password: "",
  name: "",
};

export function AuthDialog({ open, onOpenChange, defaultMode = "sign-in", session, isSessionLoading }: AuthDialogProps) {
  const { toast } = useToast();
  const copy = useTranslations().auth;
  const [mode, setMode] = useState<"sign-in" | "sign-up">(defaultMode);
  const [formState, setFormState] = useState<AuthFormState>(INITIAL_FORM_STATE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const signInMutation = useSignInMutation();
  const signUpMutation = useSignUpMutation();
  const signOutMutation = useSignOutMutation();
  const resetSignInMutation = signInMutation.reset;
  const resetSignUpMutation = signUpMutation.reset;
  const resetSignOutMutation = signOutMutation.reset;

  useEffect(() => {
    if (open) {
      setMode(defaultMode);
    }
  }, [defaultMode, open]);

  useEffect(() => {
    if (!open) {
      setFormState(INITIAL_FORM_STATE);
      setErrorMessage(null);
      setSuccessMessage(null);
      resetSignInMutation();
      resetSignUpMutation();
      resetSignOutMutation();
    }
  }, [open, resetSignInMutation, resetSignOutMutation, resetSignUpMutation]);

  const isSubmitting = useMemo(() => {
    if (session) {
      return signOutMutation.isPending;
    }
    return mode === "sign-in" ? signInMutation.isPending : signUpMutation.isPending;
  }, [mode, session, signInMutation.isPending, signOutMutation.isPending, signUpMutation.isPending]);

  const renderHeader = () => {
    if (session) {
      return (
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-foreground">{copy.dialog.accountTitle}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {copy.dialog.accountDescription}
          </DialogDescription>
        </DialogHeader>
      );
    }

    return (
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-foreground">
          {mode === "sign-in" ? copy.dialog.signInTitle : copy.dialog.signUpTitle}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {mode === "sign-in" ? copy.dialog.signInDescription : copy.dialog.signUpDescription}
        </DialogDescription>
      </DialogHeader>
    );
  };

  const handleFieldChange = (field: keyof AuthFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleError = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim().length > 0) {
      setErrorMessage(error.message);
      return;
    }
    setErrorMessage(fallback);
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!formState.email.trim()) {
      setErrorMessage(copy.dialog.validation.emailRequired);
      return;
    }

    if (!formState.password.trim()) {
      setErrorMessage(copy.dialog.validation.passwordRequired);
      return;
    }

    try {
      await signInMutation.mutateAsync({
        email: formState.email.trim(),
        password: formState.password,
      });
      toast({ title: copy.feedback.signInSuccess });
      onOpenChange(false);
    } catch (error) {
      handleError(error, copy.feedback.unknownError);
    }
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!formState.email.trim()) {
      setErrorMessage(copy.dialog.validation.emailRequired);
      return;
    }

    if (!formState.password.trim()) {
      setErrorMessage(copy.dialog.validation.passwordRequired);
      return;
    }

    try {
      await signUpMutation.mutateAsync({
        email: formState.email.trim(),
        password: formState.password,
        name: formState.name.trim() || undefined,
      });
      toast({ title: copy.feedback.signUpSuccess });
      setSuccessMessage(copy.dialog.verificationNotice);
      setMode("sign-in");
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
        {renderHeader()}
        {session ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm font-medium text-muted-foreground">{copy.dialog.signedInHeading}</p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {session.user.name?.trim() || session.user.email || copy.dialog.unknownUser}
              </p>
              {session.user.email && (
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
              )}
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {copy.dialog.roleLabel.replace("{role}", session.user.role)}
              </div>
              {!session.user.emailVerified ? (
                <p className="mt-3 text-sm text-warning-foreground">
                  {copy.dialog.verifyEmailReminder}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-2xl"
              onClick={handleSignOut}
              disabled={isSubmitting}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {isSubmitting ? copy.dialog.signingOutLabel : copy.dialog.signOutLabel}
            </Button>
            {errorMessage ? (
              <Alert variant="destructive" className="rounded-2xl border border-destructive/60 bg-destructive/10">
                <AlertTitle className="text-sm font-semibold">{copy.dialog.errorTitle}</AlertTitle>
                <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs value={mode} onValueChange={(value) => setMode(value as "sign-in" | "sign-up")}>
              <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/40 p-1">
                <TabsTrigger value="sign-in" className="rounded-2xl text-sm font-semibold">
                  {copy.dialog.signInTab}
                </TabsTrigger>
                <TabsTrigger value="sign-up" className="rounded-2xl text-sm font-semibold">
                  {copy.dialog.signUpTab}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="sign-in">
                <form className="space-y-4" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <Label htmlFor="auth-email" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Mail className="h-4 w-4 text-primary" aria-hidden />
                      {copy.dialog.emailLabel}
                    </Label>
                    <Input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      value={formState.email}
                      onChange={handleFieldChange("email")}
                      placeholder={copy.dialog.emailPlaceholder}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="auth-password" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Lock className="h-4 w-4 text-primary" aria-hidden />
                      {copy.dialog.passwordLabel}
                    </Label>
                    <Input
                      id="auth-password"
                      type="password"
                      autoComplete="current-password"
                      value={formState.password}
                      onChange={handleFieldChange("password")}
                      placeholder={copy.dialog.passwordPlaceholder}
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-2xl" disabled={isSubmitting}>
                    {isSubmitting ? copy.dialog.signingInLabel : copy.dialog.submitSignInLabel}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {copy.dialog.switchToSignUpPrompt}{" "}
                    <button
                      type="button"
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                      onClick={() => setMode("sign-up")}
                    >
                      {copy.dialog.switchToSignUpCta}
                    </button>
                  </p>
                </form>
              </TabsContent>
              <TabsContent value="sign-up">
                <form className="space-y-4" onSubmit={handleSignUp}>
                  <div className="space-y-2">
                    <Label htmlFor="auth-signup-name" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <User className="h-4 w-4 text-primary" aria-hidden />
                      {copy.dialog.nameLabel}
                    </Label>
                    <Input
                      id="auth-signup-name"
                      autoComplete="name"
                      value={formState.name}
                      onChange={handleFieldChange("name")}
                      placeholder={copy.dialog.namePlaceholder}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="auth-signup-email" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Mail className="h-4 w-4 text-primary" aria-hidden />
                      {copy.dialog.emailLabel}
                    </Label>
                    <Input
                      id="auth-signup-email"
                      type="email"
                      autoComplete="email"
                      value={formState.email}
                      onChange={handleFieldChange("email")}
                      placeholder={copy.dialog.emailPlaceholder}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="auth-signup-password" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Lock className="h-4 w-4 text-primary" aria-hidden />
                      {copy.dialog.passwordLabel}
                    </Label>
                    <Input
                      id="auth-signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={formState.password}
                      onChange={handleFieldChange("password")}
                      placeholder={copy.dialog.passwordPlaceholder}
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-2xl" disabled={isSubmitting}>
                    {isSubmitting ? copy.dialog.signingUpLabel : copy.dialog.submitSignUpLabel}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {copy.dialog.switchToSignInPrompt}{" "}
                    <button
                      type="button"
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                      onClick={() => setMode("sign-in")}
                    >
                      {copy.dialog.switchToSignInCta}
                    </button>
                  </p>
                </form>
              </TabsContent>
            </Tabs>
            {errorMessage ? (
              <Alert variant="destructive" className="rounded-2xl border border-destructive/60 bg-destructive/10">
                <AlertTitle className="text-sm font-semibold">{copy.dialog.errorTitle}</AlertTitle>
                <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
              </Alert>
            ) : null}
            {successMessage ? (
              <Alert className="rounded-2xl border border-primary/50 bg-primary/10 text-primary">
                <AlertTitle className="text-sm font-semibold">{copy.dialog.successTitle}</AlertTitle>
                <AlertDescription className="text-sm text-primary/90">{successMessage}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
        {isSessionLoading ? (
          <p className="text-xs text-muted-foreground">{copy.dialog.loadingStatus}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
