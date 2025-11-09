import type { AuthSessionState } from "@/auth/session";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AuthMessages } from "@/locales/messages";

import type { AuthDialogMode } from "../use-auth-dialog-form";

interface AuthDialogHeaderProps {
  session: AuthSessionState;
  mode: AuthDialogMode;
  copy: AuthMessages["dialog"];
}

export function AuthDialogHeader({ session, mode, copy }: AuthDialogHeaderProps) {
  if (session) {
    return (
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-foreground">{copy.accountTitle}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{copy.accountDescription}</DialogDescription>
      </DialogHeader>
    );
  }

  return (
    <DialogHeader>
      <DialogTitle className="text-xl font-semibold text-foreground">
        {mode === "sign-in" ? copy.signInTitle : copy.signUpTitle}
      </DialogTitle>
      <DialogDescription className="text-sm text-muted-foreground">
        {mode === "sign-in" ? copy.signInDescription : copy.signUpDescription}
      </DialogDescription>
    </DialogHeader>
  );
}
