import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, History, Loader2, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { MobileNavBar } from "@/components/layout/mobile-nav-bar";
import { getPrimaryNavigationItems } from "@/components/layout/navigation";
import { AnsweredQuestionsPanel } from "@/components/answered-questions-panel";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthSession } from "@/auth/session";

import { FilterControls } from "./answer-history/components/filter-controls";
import { SummaryCards } from "./answer-history/components/summary-cards";
import { useAnswerHistory } from "./answer-history/hooks/use-answer-history";
import { ANSWER_HISTORY_IDS } from "./answer-history/utils";

export default function AnswerHistoryPage() {
  const {
    paginatedHistory,
    totalAnswers,
    totalCorrect,
    totalIncorrect,
    accuracy,
    formattedAverageTime,
    showSkeletonStats,
    levelFilter,
    setLevelFilter,
    resultFilter,
    setResultFilter,
    resetFilters,
    activeFilters,
    hasActiveFilters,
    isLoading,
    isClearing,
    loadError,
    clearHistory,
    retryLoad,
    page,
    totalPages,
    canGoNextPage,
    canGoPreviousPage,
    goToNextPage,
    goToPreviousPage,
    levelOptions,
    resultOptions,
  } = useAnswerHistory();

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

  const paginationControls = totalPages > 1 ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/60 bg-card/85 p-4 shadow-soft shadow-primary/5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={goToPreviousPage}
        disabled={!canGoPreviousPage}
      >
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
        Previous
      </Button>
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={goToNextPage}
        disabled={!canGoNextPage}
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
      </Button>
    </div>
  ) : null;

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
                onClick={clearHistory}
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

          <SummaryCards
            sectionId={ANSWER_HISTORY_IDS.statsSection}
            totalAnswers={totalAnswers}
            totalCorrect={totalCorrect}
            totalIncorrect={totalIncorrect}
            accuracy={accuracy}
            formattedAverageTime={formattedAverageTime}
            isLoading={isLoading}
            showSkeletonStats={showSkeletonStats}
          />

          <FilterControls
            sectionId={ANSWER_HISTORY_IDS.filtersSection}
            levelOptions={levelOptions}
            resultOptions={resultOptions}
            selectedLevel={levelFilter}
            selectedResult={resultFilter}
            onLevelChange={setLevelFilter}
            onResultChange={setResultFilter}
            onResetFilters={resetFilters}
            activeFilters={activeFilters}
            hasActiveFilters={hasActiveFilters}
          />

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
                  onClick={retryLoad}
                  disabled={isLoading}
                  id={ANSWER_HISTORY_IDS.retryButton}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {isLoading && totalAnswers === 0 ? (
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
            <div className="space-y-4" id={ANSWER_HISTORY_IDS.panelSection}>
              <AnsweredQuestionsPanel
                history={paginatedHistory}
                title="Detailed answer log"
                description="Track your responses across every practice session. Each entry includes the correct forms and contextual examples so you can revise with confidence."
                emptyStateMessage="Once you start practicing, your answers will appear here with all the details you need to review."
              />
              {paginationControls}
            </div>
          )}
        </div>
      </AppShell>
    </div>
  );
}
