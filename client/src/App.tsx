import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { LocaleProvider } from "@/locales";
import { ThemeProvider } from "next-themes";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const AdminPage = lazy(() => import("@/pages/admin"));
const AdminQuickApprovalPage = lazy(() => import("@/pages/admin-quick-approval"));
const AdminEnrichmentPage = lazy(() => import("@/pages/admin-enrichment"));
const AdminWordEditPage = lazy(() => import("@/pages/admin-word-edit"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={AdminEnrichmentPage} />
        <Route path="/admin/enrichment" component={AdminEnrichmentPage} />
        <Route path="/admin/quick-approval" component={AdminQuickApprovalPage} />
        <Route path="/admin/words/:id" component={AdminWordEditPage} />
        <Route path="/admin" component={AdminPage} />
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
          <Router />
          <Toaster />
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default App;

