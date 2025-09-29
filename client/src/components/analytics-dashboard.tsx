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
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
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
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-foreground">Success rate over time</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Track how your accuracy evolves with every ten practice attempts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={successRateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="attempts" stroke="rgba(148,163,184,0.7)" tickLine={false} />
                <YAxis stroke="rgba(148,163,184,0.7)" tickLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderRadius: '1rem',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    boxShadow: '0 12px 30px rgba(17, 24, 39, 0.12)'
                  }}
                />
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

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-foreground">Most challenging verbs</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Focus your energy on the verbs with the lowest success rate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={challengingVerbs}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="verb" stroke="rgba(148,163,184,0.7)" tickLine={false} />
                <YAxis stroke="rgba(148,163,184,0.7)" tickLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderRadius: '1rem',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    boxShadow: '0 12px 30px rgba(17, 24, 39, 0.12)'
                  }}
                />
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

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-foreground">Recent practice history</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            A snapshot of your latest attempts with time-on-task.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {history.slice(0, 10).map((attempt, index) => (
              <div
                key={index}
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  attempt.result === 'correct'
                    ? 'border-secondary/40 bg-secondary/10'
                    : 'border-destructive/50 bg-destructive/10'
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p
                      className={cn(
                        'flex items-center gap-2 text-base font-semibold',
                        attempt.result === 'incorrect' ? 'text-destructive' : 'text-foreground'
                      )}
                    >
                      {attempt.result === 'correct' ? (
                        <CheckCircle2 className="h-4 w-4 text-secondary" aria-hidden />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" aria-hidden />
                      )}
                      <span
                        className={cn(
                          attempt.result === 'incorrect'
                            ? 'underline decoration-destructive/60 underline-offset-4'
                            : undefined
                        )}
                      >
                        {attempt.verb}
                      </span>
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Mode {attempt.mode} · Level {attempt.level}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        attempt.result === 'incorrect' ? 'text-destructive' : 'text-secondary-foreground'
                      )}
                    >
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