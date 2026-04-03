import { useCallback, useId, useMemo, useState, useEffect } from 'react';
import { Link } from 'wouter';
import { History, Loader2, PenLine } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { UserMenuControl } from '@/components/auth/user-menu-control';
import { PracticeCard, type PracticeCardResult } from '@/components/practice-card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthSession } from '@/auth/session';
import { recordTaskResult } from '@/lib/practice-progress';
import { appendAnswer, createAnswerHistoryEntry } from '@/lib/answer-history';
import { buildPracticeSessionScopeKey } from '@/lib/practice-overview';
import { usePracticeSettings } from '@/contexts/practice-settings-context';
import { queryClient } from '@/lib/queryClient';
import { fetchPracticeTasks } from '@/lib/tasks';
import type { CEFRLevel, LexemePos, TaskType } from '@shared';
import {
  PRACTICE_QUEUE_REFRESH_EVENT,
  type PracticeQueueRefreshEventDetail,
} from '@/lib/practice-queue-events';

import { PracticeHistoryCard } from '@/pages/home/components/practice-history-card';
import { QueueDiagnosticsCard } from '@/pages/home/components/queue-diagnostics-card';
import { useHomePracticeSession, type QueueReloadOptions } from '@/pages/home/use-practice-session';
import { usePracticeProgressPersistence } from '@/pages/home/hooks/use-practice-progress-persistence';
import { useAnswerHistoryPersistence } from '@/pages/home/hooks/use-answer-history-persistence';
import { useTranslations } from '@/locales';

const WRITING_SECTION_IDS = {
  page: 'writing-page',
  content: 'writing-page-content',
  practiceSection: 'writing-practice-section',
  cardContainer: 'writing-practice-card-container',
  loadingState: 'writing-practice-loading-state',
  activeCardWrapper: 'writing-active-practice-card',
  emptyState: 'writing-practice-empty-state',
  fetchError: 'writing-practice-fetch-error',
  reloadButton: 'writing-reload-button',
  retryButton: 'writing-retry-button',
  skipButton: 'writing-skip-button',
  reviewHistoryLink: 'writing-review-history-link',
  reviewHistoryButton: 'writing-review-history-button',
  levelSelect: 'writing-level-select',
} as const;

type WritingLevelFilter = 'any' | 'B1' | 'B2';

const WRITING_LEVEL_LABELS: Record<WritingLevelFilter, string> = {
  any: 'Any level',
  B1: 'B1',
  B2: 'B2',
};

const WRITING_LEVEL_QUERY: Record<WritingLevelFilter, CEFRLevel[]> = {
  any: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  B1: ['B1'],
  B2: ['B2'],
};

const WRITING_TASK_TYPES = ['b2_writing_prompt'] satisfies TaskType[];

