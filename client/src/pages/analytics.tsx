import { Link } from "wouter";
import { BarChart3, Compass, Settings2, Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Analytics() {
  const topBar = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Analytics</p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold text-foreground lg:text-4xl">
          <BarChart3 className="h-7 w-7 text-primary" aria-hidden />
          Performance insights
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Dive into your progress trends, identify tricky verbs, and celebrate your growth with responsive dashboards.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="secondary" className="rounded-2xl px-6">
            Back to practice
          </Button>
        </Link>
        <Avatar className="h-11 w-11 border border-border/60 shadow-sm">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            LV
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Navigate
          </p>
          <div className="grid gap-2">
            <SidebarNavButton href="/" icon={Sparkles} label="Practice" exact />
            <SidebarNavButton href="/analytics" icon={Compass} label="Analytics" exact />
            <SidebarNavButton href="/admin" icon={Settings2} label="Admin tools" />
          </div>
        </div>
        <div className="rounded-3xl border border-border/60 bg-muted/40 p-5 text-sm shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
            Weekly summary
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Review streak trends, CEFR mastery, and the verbs that deserve another look in today’s session.
          </p>
        </div>
      </div>
      <div className="rounded-3xl border border-dashed border-border/60 bg-card/70 p-4 text-xs text-muted-foreground">
        Tip: Export analytics or share streak highlights directly from the dashboard.
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar} topBar={topBar}>
      <AnalyticsDashboard />
    </AppShell>
  );
}
