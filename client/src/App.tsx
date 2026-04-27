import { Suspense, lazy, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { sessionQueryKey } from "@/auth/session";
import { getSupabaseClient } from "@/lib/supabase";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import { LocaleProvider } from "@/locales";
import { ThemeProvider } from "next-themes";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { PracticeSettingsProvider } from "@/contexts/practice-settings-context";
import { ADMIN_FEATURE_ENABLED } from "@/config/admin-feature";

const HomePage = lazy(() => import("@/pages/home"));
const WritingPage = lazy(() => import("@/pages/writing"));
const WortschatzPage = lazy(() => import("@/pages/wortschatz"));
const AnswerHistoryPage = lazy(() => import("@/pages/answer-history"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const AdminPage = ADMIN_FEATURE_ENABLED ? lazy(() => import("@/pages/admin")) : null;
const AdminEnrichmentPage = ADMIN_FEATURE_ENABLED ? lazy(() => import("@/pages/admin/enrichment")) : null;
const UITestbedPage = lazy(() => import("@/pages/ui-testbed"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/writing" component={WritingPage} />
        <Route path="/wortschatz" component={WortschatzPage} />
        <Route path="/answers" component={AnswerHistoryPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        {ADMIN_FEATURE_ENABLED && AdminEnrichmentPage ? (
          <Route path="/admin/enrichment" component={AdminEnrichmentPage} />
        ) : null}
        {ADMIN_FEATURE_ENABLED && AdminPage ? <Route path="/admin" component={AdminPage} /> : null}
        <Route path="/ui-testbed" component={UITestbedPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </Suspense>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Loading...
    </div>
  );
}

function SyncManager() {
  useSyncQueue();
  return null;
}

function App() {
  useEffect(() => {
    // Warm the auth session on app mount to reduce perceived initial latency
    void queryClient.fetchQuery({
      queryKey: sessionQueryKey,
      queryFn: async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return null;
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session?.user
          ? {
              session: {
                id: data.session.user.id,
                expiresAt: data.session.expires_at
                  ? new Date(data.session.expires_at * 1000).toISOString()
                  : null,
              },
              user: {
                id: data.session.user.id,
                name:
                  typeof data.session.user.user_metadata?.full_name === "string"
                    ? data.session.user.user_metadata.full_name
                    : typeof data.session.user.user_metadata?.name === "string"
                      ? data.session.user.user_metadata.name
                      : null,
                email: data.session.user.email ?? null,
                image:
                  typeof data.session.user.user_metadata?.avatar_url === "string"
                    ? data.session.user.user_metadata.avatar_url
                    : typeof data.session.user.user_metadata?.picture === "string"
                      ? data.session.user.user_metadata.picture
                      : null,
                emailVerified: Boolean(data.session.user.email_confirmed_at),
                role:
                  typeof data.session.user.app_metadata?.role === "string"
                    ? data.session.user.app_metadata.role
                    : "standard",
                createdAt: data.session.user.created_at ?? null,
                updatedAt: data.session.user.updated_at ?? null,
              },
            }
          : null;
      },
    }).catch(() => undefined);
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <PracticeSettingsProvider>
            <SyncManager />
            <Router />
            <Toaster />
          </PracticeSettingsProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default App;

