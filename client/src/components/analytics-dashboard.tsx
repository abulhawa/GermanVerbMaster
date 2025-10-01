import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Flame, TrendingUp, CheckCircle2, XCircle, Target, Lightbulb, Shuffle } from "lucide-react";
import { useLocation } from "wouter";

import type { VerbAnalytics, VerbPracticeHistory } from "@db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";
import { enqueueReviewVerbs } from "@/lib/review-queue";

const LEVELS: Array<VerbAnalytics["level"]> = ["A1", "A2", "B1", "B2", "C1", "C2"];

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function formatRelativeDays(days: number) {
  if (!Number.isFinite(days)) {
    return "Never practiced";
  }

  if (days <= 0) {
    return "Today";
  }

  if (days < 1.5) {
    return "1 day ago";
  }

  if (days < 7) {
    return `${Math.round(days)} days ago`;
  }

  const weeks = days / 7;
  if (weeks < 4) {
    const roundedWeeks = Math.round(weeks);
    return `${roundedWeeks} week${roundedWeeks === 1 ? "" : "s"} ago`;
  }

  const months = days / 30;
  const roundedMonths = Math.round(months);
  return `${roundedMonths} month${roundedMonths === 1 ? "" : "s"} ago`;
}

interface FocusRecommendation {
  verb: string;
  level: VerbAnalytics["level"];
  totalAttempts: number;
  successRate: number;
  lastPracticedDays: number;
  lastPracticedLabel: string;
  averageTimeSpent: number;
  coachingCue: string;
  focusPillars: string[];
  focusScore: number;
}

interface AnalyticsDashboardProps extends DebuggableComponentProps {}

