import { useMemo, useState } from "react";
import { ChevronDown, LogOut, Settings2, ShieldCheck, UserCog, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { AuthDialog } from "@/components/account/auth-dialog";

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  if (name && name.trim().length) {
    const parts = name.trim().split(/\s+/);
    const [first, second] = parts;
    if (second) {
      return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
    }
    return `${first[0] ?? ""}${first[1] ?? ""}`.toUpperCase();
  }

  if (email && email.trim().length) {
    return email.slice(0, 2).toUpperCase();
  }

  return "??";
}

interface AccountMenuProps {
  debugId?: string;
}

export function AccountMenu({ debugId }: AccountMenuProps) {
  const { status, profile, role, signOut, updateDisplayName } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [saving, setSaving] = useState(false);

  const initials = useMemo(() => getInitials(profile?.displayName, profile?.email), [profile]);

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "Your session is closed. Come back soon!",
    });
  };

  const handleUpdateDisplayName = async () => {
    setSaving(true);
    try {
      await updateDisplayName(displayName);
      toast({
        title: "Profile updated",
        description: "Your display name is now synced across devices.",
      });
      setProfileDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update profile";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </Button>
    );
  }

  if (status === "unauthenticated" || !profile) {
    return <AuthDialog triggerLabel="Sign in" debugId={debugId} />;
  }

  const showAdminLink = role === "admin";

  return (
    <div className="flex items-center gap-3" data-testid="account-menu">
      <Dialog open={profileDialogOpen} onOpenChange={(open) => setProfileDialogOpen(open)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              debugId={debugId}
              variant="ghost"
              className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1"
            >
              <Avatar className="h-8 w-8 border border-border/60">
                <AvatarImage src={profile.photoURL ?? undefined} alt={profile.displayName ?? profile.email ?? "Account"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left text-sm leading-tight md:block">
                <div className="flex items-center gap-2 text-foreground">
                  <span className="font-medium">{profile.displayName ?? profile.email ?? "Account"}</span>
                  <Badge
                    variant={role === "admin" ? "default" : "secondary"}
                    className="uppercase"
                  >
                    {role}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{profile.email ?? "Signed in"}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 space-y-2" align="end">
            <DropdownMenuLabel className="text-sm text-muted-foreground">
              Signed in as {profile.email ?? "learner"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setDisplayName(profile.displayName ?? "");
                    setProfileDialogOpen(true);
                  }}
                  className="cursor-pointer gap-2"
                >
                  <UserCog className="h-4 w-4" aria-hidden />
                  Manage profile
                </DropdownMenuItem>
              </DialogTrigger>
              {showAdminLink ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    if (location !== "/admin") {
                      navigate("/admin");
                    }
                  }}
                  className="cursor-pointer gap-2"
                >
                  <Settings2 className="h-4 w-4" aria-hidden />
                  Admin settings
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void handleSignOut();
              }}
              className="cursor-pointer gap-2 text-danger"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DialogContent className="max-w-md space-y-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5" aria-hidden />
              Personal profile
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input
                id="profile-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How should we greet you?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={profile.email ?? "Not provided"} disabled />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setProfileDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleUpdateDisplayName()} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
