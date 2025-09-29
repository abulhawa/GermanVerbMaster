import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { Flame, TrendingUp, CheckCircle2, XCircle } from "lucide-react";

import type { VerbAnalytics, VerbPracticeHistory } from "@db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const LEVELS: Array<VerbAnalytics["level"]> = ["A1", "A2", "B1", "B2", "C1", "C2"];

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function AnalyticsDashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<VerbAnalytics[]>({
    queryKey: ["/api/analytics"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<VerbPracticeHistory[]>({
    queryKey: ["/api/practice-history"],
  });

  const loading = analyticsLoading || historyLoading;

  const { streak, sparklineData, successRateData, challengingVerbs, levelStats } = useMemo(() => {
    if (!analytics || !history) {
      return {
        streak: 0,
        sparklineData: [] as Array<{ label: string; rate: number }>,
        successRateData: [] as Array<{ attempts: string; rate: number }>,
        challengingVerbs: [] as Array<{ verb: string; successRate: number; attempts: number }>,
        levelStats: new Map<string, { accuracy: number; verbsPracticed: number }>(),
      };
    }

    const sortedHistory = [...history].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    let streakCount = 0;
    let lastDate: Date | null = null;
    for (const attempt of sortedHistory) {
      const attemptDate = normalizeDate(new Date(attempt.createdAt));
      if (!lastDate) {
        streakCount = 1;
        lastDate = attemptDate;
        continue;
      }

      const diffDays = Math.round((lastDate.getTime() - attemptDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        continue;
      }
      if (diffDays === 1) {
        streakCount += 1;
        lastDate = attemptDate;
        continue;
      }
      break;
    }

    const rollingSparkline = [...sortedHistory]
      .slice(0, 20)
      .reverse()
      .map((attempt, index, array) => {
        const slice = array.slice(0, index + 1);
        const correct = slice.filter((item) => item.result === "correct").length;
        const rate = slice.length ? Math.round((correct / slice.length) * 100) : 0;
        return {
          label: `#${index + 1}`,
          rate,
        };
      });

    const groupedHistory = sortedHistory.reduce((acc: Array<{ attempts: string; rate: number }>, attempt, index, array) => {
      if (index % 10 === 0) {
        const slice = array.slice(index, index + 10);
        const correct = slice.filter((item) => item.result === "correct").length;
        acc.push({
          attempts: `${index + 1}-${Math.min(index + 10, array.length)}`,
          rate: slice.length ? (correct / slice.length) * 100 : 0,
        });
      }
      return acc;
    }, []);

    const verbsByDifficulty = analytics
      .map((verb) => ({
        verb: verb.verb,
        successRate: verb.totalAttempts > 0 ? (verb.correctAttempts / verb.totalAttempts) * 100 : 0,
        attempts: verb.totalAttempts,
      }))
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 5);

    const levelAggregates = new Map<string, { totalAttempts: number; correctAttempts: number; verbs: Set<string> }>();
    for (const entry of analytics) {
      if (!levelAggregates.has(entry.level)) {
        levelAggregates.set(entry.level, {
          totalAttempts: 0,
          correctAttempts: 0,
          verbs: new Set<string>(),
        });
      }
      const current = levelAggregates.get(entry.level)!;
      current.totalAttempts += entry.totalAttempts;
      current.correctAttempts += entry.correctAttempts;
      current.verbs.add(entry.verb);
    }

    const levelProgress = new Map<string, { accuracy: number; verbsPracticed: number }>();
    for (const level of LEVELS) {
      const aggregate = levelAggregates.get(level);
      if (!aggregate) continue;
      const accuracy = aggregate.totalAttempts
        ? Math.round((aggregate.correctAttempts / aggregate.totalAttempts) * 100)
        : 0;
      levelProgress.set(level, {
        accuracy,
        verbsPracticed: aggregate.verbs.size,
      });
    }

    return {
      streak: streakCount,
      sparklineData: rollingSparkline,
      successRateData: groupedHistory,
      challengingVerbs: verbsByDifficulty,
      levelStats: levelProgress,
    };
  }, [analytics, history]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/40 border-t-primary" />
      </div>
    );
  }

  if (!analytics || !history) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/80 p-10 text-center text-sm text-muted-foreground">
        No analytics available yet. Practice a few verbs to unlock insights.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <Flame className="h-4 w-4 text-secondary" aria-hidden />
              Current streak
            </CardTitle>
            <CardDescription className="text-3xl font-semibold text-foreground">
              {streak} day{streak === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Keep the fire going! Each day extends your momentum and unlocks richer insights.
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              CEFR progress snapshot
            </CardTitle>
            <CardDescription>
              How accurately you respond across each level.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {LEVELS.filter((level) => levelStats.has(level)).map((level) => {
              const stats = levelStats.get(level)!;
              return (
                <div key={level} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <span>Level {level}</span>
                    <span>{stats.accuracy}%</span>
                  </div>
                  <ProgressBar value={stats.accuracy} />
                  <p className="text-xs text-muted-foreground">
                    {stats.verbsPracticed} verb{stats.verbsPracticed === 1 ? "" : "s"} tracked
                  </p>
                </div>
              );
            })}
            {!Array.from(levelStats.keys()).length && (
              <p className="text-xs text-muted-foreground">Start practicing to see level-specific metrics.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Accuracy trend
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Rolling accuracy across your latest attempts.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-foreground">Success rate over time</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Track how your accuracy evolves with every ten practice attempts.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={successRateData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="attempts" stroke="rgba(148,163,184,0.7)" tickLine={false} />
              <YAxis stroke="rgba(148,163,184,0.7)" tickLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderRadius: "1rem",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                  boxShadow: "0 12px 30px rgba(17, 24, 39, 0.12)",
                }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                name="Success Rate (%)"
                dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-foreground">Most challenging verbs</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Focus your energy on the verbs with the lowest success rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={challengingVerbs}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="verb" stroke="rgba(148,163,184,0.7)" tickLine={false} />
              <YAxis stroke="rgba(148,163,184,0.7)" tickLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderRadius: "1rem",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                  boxShadow: "0 12px 30px rgba(17, 24, 39, 0.12)",
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
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-foreground">Recent practice history</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            A snapshot of your latest attempts with time-on-task.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {history.slice(0, 10).map((attempt, index) => (
            <div
              key={index}
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                attempt.result === "correct"
                  ? "border-secondary/40 bg-secondary/10"
                  : "border-destructive/60 bg-destructive/10",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p
                    className={cn(
                      "flex items-center gap-2 text-base font-semibold",
                      attempt.result === "incorrect" ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {attempt.result === "correct" ? (
                      <CheckCircle2 className="h-4 w-4 text-secondary" aria-hidden />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" aria-hidden />
                    )}
                    <span
                      className={cn(
                        attempt.result === "incorrect"
                          ? "underline decoration-destructive/60 underline-offset-4"
                          : undefined,
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
                      "text-sm font-semibold",
                      attempt.result === "incorrect" ? "text-destructive" : "text-secondary-foreground",
                    )}
                  >
                    {attempt.result === "correct" ? "Correct" : "Incorrect"}
                  </p>
                  <p>{Math.round(attempt.timeSpent / 1000)}s</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
