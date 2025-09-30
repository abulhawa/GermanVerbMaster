import { Link } from "wouter";
import { BarChart3, Compass, Settings2, Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/primitives/card";
import { Section } from "@/components/primitives/section";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Analytics() {
  const topBar = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Analytics</p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold text-fg lg:text-4xl">
          <BarChart3 className="h-7 w-7 text-primary" aria-hidden />
          Performance insights
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Dive into your progress trends, identify tricky verbs, and celebrate your growth with responsive dashboards.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" tone="primary" className="rounded-2xl px-6">
          <Link href="/">
            Back to practice
          </Link>
        </Button>
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Navigate
          </p>
          <div className="grid gap-2">
            <SidebarNavButton href="/" icon={Sparkles} label="Practice" />
            <SidebarNavButton href="/analytics" icon={Compass} label="Analytics" exact />
            <SidebarNavButton href="/admin" icon={Settings2} label="Admin tools" />
          </div>
        </div>
        <Card>
          <CardHeader className="flex items-center gap-2 pb-2">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
            <CardTitle className="text-sm font-semibold text-fg">Weekly summary</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted">
            Review streak trends, CEFR mastery, and the verbs that deserve another look in today’s session.
          </CardContent>
        </Card>
      </div>
      <Card className="border-dashed">
        <CardContent className="text-xs text-muted">
          Tip: Export analytics or share streak highlights directly from the dashboard.
        </CardContent>
      </Card>
    </div>
  );

  return (
    <AppShell sidebar={sidebar} topBar={topBar}>
      <Section>
        <AnalyticsDashboard />
      </Section>
    </AppShell>
  );
}
