import { useMemo, useState } from "react";
import { Loader2, LogOut, Moon, Settings2, Sun, User, Languages } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthSession, useSignOutMutation } from "@/auth/session";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { useTranslations, useLocale, type Locale } from "@/locales";
import { type ThemeSetting } from "@/lib/theme";
import { dispatchPracticeSettingsOpenEvent } from "@/lib/practice-settings-events";

interface UserMenuControlProps {
  className?: string;
}

export function UserMenuControl({ className }: UserMenuControlProps) {
  const { data: session, isLoading, isFetching } = useAuthSession();
  const signOutMutation = useSignOutMutation();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const translations = useTranslations();
  const menuCopy = translations.userMenu;
  const languageCopy = translations.languageToggle;
  const authCopy = translations.auth;

  const isSessionLoading = isLoading || isFetching;
  const isSignedIn = Boolean(session);

  const displayName = session?.user?.name?.trim() || session?.user?.email?.trim() || authCopy.dialog.unknownUser;

  const avatarInitials = useMemo(() => {
    if (session?.user?.name) {
      return session.user.name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0]!.toUpperCase())
        .slice(0, 2)
        .join("");
    }

    if (session?.user?.email) {
      return session.user.email.charAt(0).toUpperCase();
    }

    return menuCopy.unknownUserInitial;
  }, [menuCopy.unknownUserInitial, session?.user?.email, session?.user?.name]);

  const themePreference = (resolvedTheme ?? "light") as "light" | "dark";
  const nextTheme: ThemeSetting = themePreference === "dark" ? "light" : "dark";
  const themeLabel = themePreference === "dark" ? menuCopy.theme.toggleToLight : menuCopy.theme.toggleToDark;

  const handleThemeToggle = () => {
    setTheme(nextTheme);
  };

  const handleSettingsSelect = () => {
    dispatchPracticeSettingsOpenEvent();
  };

  const handleLanguageChange = (value: string) => {
    setLocale(value as Locale);
  };

  const handleSignOut = () => {
    signOutMutation.mutate();
  };

  const menuButton = isSignedIn ? (
    <DropdownMenu debugId="user-menu-control">
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-12 w-12 rounded-full border border-border/60 bg-background/95 text-foreground shadow-soft transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          aria-label={menuCopy.ariaLabel}
          disabled={isSessionLoading}
        >
          {isSessionLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Avatar className="h-9 w-9">
              {session?.user?.image ? (
                <AvatarImage src={session.user.image} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {avatarInitials}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="sr-only">{menuCopy.ariaLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={12} className="w-64">
        <DropdownMenuLabel className="px-2 pt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {authCopy.dialog.signedInHeading}
        </DropdownMenuLabel>
        <DropdownMenuLabel className="px-2 text-sm font-semibold text-foreground">
          {displayName}
        </DropdownMenuLabel>
        {session?.user?.email ? (
          <p className="px-2 pb-2 text-xs text-muted-foreground">{session.user.email}</p>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setAuthDialogOpen(true)}>
          <User className="h-4 w-4" aria-hidden />
          {menuCopy.accountLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSettingsSelect}>
          <Settings2 className="h-4 w-4" aria-hidden />
          {menuCopy.settingsLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleThemeToggle}>
          {themePreference === "dark" ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
          {themeLabel}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="h-4 w-4" aria-hidden />
            {menuCopy.languageLabel}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent alignOffset={-8} className="w-40">
            <DropdownMenuRadioGroup value={locale} onValueChange={handleLanguageChange}>
              <DropdownMenuRadioItem value="en">{languageCopy.english}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="de">{languageCopy.german}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleSignOut}
          disabled={signOutMutation.isPending}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {authCopy.dialog.signOutLabel}
          {signOutMutation.isPending ? (
            <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-hidden />
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button
      type="button"
      variant="outline"
      className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 py-2 text-sm font-semibold text-foreground shadow-soft transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => setAuthDialogOpen(true)}
      disabled={isSessionLoading}
      aria-label={menuCopy.signInLabel}
    >
      {isSessionLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      <span>{translations.auth.sidebar.signInCta}</span>
    </Button>
  );

  return (
    <>
      <div className={cn("flex w-full items-center justify-end", className)}>{menuButton}</div>
      <AuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        defaultMode="sign-in"
        session={session ?? null}
        isSessionLoading={isSessionLoading}
      />
    </>
  );
}
