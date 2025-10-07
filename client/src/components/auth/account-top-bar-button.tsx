import { useState } from "react";
import { Loader2, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthSession } from "@/auth/session";
import { useTranslations } from "@/locales";

import { AuthDialog } from "./auth-dialog";

interface AccountTopBarButtonProps {
  className?: string;
}

export function AccountTopBarButton({ className }: AccountTopBarButtonProps) {
  const { data: session, isLoading, isFetching } = useAuthSession();
  const [open, setOpen] = useState(false);
  const copy = useTranslations().auth;

  const isPending = isLoading || isFetching;
  const label = session ? copy.sidebar.manageAccountCta : copy.sidebar.signInCta;
  const actionLabel = session ? copy.mobile.manageAccountLabel : copy.mobile.signInLabel;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "rounded-full border border-border/60 bg-background/90 text-sm font-semibold text-foreground shadow-soft hover:border-primary/50 hover:text-primary",
          className,
        )}
        onClick={() => setOpen(true)}
        disabled={isPending}
        aria-label={actionLabel}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <UserCircle2 className="h-4 w-4" aria-hidden />
        )}
        <span>{label}</span>
      </Button>
      <AuthDialog
        open={open}
        onOpenChange={setOpen}
        defaultMode="sign-in"
        session={session ?? null}
        isSessionLoading={isPending}
      />
    </>
  );
}
