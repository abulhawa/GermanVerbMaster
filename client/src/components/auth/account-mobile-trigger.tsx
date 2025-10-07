import { useState } from "react";
import { UserCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuthSession } from "@/auth/session";
import { useTranslations } from "@/locales";
import { AuthDialog } from "./auth-dialog";

interface AccountMobileTriggerProps {
  className?: string;
}

export function AccountMobileTrigger({ className }: AccountMobileTriggerProps) {
  const { data: session, isLoading, isFetching } = useAuthSession();
  const [open, setOpen] = useState(false);
  const copy = useTranslations().auth;

  const label = session ? copy.mobile.manageAccountLabel : copy.mobile.signInLabel;

  return (
    <>
      <button
        type="button"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-medium text-muted-foreground transition hover:text-foreground",
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        <UserCircle2 className="h-5 w-5" aria-hidden />
        <span className="text-[11px] uppercase tracking-[0.18em]">{copy.mobile.accountLabel}</span>
        <span className="mt-1 h-1 w-8 rounded-full bg-accent/40 opacity-0" aria-hidden />
      </button>
      <AuthDialog
        open={open}
        onOpenChange={setOpen}
        defaultMode="sign-in"
        session={session ?? null}
        isSessionLoading={isLoading || isFetching}
      />
    </>
  );
}
