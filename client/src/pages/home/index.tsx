import { useCallback, useId, useMemo, useState, useEffect } from 'react';
import { Link } from 'wouter';
import { History, Loader2 } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { PracticeCard, type PracticeCardResult } from '@/components/practice-card';
import type { PracticeScope } from '@/components/practice-mode-switcher';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/auth/session';
import { updateCefrLevel, updatePreferredTaskTypes } from '@/lib/practice-settings';
import { recordTaskResult } from '@/lib/practice-progress';
import { appendAnswer, createAnswerHistoryEntry } from '@/lib/answer-history';
import {
  AVAILABLE_TASK_TYPES,
  SCOPE_LABELS,
  computeScope,
  buildPracticeSessionScopeKey,
  getVerbLevel,
  normalisePreferredTaskTypes,
  scopeToTaskTypes,
} from '@/lib/practice-overview';
import { useTranslations } from '@/locales';
import { usePracticeSettings } from '@/contexts/practice-settings-context';
import { queryClient } from '@/lib/queryClient';
import { fetchPracticeTasks } from '@/lib/tasks';
import type { CEFRLevel, TaskType, LexemePos } from '@shared';

import { PracticeSettingsPanel } from './components/practice-settings-panel';
import { PracticeHistoryCard } from './components/practice-history-card';
import { QueueDiagnosticsCard } from './components/queue-diagnostics-card';
import { useHomePracticeSession } from './use-practice-session';
import { usePracticeProgressPersistence } from './hooks/use-practice-progress-persistence';
import { useAnswerHistoryPersistence } from './hooks/use-answer-history-persistence';

export { fetchTasksForActiveTypes } from './use-practice-session';

const HOME_SECTION_IDS = {
  page: 'home-page',
  content: 'home-page-content',
  practiceSection: 'home-practice-section',
  modeSwitcher: 'home-practice-mode-switcher',
  cardContainer: 'home-practice-card-container',
  loadingState: 'home-practice-loading-state',
  activeCardWrapper: 'home-active-practice-card',
  emptyState: 'home-practice-empty-state',
  fetchError: 'home-practice-fetch-error',
  reloadButton: 'home-reload-button',
  retryButton: 'home-retry-button',
  skipButton: 'home-skip-button',
  reviewHistoryLink: 'home-review-history-link',
  reviewHistoryButton: 'home-review-history-button',
} as const;

