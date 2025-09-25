import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Analytics from "@/pages/analytics";
import { useSyncQueue } from "@/hooks/use-sync-queue";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/analytics" component={Analytics} />
      <Route component={NotFound} />
    </Switch>
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