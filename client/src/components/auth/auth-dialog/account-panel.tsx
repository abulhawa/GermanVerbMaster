import { LogOut, ShieldCheck } from "lucide-react";

import type { AuthSessionState } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AuthMessages } from "@/locales/messages";

interface AuthDialogAccountPanelProps {
  session: AuthSessionState;
  copy: AuthMessages["dialog"];
  onSignOut: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
}

export function AuthDialogAccountPanel({ session, copy, onSignOut, isSubmitting, errorMessage }: AuthDialogAccountPanelProps) {
  if (!session) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
        <p className="text-sm font-medium text-muted-foreground">{copy.signedInHeading}</p>
        <p className="mt-1 text-base font-semibold text-foreground">
          {session.user.name?.trim() || session.user.email || copy.unknownUser}
        </p>
        {session.user.email ? <p className="text-sm text-muted-foreground">{session.user.email}</p> : null}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {copy.roleLabel.replace("{role}", session.user.role)}
        </div>
        {!session.user.emailVerified ? (
          <p className="mt-3 text-sm text-warning-foreground">{copy.verifyEmailReminder}</p>
        ) : null}
      </div>
      <Button type="button" variant="secondary" className="w-full rounded-2xl" onClick={onSignOut} disabled={isSubmitting}>
        <LogOut className="h-4 w-4" aria-hidden />
        {isSubmitting ? copy.signingOutLabel : copy.signOutLabel}
      </Button>
      {errorMessage ? (
        <Alert variant="destructive" className="rounded-2xl border border-destructive/60 bg-destructive/10">
          <AlertTitle className="text-sm font-semibold">{copy.errorTitle}</AlertTitle>
          <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