export function AnalyticsDashboard({ debugId }: AnalyticsDashboardProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "analytics-dashboard";
  const { data: analytics, isLoading: analyticsLoading } = useQuery<VerbAnalytics[]>({
    queryKey: ["/api/analytics"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<VerbPracticeHistory[]>({
    queryKey: ["/api/practice-history"],
  });

  const loading = analyticsLoading || historyLoading;

  const [, navigate] = useLocation();

  const { streak, sparklineData, successRateData, levelStats, focusRecommendations } = useMemo(() => {
    if (!analytics || !history) {
      return {
        streak: 0,
        sparklineData: [] as Array<{ label: string; rate: number }>,
        successRateData: [] as Array<{ attempts: string; rate: number }>,
        levelStats: new Map<string, { accuracy: number; verbsPracticed: number }>(),
        focusRecommendations: [] as FocusRecommendation[],
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

    const now = Date.now();
    const focusCandidates: FocusRecommendation[] = analytics.map((verb) => {
      const successRate = verb.totalAttempts > 0 ? (verb.correctAttempts / verb.totalAttempts) * 100 : 0;
      const lastPracticedMs = verb.lastPracticedAt ? new Date(verb.lastPracticedAt).getTime() : null;
      const lastPracticedDays = lastPracticedMs ? (now - lastPracticedMs) / (1000 * 60 * 60 * 24) : Number.POSITIVE_INFINITY;
      const exposurePenalty = verb.totalAttempts >= 5 ? 0 : (5 - Math.min(verb.totalAttempts, 5)) / 5;
      const accuracyGap = 1 - successRate / 100;
      const recencyGap = Number.isFinite(lastPracticedDays) ? Math.min(lastPracticedDays / 14, 1) : 1;
      const focusScore = accuracyGap * 0.55 + recencyGap * 0.3 + exposurePenalty * 0.15;

      const averageSeconds = Math.round(verb.averageTimeSpent / 1000);
      const timeDescriptor = averageSeconds <= 0 ? "<1s avg response" : `${averageSeconds}s avg response`;
      const lastPracticedLabel = formatRelativeDays(lastPracticedDays);

      const focusPillars = [
        `Accuracy ${Math.round(successRate)}%`,
        lastPracticedLabel,
        timeDescriptor,
      ];

      let coachingCue = "Keep this verb fresh with a short focus drill.";
      if (!Number.isFinite(lastPracticedDays)) {
        coachingCue = "Introduce this verb in your next session to build a baseline.";
      } else if (successRate < 50) {
        coachingCue = "Rebuild your foundation with a focused conjugation drill.";
      } else if (successRate < 70) {
        coachingCue = "Revisit conjugations today to lift accuracy above 70%.";
      } else if (lastPracticedDays >= 10) {
        coachingCue = "It has been a while—schedule a refresher to prevent forgetting.";
      } else if (verb.totalAttempts < 3) {
        coachingCue = "Add a few more reps so spaced repetition can kick in.";
      }

      return {
        verb: verb.verb,
        level: verb.level,
        totalAttempts: verb.totalAttempts,
        successRate,
        lastPracticedDays,
        lastPracticedLabel,
        averageTimeSpent: verb.averageTimeSpent,
        coachingCue,
        focusPillars,
        focusScore,
      } satisfies FocusRecommendation;
    });

    const recommendations = focusCandidates
      .filter((item) => item.totalAttempts > 0 || !Number.isFinite(item.lastPracticedDays))
      .sort((a, b) => b.focusScore - a.focusScore)
      .slice(0, 3);

    return {
      streak: streakCount,
      sparklineData: rollingSparkline,
      successRateData: groupedHistory,
      levelStats: levelProgress,
      focusRecommendations: recommendations,
    };
  }, [analytics, history]);

  const handleReviewVerb = (verb: string) => {
    enqueueReviewVerbs([verb], { replace: true });
    navigate("/");
  };

  const handleReviewAll = () => {
    if (!focusRecommendations.length) return;

    enqueueReviewVerbs(
      focusRecommendations.map((item) => item.verb),
      { randomize: true, replace: true },
    );
    navigate("/");
  };

  if (loading) {
    return (
      <div
        {...getDevAttributes("analytics-dashboard-loading", resolvedDebugId)}
        className="flex h-64 items-center justify-center"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/40 border-t-primary" />
      </div>
    );
  }

  if (!analytics || !history) {
    return (
      <div
        {...getDevAttributes("analytics-dashboard-empty", resolvedDebugId)}
        className="rounded-3xl border border-dashed border-border bg-card/80 p-10 text-center text-sm text-muted-foreground"
      >
        No analytics available yet. Practice a few verbs to unlock insights.
      </div>
    );
  }

  return (
    <div
      {...getDevAttributes("analytics-dashboard-root", resolvedDebugId)}
      className="space-y-6"
    >
      <Card
        debugId={`${resolvedDebugId}-focus-mode-card`}
        className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Target className="h-4 w-4 text-primary" aria-hidden />
            Focus mode recommendations
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Highlighted verbs that will create the biggest gains if you review them next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {focusRecommendations.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {focusRecommendations.map((item, index) => (
                  <button
                    key={item.verb}
                    type="button"
                    onClick={() => handleReviewVerb(item.verb)}
                    className="group flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/70 p-3 text-left transition hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">
                      <span>Priority {index + 1}</span>
                      <span>{item.lastPracticedLabel}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-primary transition group-hover:text-primary" aria-hidden />
                        <p className="text-lg font-semibold text-foreground transition group-hover:text-primary">
                          {item.verb}
                        </p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                        {Math.round(item.successRate)}%
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{item.coachingCue}</p>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {item.focusPillars.map((pill) => (
                        <span
                          key={pill}
                          className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          {pill}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Tap a verb to jump straight into a focused review session.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleReviewAll}
                  disabled={!focusRecommendations.length}
                  className="rounded-2xl px-4"
                  debugId={`${resolvedDebugId}-focus-review-all-button`}
                >
                  <Shuffle className="h-4 w-4" aria-hidden />
                  Review all
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Practice a few more verbs to unlock personalised focus recommendations.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          debugId={`${resolvedDebugId}-current-streak-card`}
          className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
        >
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

        <Card
          debugId={`${resolvedDebugId}-cefr-progress-card`}
          className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
        >
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

        <Card
          debugId={`${resolvedDebugId}-accuracy-trend-card`}
          className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
        >
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

      <Card
        debugId={`${resolvedDebugId}-success-rate-card`}
        className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
      >
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

      <Card
        debugId={`${resolvedDebugId}-recent-history-card`}
        className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
      >
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
