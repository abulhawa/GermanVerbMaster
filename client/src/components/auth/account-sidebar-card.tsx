import { useState } from "react";
import { LogIn, UserCircle2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/auth/session";
import { useTranslations } from "@/locales";
import { AuthDialog } from "./auth-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function getInitials(value: string | null | undefined): string {
  if (!value) {
    return "GV";
  }
  const parts = value
    .split(/[\s@._-]+/)
    .filter((part) => part.trim().length > 0)
    .slice(0, 2);
  if (!parts.length) {
    return "GV";
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "GV";
}

export function AccountSidebarCard() {
  const { data: session, isLoading, isFetching } = useAuthSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultMode, setDefaultMode] = useState<"sign-in" | "sign-up">("sign-in");
  const copy = useTranslations().auth;

  const isPending = isLoading || isFetching;
  const userInitials = getInitials(session?.user.name ?? session?.user.email);

  return (
    <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-soft">
      <CardContent className="space-y-4 p-5 pt-5">
        <div className="flex items-center gap-3">
          {session ? (
            <Avatar className="h-12 w-12 border border-border/60 shadow-sm">
              {session.user.image ? (
                <AvatarImage src={session.user.image} alt={session.user.name ?? session.user.email ?? ""} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
              <UserCircle2 className="h-6 w-6" aria-hidden />
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {session ? copy.sidebar.signedInTitle : copy.sidebar.signedOutTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {session ? copy.sidebar.signedInSubtitle : copy.sidebar.signedOutSubtitle}
            </p>
          </div>
        </div>
        {session?.user.emailVerified === false ? (
          <div className="rounded-2xl border border-warning-border/50 bg-warning-muted p-3 text-sm text-warning-muted-foreground">
            {copy.sidebar.verifyReminder}
          </div>
        ) : null}
        <div className="space-y-2">
          <Button
            className="w-full rounded-2xl"
            onClick={() => {
              setDefaultMode("sign-in");
              setDialogOpen(true);
            }}
            disabled={isPending}
          >
            {session ? copy.sidebar.manageAccountCta : copy.sidebar.signInCta}
          </Button>
          {!session ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full rounded-2xl text-sm font-semibold text-primary"
              onClick={() => {
                setDefaultMode("sign-up");
                setDialogOpen(true);
              }}
              disabled={isPending}
            >
              <LogIn className="mr-2 h-4 w-4" aria-hidden />
              {copy.sidebar.createAccountCta}
            </Button>
          ) : null}
        </div>
        <AuthDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          defaultMode={defaultMode}
          session={session ?? null}
          isSessionLoading={isPending}
        />
      </CardContent>
    </Card>
  );
}
