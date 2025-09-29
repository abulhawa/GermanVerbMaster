import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Link } from "wouter";

export default function Analytics() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="secondary"
                size="icon"
                className="h-11 w-11 rounded-full border border-border bg-background text-primary transition hover:bg-muted"
                title="Back to practice"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Analytics</p>
              <h1 className="mt-1 flex items-center gap-2 text-foreground">
                <BarChart3 className="h-6 w-6 text-primary" />
                Performance insights
              </h1>
              <p className="mt-2 max-w-xl">
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