export default function Home() {
  const { settings, updateSettings } = usePracticeSettings();
  const sessionScopeKey = useMemo(() => buildPracticeSessionScopeKey(settings), [settings]);
  const authSession = useAuthSession();
  const authSessionUserId = authSession.data?.user?.id ?? null;
  const userId = authSession.status === 'pending' ? undefined : authSessionUserId;

  const { setProgress } = usePracticeProgressPersistence();
  const { answerHistory, setAnswerHistory } = useAnswerHistoryPersistence();
  const [isRecapOpen, setIsRecapOpen] = useState(false);

  const translations = useTranslations();
  const homeTopBarCopy = translations.home.topBar;
  const historyCardMessages = translations.home.historyCard;
  const queueDiagnosticsMessages = translations.home.queueDiagnostics;

  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession.data?.user.role ?? null),
    [authSession.data?.user.role],
  );

  const scope = computeScope(settings);
  const activeTaskTypes = useMemo(() => {
    const preferred = settings.preferredTaskTypes.length
      ? settings.preferredTaskTypes
      : [settings.defaultTaskType];
    return normalisePreferredTaskTypes(preferred);
  }, [settings.preferredTaskTypes, settings.defaultTaskType]);
  const verbLevel = getVerbLevel(settings);
  const verbLevelLabelId = useId();

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
    reloadQueue,
    resetFetchError,
  } = useHomePracticeSession({
    activeTaskTypes,
    sessionScopeKey,
    userId,
    resolveLevelForPos,
  });

  useEffect(() => {
    // Prefetch a small set of tasks for the current active types to warm the feed and reduce
    // latency when the practice card requests tasks for the first time.
    void queryClient.fetchQuery({
      queryKey: ['tasks', 'home', activeTaskTypes],
      queryFn: async () => {
        try {
          // limit small to avoid excessive network usage
          return await fetchPracticeTasks({ taskTypes: activeTaskTypes, limit: 6 });
        } catch (e) {
          return [] as unknown as ReturnType<typeof fetchPracticeTasks>;
        }
      },
      staleTime: 30_000,
    }).catch(() => undefined);
  }, [activeTaskTypes]);

  const sessionCompleted = session.completed.length;
  const milestoneTarget = useMemo(() => {
    if (sessionCompleted === 0) {
      return 10;
    }
    const base = Math.ceil(sessionCompleted / 10) * 10;
    return Math.max(base, sessionCompleted + 5);
  }, [sessionCompleted]);
  const scopeBadgeLabel = scope === 'custom'
    ? `${SCOPE_LABELS[scope]} (${activeTaskTypes.length})`
    : SCOPE_LABELS[scope];

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

  const handleScopeChange = useCallback(
    (nextScope: PracticeScope) => {
      const nextTypes = scopeToTaskTypes(nextScope);
      if (nextScope !== 'custom' && nextTypes.length > 0) {
        updateSettings((prev) => {
          const current = normalisePreferredTaskTypes(
            prev.preferredTaskTypes.length ? prev.preferredTaskTypes : [prev.defaultTaskType],
          );
          const normalisedNext = normalisePreferredTaskTypes(nextTypes);
          const unchanged =
            current.length === normalisedNext.length && current.every((value, index) => value === normalisedNext[index]);
          if (unchanged) {
            return prev;
          }
          return updatePreferredTaskTypes(prev, normalisedNext);
        });
      }
      if (nextScope !== scope) {
        requestQueueReload();
      }
    },
    [scope, updateSettings, requestQueueReload],
  );

  const handleCustomTaskTypesChange = useCallback(
    (taskTypes: TaskType[]) => {
      if (!taskTypes.length) {
        return;
      }
      updateSettings((prev) => updatePreferredTaskTypes(prev, normalisePreferredTaskTypes(taskTypes)));
      requestQueueReload();
    },
    [updateSettings, requestQueueReload],
  );

  const handleVerbLevelChange = useCallback(
    (level: CEFRLevel) => {
      let didChangeLevel = false;
      updateSettings((prev) => {
        const currentLevel = getVerbLevel(prev);
        if (currentLevel === level) {
          return prev;
        }
        didChangeLevel = true;
        return updateCefrLevel(prev, { pos: 'verb', level });
      });
      if (didChangeLevel) {
        requestQueueReload();
      }
    },
    [requestQueueReload, updateSettings],
  );

  const handleReloadQueue = useCallback(() => {
    resetFetchError();
    void reloadQueue();
  }, [reloadQueue, resetFetchError]);

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
    <PracticeSettingsPanel
      scope={scope}
      scopeBadgeLabel={scopeBadgeLabel}
      activeTaskTypes={activeTaskTypes}
      availableTaskTypes={AVAILABLE_TASK_TYPES}
      verbLevel={verbLevel}
      verbLevelLabelId={verbLevelLabelId}
      modeSwitcherId={HOME_SECTION_IDS.modeSwitcher}
      levelLabel={homeTopBarCopy.levelLabel}
      onScopeChange={handleScopeChange}
      onTaskTypesChange={handleCustomTaskTypesChange}
      onVerbLevelChange={handleVerbLevelChange}
    />
  );

  return (
    <div id={HOME_SECTION_IDS.page}>
      <AppShell
        sidebar={sidebar}
        topBarContent={topBarControls}
        mobileNav={<MobileNavBar items={navigationItems} />}
        debugId="home-app-shell"
      >
        <div className="space-y-6" id={HOME_SECTION_IDS.content}>
          <section className="space-y-6" id={HOME_SECTION_IDS.practiceSection}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex flex-1 flex-col gap-6">
                <div
                  className="w-full xl:max-w-none"
                  data-testid="practice-card-container"
                  id={HOME_SECTION_IDS.cardContainer}
                >
                  {isInitialLoading ? (
                    <div
                      className="flex h-[340px] items-center justify-center rounded-[28px] border border-dashed border-border/60 bg-background/70 shadow-2xl shadow-primary/15"
                      id={HOME_SECTION_IDS.loadingState}
                    >
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : activeTask ? (
                    <div id={HOME_SECTION_IDS.activeCardWrapper}>
                      {session.isReviewSession ? (
                        <div className="mb-4 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em]">
                            {translations.home.reviewBanner.title}
                          </p>
                          <p className="mt-1 text-sm">{translations.home.reviewBanner.description}</p>
                        </div>
                      ) : null}
                      <PracticeCard
                        key={activeTask.taskId}
                        task={activeTask}
                        settings={settings}
                        onResult={handleTaskResult}
                        onContinue={continueToNext}
                        onSkip={skipActiveTask}
                        isLoadingNext={isFetchingTasks && session.queue.length === 0}
                        debugId="home-practice-card"
                        sessionProgress={{
                          completed: sessionCompleted,
                          target: milestoneTarget,
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-[28px] border border-border/60 bg-background/70 text-center shadow-2xl shadow-primary/10"
                      id={HOME_SECTION_IDS.emptyState}
                    >
                      <p className="text-sm text-muted-foreground">
                        No tasks are queued right now. Adjust your practice scope or reload to fetch fresh prompts.
                      </p>
                      <Button
                        variant="secondary"
                        className="rounded-full px-4"
                        onClick={handleReloadQueue}
                        id={HOME_SECTION_IDS.reloadButton}
                      >
                        Reload tasks
                      </Button>
                    </div>
                  )}
                  {fetchError && (
                    <div
                      className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive"
                      role="alert"
                      id={HOME_SECTION_IDS.fetchError}
                    >
                      <p className="text-center font-medium">
                        We couldn't load new tasks. Check your connection or adjust your practice scope, then try again.
                      </p>
                      {fetchError ? (
                        <p className="mt-1 text-center text-destructive/70">{fetchError}</p>
                      ) : null}
                      <div className="mt-3 flex justify-center">
                        <Button
                          variant="secondary"
                          className="rounded-full px-4"
                          onClick={handleReloadQueue}
                          id={HOME_SECTION_IDS.retryButton}
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
            <div className="flex w-full flex-col gap-3 sm:flex-row" id={HOME_SECTION_IDS.reviewHistoryLink}>
              <Button
                variant="secondary"
                className="flex-1 rounded-2xl text-base sm:h-12"
                onClick={skipActiveTask}
                disabled={!activeTask || Boolean(pendingResult)}
                debugId="practice-skip-button"
                id={HOME_SECTION_IDS.skipButton}
              >
                Skip to next
              </Button>
              <Link href="/answers" className="flex-1">
                <Button
                  variant="secondary"
                  className="w-full rounded-2xl text-base sm:h-12"
                  debugId="practice-review-history-button"
                  id={HOME_SECTION_IDS.reviewHistoryButton}
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
