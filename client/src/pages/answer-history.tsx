import { useEffect, useMemo, useState } from "react";
import type { CEFRLevel } from "@shared";
import { Link } from "wouter";
import { ArrowLeft, History, Loader2, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { MobileNavBar } from "@/components/layout/mobile-nav-bar";
import { getPrimaryNavigationItems } from "@/components/layout/navigation";
import { AnsweredQuestionsPanel } from "@/components/answered-questions-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AnsweredQuestion, loadAnswerHistory, saveAnswerHistory } from "@/lib/answer-history";
import { useAuthSession } from "@/auth/session";
import { clearPracticeHistory, fetchPracticeHistory } from "@/lib/api";
import { getDeviceId } from "@/lib/device";

type LevelFilter = CEFRLevel | "all";
type ResultFilter = "all" | "correct" | "incorrect";

const LEVEL_FILTERS: LevelFilter[] = ["all", "A1", "A2", "B1", "B2", "C1", "C2"];
const RESULT_FILTERS: ResultFilter[] = ["all", "correct", "incorrect"];

const ANSWER_HISTORY_IDS = {
  page: "answer-history-page",
  content: "answer-history-content",
  headerSection: "answer-history-header",
  statsSection: "answer-history-stats",
  filtersSection: "answer-history-filters",
  loadErrorAlert: "answer-history-load-error",
  skeletonSection: "answer-history-skeleton",
  panelSection: "answer-history-panel",
  backButton: "answer-history-back-button",
  clearButton: "answer-history-clear-button",
  retryButton: "answer-history-retry-button",
} as const;

function mergeAnswerLists(primary: AnsweredQuestion[], secondary: AnsweredQuestion[]): AnsweredQuestion[] {
  const seen = new Set<string>();
  const combined: AnsweredQuestion[] = [];

  for (const entry of [...primary, ...secondary]) {
    if (!entry || typeof entry.id !== "string") {
      continue;
    }
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    combined.push(entry);
  }

  return combined.sort((a, b) => {
    const aTime = Date.parse(a.answeredAt ?? "");
    const bTime = Date.parse(b.answeredAt ?? "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
      return bTime - aTime;
    }
    if (Number.isFinite(bTime)) {
      return 1;
    }
    if (Number.isFinite(aTime)) {
      return -1;
    }
    return 0;
  });
}

function formatAverageDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "—";
  }
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export default function AnswerHistoryPage() {
  const [history, setHistory] = useState<AnsweredQuestion[]>(() => loadAnswerHistory());
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshRequest, setRefreshRequest] = useState(0);

  useEffect(() => {
    saveAnswerHistory(history);
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const deviceId = getDeviceId();

    const refreshHistory = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const remoteHistory = await fetchPracticeHistory({ deviceId, limit: 150 });
        if (cancelled) {
          return;
        }
        setHistory((current) => mergeAnswerLists(remoteHistory, current));
      } catch (error) {
        if (!cancelled) {
          console.error("[answers] Failed to load practice history", error);
          const message = error instanceof Error && error.message
            ? error.message
            : "Failed to load answer history";
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void refreshHistory();
    return () => {
      cancelled = true;
    };
  }, [refreshRequest]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesLevel =
        levelFilter === "all" || item.level === levelFilter || item.cefrLevel === levelFilter;
      const matchesResult = resultFilter === "all" || item.result === resultFilter;
      return matchesLevel && matchesResult;
    });
  }, [history, levelFilter, resultFilter]);

  const totalAnswers = history.length;
  const totalCorrect = useMemo(
    () => history.filter((item) => item.result === "correct").length,
    [history],
  );
  const totalIncorrect = totalAnswers - totalCorrect;
  const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
  const totalTimeMs = useMemo(
    () => history.reduce((sum, item) => sum + (typeof item.timeSpent === "number" ? item.timeSpent : item.timeSpentMs ?? 0), 0),
    [history],
  );
  const averageTimeMs = totalAnswers > 0 ? Math.round(totalTimeMs / totalAnswers) : 0;
  const formattedAverageTime = formatAverageDuration(averageTimeMs);
  const showSkeletonStats = isLoading && history.length === 0;
  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    if (levelFilter !== "all") {
      filters.push(`Level ${levelFilter}`);
    }
    if (resultFilter !== "all") {
      filters.push(resultFilter === "correct" ? "Correct answers" : "Incorrect answers");
    }
    return filters;
  }, [levelFilter, resultFilter]);
  const hasActiveFilters = activeFilters.length > 0;

  const handleClearHistory = () => {
    if (isClearing) {
      return;
    }
    setIsClearing(true);
    setLoadError(null);
    const deviceId = getDeviceId();
    void clearPracticeHistory({ deviceId })
      .then(() => {
        setHistory([]);
      })
      .catch((error) => {
        console.error("[answers] Failed to clear history", error);
        const message = error instanceof Error && error.message
          ? error.message
          : "Failed to clear answer history";
        setLoadError(message);
      })
      .finally(() => {
        setIsClearing(false);
      });
  };

  const handleResetFilters = () => {
    setLevelFilter("all");
    setResultFilter("all");
  };

  const handleRetryLoad = () => {
    if (isLoading) {
      return;
    }
    setRefreshRequest((value) => value + 1);
  };

  const { data: authSession } = useAuthSession();
  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession?.user.role ?? null),
    [authSession?.user.role],
  );

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="grid gap-2">
            {navigationItems.map((item) => (
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
      </div>
    </div>
  );

  const filterControls = (
    <section
      className="grid gap-6 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg shadow-primary/5"
      id={ANSWER_HISTORY_IDS.filtersSection}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by level</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEVEL_FILTERS.map((option) => (
            <Button
              key={option}
              variant={option === levelFilter ? "default" : "secondary"}
              className="rounded-2xl px-4"
              type="button"
              onClick={() => setLevelFilter(option)}
            >
              {option === "all" ? "All" : option}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by result</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {RESULT_FILTERS.map((option) => (
            <Button
              key={option}
              variant={option === resultFilter ? "default" : "secondary"}
              className="rounded-2xl px-4 capitalize"
              type="button"
              onClick={() => setResultFilter(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-muted/15 p-4">
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="rounded-full border-border/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                {label}
              </Badge>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl px-3 text-xs font-semibold uppercase tracking-[0.22em]"
            onClick={handleResetFilters}
          >
            Reset filters
          </Button>
        </div>
      ) : null}
    </section>
  );

  return (
    <div id={ANSWER_HISTORY_IDS.page}>
      <AppShell
        sidebar={sidebar}
        mobileNav={<MobileNavBar items={navigationItems} />}
      >
        <div className="space-y-6" id={ANSWER_HISTORY_IDS.content}>
          <section
            className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/85 p-6 shadow-soft shadow-primary/5 sm:flex-row sm:items-center sm:justify-between"
            id={ANSWER_HISTORY_IDS.headerSection}
          >
            <div className="space-y-1">
              <h1 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-foreground">
                <History className="h-4 w-4" aria-hidden />
                Answer history
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/" id={ANSWER_HISTORY_IDS.backButton}>
                <Button variant="secondary" className="rounded-2xl px-5" id={`${ANSWER_HISTORY_IDS.backButton}-button`}>
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                  Back to practice
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={handleClearHistory}
                disabled={totalAnswers === 0 || isClearing || isLoading}
                className="rounded-2xl px-5"
                id={ANSWER_HISTORY_IDS.clearButton}
              >
                {isClearing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                )}
                {isClearing ? "Clearing…" : "Clear history"}
              </Button>
            </div>
          </section>
          <section className="grid gap-4 md:grid-cols-3" id={ANSWER_HISTORY_IDS.statsSection}>
            <div className="space-y-2 rounded-3xl border border-border/60 bg-card/85 p-5 shadow-soft shadow-primary/5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Total attempts</p>
              {showSkeletonStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-semibold text-foreground">{totalAnswers}</p>
            )}
            <p className="text-xs text-muted-foreground">Across all recorded sessions</p>
          </div>
          <div className="space-y-2 rounded-3xl border border-border/60 bg-card/85 p-5 shadow-soft shadow-primary/5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Accuracy</p>
            {showSkeletonStats ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-semibold text-foreground">{accuracy}%</p>
            )}
            <p className="text-xs text-muted-foreground">
              {totalCorrect} correct • {totalIncorrect} incorrect
            </p>
          </div>
          <div className="space-y-2 rounded-3xl border border-border/60 bg-card/85 p-5 shadow-soft shadow-primary/5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Average response time</p>
            {showSkeletonStats ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-3xl font-semibold text-foreground">{formattedAverageTime}</p>
            )}
            <p className="text-xs text-muted-foreground">Based on recent answers</p>
            </div>
          </section>
          {filterControls}
          {loadError ? (
            <Alert
              variant="destructive"
              className="rounded-3xl border border-destructive/40 bg-destructive/10"
              id={ANSWER_HISTORY_IDS.loadErrorAlert}
            >
              <AlertTitle>Unable to refresh history</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{loadError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl px-3 text-xs font-semibold uppercase tracking-[0.22em]"
                  onClick={handleRetryLoad}
                  disabled={isLoading}
                  id={ANSWER_HISTORY_IDS.retryButton}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {isLoading && history.length === 0 ? (
            <div className="space-y-4" id={ANSWER_HISTORY_IDS.skeletonSection}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-soft shadow-primary/5"
                >
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="mt-4 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div id={ANSWER_HISTORY_IDS.panelSection}>
              <AnsweredQuestionsPanel
                history={filteredHistory}
                title="Detailed answer log"
                description="Track your responses across every practice session. Each entry includes the correct forms and contextual examples so you can revise with confidence."
                emptyStateMessage="Once you start practicing, your answers will appear here with all the details you need to review."
              />
            </div>
          )}
        </div>
      </AppShell>
    </div>
  );
}

