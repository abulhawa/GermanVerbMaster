import { useState } from "react";
import { LogIn, Mail, UserPlus, UserCircle, Loader2, Shield } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/auth-context";

interface AuthDialogProps {
  triggerLabel?: string;
  debugId?: string;
}

export function AuthDialog({ triggerLabel = "Sign in", debugId }: AuthDialogProps) {
  const {
    signInWithEmail,
    registerWithEmail,
    signInWithGoogle,
    signInWithMicrosoft,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"sign-in" | "create-account">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setError(null);
    setTab("sign-in");
  };

  const handleClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      setOpen(false);
      resetForm();
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Unable to sign in";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      await registerWithEmail(email, password, displayName);
      setOpen(false);
      resetForm();
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Unable to create account";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleProvider = async (provider: "google" | "microsoft") => {
    setLoading(true);
    setError(null);
    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else {
        await signInWithMicrosoft();
      }
      setOpen(false);
      resetForm();
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Unable to sign in";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button debugId={debugId} variant="outline" size="sm" className="gap-2">
          <LogIn className="h-4 w-4" aria-hidden />
          <span>{triggerLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md space-y-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <UserCircle className="h-5 w-5" aria-hidden />
            <span>Access your learning cloud</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Sign in to sync your progress and preferences across devices. All accounts start as
            <span className="mx-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Shield className="h-3 w-3" aria-hidden /> standard
            </span>
            learners.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4">
          <Button
            type="button"
            variant="secondary"
            className="w-full gap-2"
            onClick={() => void handleProvider("google")}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full gap-2"
            onClick={() => void handleProvider("microsoft")}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            Continue with Microsoft
          </Button>
        </div>

        <div className="space-y-4 rounded-app border border-border/60 bg-card/60 p-4">
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="sign-in" className="gap-2">
                <LogIn className="h-4 w-4" aria-hidden />
                Email sign in
              </TabsTrigger>
              <TabsTrigger value="create-account" className="gap-2">
                <UserPlus className="h-4 w-4" aria-hidden />
                Create account
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sign-in" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => void handleSignIn()}
                disabled={loading || !email || !password}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
                <span>Sign in</span>
              </Button>
            </TabsContent>
            <TabsContent value="create-account" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-name">Display name</Label>
                <Input
                  id="register-name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Maria M." 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a strong password"
                />
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => void handleCreateAccount()}
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden />
                )}
                <span>Create account</span>
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
