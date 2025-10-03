import { Link } from "wouter";
import { BarChart3 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { MobileNavBar } from "@/components/layout/mobile-nav-bar";
import { primaryNavigationItems } from "@/components/layout/navigation";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Analytics() {
  const topBar = (
    <div className="flex flex-col gap-3 transition-all group-data-[condensed=true]/header:flex-row group-data-[condensed=true]/header:items-center group-data-[condensed=true]/header:justify-between">
      <div className="space-y-1 transition-all group-data-[condensed=true]/header:space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Performance insights</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground transition-all group-data-[condensed=true]/header:text-xl">
          <BarChart3 className="h-6 w-6 text-primary" aria-hidden />
          Analytics dashboard
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground group-data-[condensed=true]/header:hidden">
          Dive into your progress trends, identify tricky verbs, and celebrate your growth with responsive dashboards.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/">
          <Button variant="secondary" className="rounded-2xl px-5">
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
            {primaryNavigationItems.map((item) => (
              <SidebarNavButton
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                exact={item.exact}
              />
            ))}
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
    <AppShell
      sidebar={sidebar}
      topBar={topBar}
      mobileNav={<MobileNavBar items={primaryNavigationItems} />}
    >
      <AnalyticsDashboard />
    </AppShell>
  );
}