export default function WritingPage() {
  const { settings } = usePracticeSettings();
  const authSession = useAuthSession();
  const authSessionUserId = authSession.data?.user?.id ?? null;
  const userId = authSession.status === 'pending' ? undefined : authSessionUserId;
  const [writingLevel, setWritingLevel] = useState<WritingLevelFilter>('any');

  const { setProgress } = usePracticeProgressPersistence();
  const { answerHistory, setAnswerHistory } = useAnswerHistoryPersistence();
  const [isRecapOpen, setIsRecapOpen] = useState(false);

  const translations = useTranslations();
  const historyCardMessages = translations.home.historyCard;
  const queueDiagnosticsMessages = translations.home.queueDiagnostics;
  const writingLevelLabelId = useId();

  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession.data?.user.role ?? null),
    [authSession.data?.user.role],
  );

  const activeTaskTypes = WRITING_TASK_TYPES;
  const levelOverride = useMemo(
    () => WRITING_LEVEL_QUERY[writingLevel],
    [writingLevel],
  );
  const sessionScopeKey = useMemo(
    () => `${buildPracticeSessionScopeKey(settings)}__writing__${writingLevel}`,
    [settings, writingLevel],
  );

  const resolveLevelForPos = useCallback(
    (pos: LexemePos): CEFRLevel => {
      const fallbackLevel: CEFRLevel =
        settings.cefrLevelByPos.verb ?? settings.legacyVerbLevel ?? 'A1';
      if (pos === 'verb') {
        return fallbackLevel;
      }
      return settings.cefrLevelByPos[pos] ?? fallbackLevel;
    },
    [settings.cefrLevelByPos, settings.legacyVerbLevel],
  );

  const {
    session,
    activeTask,
    pendingResult,
    isFetchingTasks,
    isInitialLoading,
    fetchError,
    hasBlockingFetchError,
    queueDiagnostics,
    registerPendingResult,
    continueToNext,
    skipActiveTask,
    requestQueueReload,
    resetFetchError,
  } = useHomePracticeSession({
    activeTaskTypes,
    sessionScopeKey,
    userId,
    resolveLevelForPos,
    levelOverride,
  });

  useEffect(() => {
    void queryClient.fetchQuery({
      queryKey: ['tasks', 'writing', activeTaskTypes, writingLevel],
      queryFn: async () => {
        try {
          return await fetchPracticeTasks({
            taskTypes: activeTaskTypes,
            limit: 6,
            level: levelOverride,
          });
        } catch {
          return [] as unknown as ReturnType<typeof fetchPracticeTasks>;
        }
      },
      staleTime: 30_000,
    }).catch(() => undefined);
  }, [activeTaskTypes, levelOverride, writingLevel]);

  const sessionCompleted = session.completed.length;
  const milestoneTarget = useMemo(() => {
    if (sessionCompleted === 0) {
      return 10;
    }
    const base = Math.ceil(sessionCompleted / 10) * 10;
    return Math.max(base, sessionCompleted + 5);
  }, [sessionCompleted]);

  const handleTaskResult = useCallback(
    (details: PracticeCardResult) => {
      setProgress((prev) =>
        recordTaskResult(prev, {
          taskId: details.task.taskId,
          lexemeId: details.task.lexemeId,
          taskType: details.task.taskType,
          result: details.result,
          practicedAt: details.answeredAt,
          cefrLevel: details.task.lexeme.metadata?.level as CEFRLevel | undefined,
        }),
      );

      setAnswerHistory((prev) => {
        const entry = createAnswerHistoryEntry({
          task: details.task,
          result: details.result,
          submittedResponse: details.submittedResponse,
          expectedResponse: details.expectedResponse,
          promptSummary: details.promptSummary,
          timeSpentMs: details.timeSpentMs,
          answeredAt: details.answeredAt,
        });
        return appendAnswer(entry, prev);
      });

      registerPendingResult(details);
    },
    [setProgress, setAnswerHistory, registerPendingResult],
  );

  const triggerQueueReload = useCallback(
    (options?: QueueReloadOptions) => {
      resetFetchError();
      requestQueueReload(options);
    },
    [requestQueueReload, resetFetchError],
  );

  const handleReloadQueue = useCallback(() => {
    triggerQueueReload();
  }, [triggerQueueReload]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleExternalQueueRefresh = (event: Event) => {
      const detail = (event as CustomEvent<PracticeQueueRefreshEventDetail>).detail;
      triggerQueueReload(detail);
    };

    window.addEventListener(PRACTICE_QUEUE_REFRESH_EVENT, handleExternalQueueRefresh);
    return () => {
      window.removeEventListener(PRACTICE_QUEUE_REFRESH_EVENT, handleExternalQueueRefresh);
    };
  }, [triggerQueueReload]);

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

  const topBarControls = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/60 bg-card/80 px-4 py-2 shadow-soft">
      <div className="flex items-center gap-3">
        <span id={writingLevelLabelId} className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Writing level
        </span>
        <Select
          value={writingLevel}
          onValueChange={(next) => setWritingLevel(next as WritingLevelFilter)}
        >
          <SelectTrigger
            aria-labelledby={writingLevelLabelId}
            className="h-12 w-36 rounded-full border border-border/60 bg-background/90 px-5 text-sm font-medium text-foreground shadow-soft"
            id={WRITING_SECTION_IDS.levelSelect}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {(Object.keys(WRITING_LEVEL_LABELS) as WritingLevelFilter[]).map((level) => (
              <SelectItem key={level} value={level}>
                {WRITING_LEVEL_LABELS[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <UserMenuControl className="w-auto flex-none" />
    </div>
  );

  return (
    <div id={WRITING_SECTION_IDS.page}>
      <AppShell
        sidebar={sidebar}
        topBarContent={topBarControls}
        mobileNav={<MobileNavBar items={navigationItems} />}
        debugId="writing-app-shell"
      >
        <div className="space-y-6" id={WRITING_SECTION_IDS.content}>
          <section className="space-y-6" id={WRITING_SECTION_IDS.practiceSection}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex flex-1 flex-col gap-6">
                <div
                  className="w-full xl:max-w-none"
                  data-testid="writing-practice-card-container"
                  id={WRITING_SECTION_IDS.cardContainer}
                >
                  <div className="mb-4 rounded-2xl border border-warning-border bg-warning-muted px-4 py-3 text-sm text-warning-muted-foreground">
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-warning-strong">
                      <PenLine className="h-3.5 w-3.5" aria-hidden />
                      Writing practice
                    </p>
                    <p className="mt-1 text-sm">
                      Practice formal German writing prompts with AI feedback. Switch level to Any, B1, or B2.
                    </p>
                  </div>

                  {isInitialLoading ? (
                    <div
                      className="flex h-[340px] items-center justify-center rounded-[28px] border border-dashed border-border/60 bg-background/70 shadow-2xl shadow-primary/15"
                      id={WRITING_SECTION_IDS.loadingState}
                    >
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : activeTask ? (
                    <div id={WRITING_SECTION_IDS.activeCardWrapper}>
                      <PracticeCard
                        key={activeTask.taskId}
                        task={activeTask}
                        settings={settings}
                        onResult={handleTaskResult}
                        onContinue={continueToNext}
                        onSkip={skipActiveTask}
                        isLoadingNext={isFetchingTasks && session.queue.length === 0}
                        debugId="writing-practice-card"
                        sessionProgress={{
                          completed: sessionCompleted,
                          target: milestoneTarget,
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-[28px] border border-border/60 bg-background/70 text-center shadow-2xl shadow-primary/10"
                      id={WRITING_SECTION_IDS.emptyState}
                    >
                      <p className="text-sm text-muted-foreground">
                        No writing tasks are queued right now. Change the level filter or reload to fetch fresh prompts.
                      </p>
                      <Button
                        variant="secondary"
                        className="rounded-full px-4"
                        onClick={handleReloadQueue}
                        id={WRITING_SECTION_IDS.reloadButton}
                      >
                        Reload tasks
                      </Button>
                    </div>
                  )}
                  {fetchError && (
                    <div
                      className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive"
                      role="alert"
                      id={WRITING_SECTION_IDS.fetchError}
                    >
                      <p className="text-center font-medium">
                        We couldn't load new writing tasks. Check your connection and try again.
                      </p>
                      {fetchError ? (
                        <p className="mt-1 text-center text-destructive/70">{fetchError}</p>
                      ) : null}
                      <div className="mt-3 flex justify-center">
                        <Button
                          variant="secondary"
                          className="rounded-full px-4"
                          onClick={handleReloadQueue}
                          id={WRITING_SECTION_IDS.retryButton}
                        >
                          Retry loading
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <aside className="flex flex-col gap-4">
                <PracticeHistoryCard
                  history={answerHistory}
                  isOpen={isRecapOpen}
                  onOpenChange={setIsRecapOpen}
                  messages={historyCardMessages}
                />
                <QueueDiagnosticsCard
                  diagnostics={queueDiagnostics}
                  isFetching={isFetchingTasks}
                  hasBlockingError={hasBlockingFetchError}
                  fetchError={fetchError}
                  messages={queueDiagnosticsMessages}
                />
              </aside>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row" id={WRITING_SECTION_IDS.reviewHistoryLink}>
              <Button
                variant="secondary"
                className="flex-1 rounded-2xl text-base sm:h-12"
                onClick={skipActiveTask}
                disabled={!activeTask || Boolean(pendingResult)}
                debugId="writing-skip-button"
                id={WRITING_SECTION_IDS.skipButton}
              >
                Skip to next
              </Button>
              <Link href="/answers" className="flex-1">
                <Button
                  variant="secondary"
                  className="w-full rounded-2xl text-base sm:h-12"
                  debugId="writing-review-history-button"
                  id={WRITING_SECTION_IDS.reviewHistoryButton}
                >
                  <History className="mr-2 h-4 w-4" aria-hidden />
                  Review answer history
                </Button>
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    </div>
  );
}
