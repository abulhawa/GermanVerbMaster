import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import { LocaleProvider } from "@/locales";
import { ThemeProvider } from "next-themes";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { PracticeSettingsProvider } from "@/contexts/practice-settings-context";

const HomePage = lazy(() => import("@/pages/home"));
const AnswerHistoryPage = lazy(() => import("@/pages/answer-history"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const AdminPage = lazy(() => import("@/pages/admin"));
const AdminEnrichmentPage = lazy(() => import("@/pages/admin-enrichment"));
const UITestbedPage = lazy(() => import("@/pages/ui-testbed"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/answers" component={AnswerHistoryPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/admin/enrichment" component={AdminEnrichmentPage} />
        <Route path="/admin" component={AdminPage} />
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

