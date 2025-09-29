import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import type { VerbAnalytics, VerbPracticeHistory } from "@db/schema";
import { Loader2 } from "lucide-react";

export function AnalyticsDashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<VerbAnalytics[]>({
    queryKey: ["/api/analytics"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<VerbPracticeHistory[]>({
    queryKey: ["/api/practice-history"],
  });

  if (analyticsLoading || historyLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics || !history) {
    return (
      <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-sm text-muted-foreground backdrop-blur">
        No analytics available yet. Practice a few verbs to unlock insights.
      </div>
    );
  }

  // Calculate success rate over time
  const successRateData = history.reduce((acc: any[], attempt, index, array) => {
    if (index % 10 === 0) { // Group by every 10 attempts
      const slice = array.slice(index, index + 10);
      const correct = slice.filter(a => a.result === 'correct').length;
      acc.push({
        attempts: `${index + 1}-${index + 10}`,
        rate: (correct / slice.length) * 100
      });
    }
    return acc;
  }, []);

  // Calculate most challenging verbs
  const challengingVerbs = analytics
    .map(verb => ({
      verb: verb.verb,
      successRate: (verb.correctAttempts / verb.totalAttempts) * 100,
      attempts: verb.totalAttempts
    }))
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border border-white/10 bg-white/[0.05] shadow-2xl backdrop-blur">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <CardHeader className="relative z-10">
          <CardTitle className="text-xl font-semibold text-foreground">Success rate over time</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Track how your accuracy evolves with every ten practice attempts.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={successRateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="attempts" stroke="rgba(148,163,184,0.7)" tickLine={false} />
                <YAxis stroke="rgba(148,163,184,0.7)" tickLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', borderRadius: '1rem', border: '1px solid rgba(148,163,184,0.2)', color: '#e2e8f0' }} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  name="Success Rate (%)"
                  dot={{ r: 3, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border border-white/10 bg-white/[0.05] shadow-2xl backdrop-blur">
        <div className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
        <CardHeader className="relative z-10">
          <CardTitle className="text-xl font-semibold text-foreground">Most challenging verbs</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Focus your energy on the verbs with the lowest success rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={challengingVerbs}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="verb" stroke="rgba(148,163,184,0.7)" tickLine={false} />
                <YAxis stroke="rgba(148,163,184,0.7)" tickLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', borderRadius: '1rem', border: '1px solid rgba(148,163,184,0.2)', color: '#e2e8f0' }} />
                <Bar
                  dataKey="successRate"
                  fill="hsl(var(--primary))"
                  name="Success Rate (%)"
                  radius={[12, 12, 12, 12]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border border-white/10 bg-white/[0.05] shadow-2xl backdrop-blur">
        <div className="pointer-events-none absolute -left-20 bottom-0 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
        <CardHeader className="relative z-10">
          <CardTitle className="text-xl font-semibold text-foreground">Recent practice history</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            A snapshot of your latest attempts with time-on-task.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="space-y-4">
            {history.slice(0, 10).map((attempt, index) => (
              <div
                key={index}
                className={`rounded-2xl border border-white/10 p-4 backdrop-blur ${
                  attempt.result === 'correct'
                    ? 'bg-emerald-500/10 text-emerald-100'
                    : 'bg-rose-500/10 text-rose-100'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-white">{attempt.verb}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                      Mode {attempt.mode} · Level {attempt.level}
                    </p>
                  </div>
                  <div className="text-right text-xs text-white/80">
                    <p className="text-sm font-semibold">
                      {attempt.result === 'correct' ? 'Correct' : 'Incorrect'}
                    </p>
                    <p>{Math.round(attempt.timeSpent / 1000)}s</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}