import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useSyncQueue } from "@/hooks/use-sync-queue";

const HomePage = lazy(() => import("@/pages/home"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/analytics" component={AnalyticsPage} />
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
    <QueryClientProvider client={queryClient}>
      <SyncManager />
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;

