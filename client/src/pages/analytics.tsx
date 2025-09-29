import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Link } from "wouter";

export default function Analytics() {
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.28),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(45,212,191,0.22),transparent_60%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_80px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="secondary"
                size="icon"
                className="h-11 w-11 rounded-full border border-white/10 bg-white/10 text-slate-100 transition hover:bg-white/20"
                title="Back to practice"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Analytics</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-foreground">
                <BarChart3 className="h-6 w-6 text-primary" />
                Performance insights
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Dive into your progress trends, identify tricky verbs, and celebrate your growth with beautifully responsive dashboards.
              </p>
            </div>
          </div>
        </div>

        <AnalyticsDashboard />
      </div>
    </div>
  );
}
