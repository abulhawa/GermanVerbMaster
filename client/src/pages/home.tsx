import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { History, Loader2 } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { UserMenuControl } from '@/components/auth/user-menu-control';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { PracticeCard, type PracticeCardResult } from '@/components/practice-card';
import { PracticeModeSwitcher, type PracticeScope } from '@/components/practice-mode-switcher';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { useAuthSession } from '@/auth/session';
import {
  updateCefrLevel,
  updatePreferredTaskTypes,
} from '@/lib/practice-settings';
import {
  loadPracticeProgress,
  savePracticeProgress,
  recordTaskResult,
} from '@/lib/practice-progress';
import {
  loadPracticeSession,
  savePracticeSession,
  enqueueTasks,
  completeTask,
  type PracticeSessionState,
  clearSessionQueue,
  markLeitnerServerExhausted,
} from '@/lib/practice-session';
import {
  loadAnswerHistory,
  saveAnswerHistory,
  appendAnswer,
  createAnswerHistoryEntry,
} from '@/lib/answer-history';
import {
  fetchPracticeTasks,
  type PracticeTask,
  clientTaskRegistry,
} from '@/lib/tasks';
import { useTranslations } from '@/locales';
import { usePracticeSettings } from '@/contexts/practice-settings-context';
import type { CEFRLevel, PracticeProgressState, TaskType, LexemePos } from '@shared';
import {
  AVAILABLE_TASK_TYPES,
  SCOPE_LABELS,
  computeScope,
  buildPracticeSessionScopeKey,
  getVerbLevel,
  normalisePreferredTaskTypes,
  scopeToTaskTypes,
} from '@/lib/practice-overview';

const MIN_QUEUE_THRESHOLD = 5;
const FETCH_LIMIT = 15;

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

function mergeTaskLists(lists: PracticeTask[][], limit: number): PracticeTask[] {
  const queues = lists.map((list) => [...list]);
  const result: PracticeTask[] = [];
  const seen = new Set<string>();

  while (result.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (!queue.length) {
        continue;
      }
      const item = queue.shift()!;
      if (seen.has(item.taskId)) {
        continue;
      }
      seen.add(item.taskId);
      result.push(item);
      if (result.length >= limit) {
        break;
      }
    }
  }

  return result;
}

function createQueueSignature(queue: string[], taskTypes: TaskType[]): string {
  return `${taskTypes.join(',')}|${queue.join(',')}`;
}

const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface VerbLevelSelectProps {
  value: CEFRLevel;
  onChange: (level: CEFRLevel) => void;
  labelId: string;
}

function VerbLevelSelect({ value, onChange, labelId }: VerbLevelSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as CEFRLevel)}
      debugId="home-verb-level-select"
    >
      <SelectTrigger
        aria-labelledby={labelId}
        className="h-12 w-28 rounded-full border border-border/60 bg-background/90 px-5 text-sm font-medium text-foreground shadow-soft"
        debugId="home-verb-level-trigger"
      >
        <SelectValue
          debugId="home-verb-level-value"
        />
      </SelectTrigger>
      <SelectContent debugId="home-verb-level-menu" align="start">
        {CEFR_LEVELS.map((level) => (
          <SelectItem
            key={level}
            value={level}
            debugId={`home-verb-level-${level.toLowerCase()}`}
          >
            {level}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Home() {
  const { settings, updateSettings } = usePracticeSettings();
  const sessionScopeKey = useMemo(() => buildPracticeSessionScopeKey(settings), [settings]);
  const authSession = useAuthSession();
  const userId = authSession.data?.user.id ?? null;
  const [progress, setProgress] = useState<PracticeProgressState>(() => loadPracticeProgress());
  const [session, setSession] = useState<PracticeSessionState>(() =>
    loadPracticeSession({ scopeKey: sessionScopeKey, userId }),
  );
  const [answerHistory, setAnswerHistory] = useState(() => loadAnswerHistory());
  const [pendingResult, setPendingResult] = useState<PracticeCardResult | null>(null);
  const [tasksById, setTasksById] = useState<Record<string, PracticeTask>>({});
  const [isFetchingTasks, setIsFetchingTasks] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [shouldReloadTasks, setShouldReloadTasks] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const pendingFetchRef = useRef(false);
  const sessionHydrationRef = useRef({ scopeKey: sessionScopeKey, userId });
  const lastFailedQueueSignatureRef = useRef<string | null>(null);
  const verbLevelLabelId = useId();

  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession.data?.user.role ?? null),
    [authSession.data?.user.role],
  );
  const translations = useTranslations();
  const homeTopBarCopy = translations.home.topBar;

  const scope = computeScope(settings);
  const activeTaskTypes = useMemo(() => {
    const preferred = settings.preferredTaskTypes.length
      ? settings.preferredTaskTypes
      : [settings.defaultTaskType];
    return normalisePreferredTaskTypes(preferred);
  }, [settings.preferredTaskTypes, settings.defaultTaskType]);
  const activeTaskType = activeTaskTypes[0] ?? 'conjugate_form';
  const verbLevel = getVerbLevel(settings);
  const previousScopeKeyRef = useRef(sessionScopeKey);

  useEffect(() => {
    if (previousScopeKeyRef.current !== sessionScopeKey) {
      previousScopeKeyRef.current = sessionScopeKey;
      setShouldReloadTasks(true);
    }
  }, [sessionScopeKey]);

  useEffect(() => {
    const previous = sessionHydrationRef.current;
    if (previous.scopeKey === sessionScopeKey && previous.userId === userId) {
      return;
    }

    sessionHydrationRef.current = { scopeKey: sessionScopeKey, userId };
    setSession(loadPracticeSession({ scopeKey: sessionScopeKey, userId }));
  }, [sessionScopeKey, userId]);

  useEffect(() => {
    savePracticeProgress(progress);
  }, [progress]);

  useEffect(() => {
    savePracticeSession(session, { scopeKey: sessionScopeKey, userId });
  }, [session, sessionScopeKey, userId]);

  useEffect(() => {
    saveAnswerHistory(answerHistory);
  }, [answerHistory]);

  useEffect(() => {
    if (pendingResult && pendingResult.task.taskId !== session.activeTaskId) {
      setPendingResult(null);
    }
  }, [pendingResult, session.activeTaskId]);

  const activeTask = session.activeTaskId ? tasksById[session.activeTaskId] : undefined;
  const queueSignature = useMemo(
    () => createQueueSignature(session.queue, activeTaskTypes),
    [session.queue, activeTaskTypes],
  );

  const fetchAndEnqueueTasks = useCallback(
    async ({ replace = false }: { replace?: boolean } = {}) => {
      if (pendingFetchRef.current) {
        return;
      }

      const baseQueue = replace ? [] : session.queue;
      const baseSignature = createQueueSignature(baseQueue, activeTaskTypes);

      pendingFetchRef.current = true;
      setIsFetchingTasks(true);

      try {
        const perTypeLimit = Math.max(1, Math.ceil(FETCH_LIMIT / activeTaskTypes.length));
        const fetchedTasks: PracticeTask[][] = [];

        const resolveLevelForPos = (pos: LexemePos): CEFRLevel | undefined => {
          if (pos === 'verb') {
            return settings.cefrLevelByPos.verb ?? settings.legacyVerbLevel ?? 'A1';
          }
          return settings.cefrLevelByPos[pos];
        };

        for (const taskType of activeTaskTypes) {
          const entry = clientTaskRegistry[taskType];
          if (!entry) {
            continue;
          }
          const pos = entry.supportedPos[0];
          const level = resolveLevelForPos(pos);
          const tasksForType = await fetchPracticeTasks({
            taskType,
            pos,
            limit: perTypeLimit,
            level,
          });
          fetchedTasks.push(tasksForType);
        }

        const tasks = mergeTaskLists(fetchedTasks, FETCH_LIMIT);

        if (!tasks.length) {
          if (!baseQueue.length) {
            setFetchError('No practice tasks are available for your current scope right now. Try adjusting your practice scope or check back later.');
          }
          lastFailedQueueSignatureRef.current = baseSignature;
          return;
        }

        const seen = new Set(baseQueue);
        const hasNewTasks = tasks.some((task) => {
          if (seen.has(task.taskId)) {
            return false;
          }
          seen.add(task.taskId);
          return true;
        });

        if (!replace && !hasNewTasks) {
          setSession((prev) => markLeitnerServerExhausted(prev));
          lastFailedQueueSignatureRef.current = baseSignature;
          return;
        }

        setTasksById((prev) => {
          const next = replace ? {} : { ...prev };
          for (const task of tasks) {
            next[task.taskId] = task;
          }
          return next;
        });

        let nextSessionState: PracticeSessionState | null = null;
        setSession((prev) => {
          const baseState = replace ? clearSessionQueue(prev) : prev;
          const updatedState = enqueueTasks(baseState, tasks, { replace });
          nextSessionState = updatedState;
          return updatedState;
        });

        const sessionAfterEnqueue = nextSessionState as PracticeSessionState | null;
        if (replace && sessionAfterEnqueue && sessionAfterEnqueue.queue.length === 0) {
          lastFailedQueueSignatureRef.current = baseSignature;
          setFetchError('No practice tasks are available for your current scope right now. Try adjusting your practice scope or check back later.');
          return;
        }

        lastFailedQueueSignatureRef.current = null;
        setFetchError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load practice tasks';
        console.error('[home] Unable to fetch practice tasks', error);
        lastFailedQueueSignatureRef.current = null;
        setFetchError(message);
      } finally {
        pendingFetchRef.current = false;
        setIsFetchingTasks(false);
      }
    },
    [activeTaskTypes, session.queue, settings],
  );

  useEffect(() => {
    if (fetchError) {
      return;
    }

    if (lastFailedQueueSignatureRef.current && lastFailedQueueSignatureRef.current === queueSignature) {
      return;
    }

    if (!session.queue.length || !session.activeTaskId) {
      void fetchAndEnqueueTasks({ replace: true });
      return;
    }

    if (!tasksById[session.activeTaskId] && !isFetchingTasks) {
      void fetchAndEnqueueTasks({ replace: true });
      return;
    }

    if (session.leitner?.serverExhausted && session.queue.length > 0) {
      return;
    }

    if (session.queue.length < MIN_QUEUE_THRESHOLD && !isFetchingTasks) {
      void fetchAndEnqueueTasks();
    }
  }, [
    session.queue.length,
    session.activeTaskId,
    tasksById,
    isFetchingTasks,
    fetchAndEnqueueTasks,
    fetchError,
    queueSignature,
    session.leitner?.serverExhausted,
  ]);

  useEffect(() => {
    if (shouldReloadTasks) {
      setShouldReloadTasks(false);
      setTasksById({});
      setSession((prev) => clearSessionQueue(prev));
      lastFailedQueueSignatureRef.current = null;
      void fetchAndEnqueueTasks({ replace: true });
    }
  }, [shouldReloadTasks, fetchAndEnqueueTasks]);

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

      setPendingResult(details);
    },
    [],
  );

  const handleContinueToNext = useCallback(() => {
    setPendingResult((current) => {
      const taskId = current?.task.taskId;

      if (!taskId) {
        return current;
      }

      setSession((prev) => {
        const updated = completeTask(prev, taskId, current?.result);

        if (!updated.queue.includes(taskId)) {
          setTasksById((prev) => {
            if (!(taskId in prev)) {
              return prev;
            }
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
        }

        return updated;
      });

      return null;
    });
  }, []);

  const handleSkipTask = useCallback(() => {
    if (!activeTask) {
      return;
    }
    setSession((prev) => {
      const remaining = prev.queue.filter((id) => id !== activeTask.taskId);
      return {
        ...prev,
        queue: remaining,
        activeTaskId: remaining[0] ?? null,
      };
    });
    setTasksById((prev) => {
      const next = { ...prev };
      delete next[activeTask.taskId];
      return next;
    });
  }, [activeTask]);

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
        setShouldReloadTasks(true);
      }
    },
    [scope, updateSettings],
  );

  const handleCustomTaskTypesChange = useCallback((taskTypes: TaskType[]) => {
    if (!taskTypes.length) {
      return;
    }
    updateSettings((prev) => updatePreferredTaskTypes(prev, normalisePreferredTaskTypes(taskTypes)));
    setShouldReloadTasks(true);
  }, [updateSettings]);

  const handleVerbLevelChange = useCallback((level: CEFRLevel) => {
    updateSettings((prev) => updateCefrLevel(prev, { pos: 'verb', level }));
  }, [updateSettings]);

  const scopeBadgeLabel = scope === 'custom'
    ? `${SCOPE_LABELS[scope]} (${activeTaskTypes.length})`
    : SCOPE_LABELS[scope];

  const sessionCompleted = session.completed.length;
  const milestoneTarget = useMemo(() => {
    if (sessionCompleted === 0) {
      return 10;
    }
    const base = Math.ceil(sessionCompleted / 10) * 10;
    return Math.max(base, sessionCompleted + 5);
  }, [sessionCompleted]);
  const milestoneProgress = milestoneTarget
    ? Math.min(100, Math.round((sessionCompleted / milestoneTarget) * 100))
    : 0;


  const isInitialLoading = !activeTask && isFetchingTasks;

  const topBarControls = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/60 bg-card/80 px-4 py-2 shadow-soft">
      <div className="flex flex-wrap items-center gap-3" id={HOME_SECTION_IDS.modeSwitcher}>
        <span id={verbLevelLabelId} className="sr-only">
          {homeTopBarCopy.levelLabel}
        </span>
        <PracticeModeSwitcher
          debugId="topbar-mode-switcher"
          scope={scope}
          onScopeChange={handleScopeChange}
          selectedTaskTypes={activeTaskTypes}
          onTaskTypesChange={handleCustomTaskTypesChange}
          availableTaskTypes={AVAILABLE_TASK_TYPES}
          scopeBadgeLabel={scopeBadgeLabel}
        />
        <VerbLevelSelect
          value={verbLevel}
          onChange={handleVerbLevelChange}
          labelId={verbLevelLabelId}
        />
      </div>
      <UserMenuControl className="w-auto flex-none" />
    </div>
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
  return (
    <div id={HOME_SECTION_IDS.page}>
      <AppShell
        sidebar={sidebar}
        topBarContent={topBarControls}
        mobileNav={<MobileNavBar items={navigationItems} />}
        debugId="home-app-shell"
      >
      <div className="space-y-6" id={HOME_SECTION_IDS.content}>
        <section
        >
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
                    onContinue={handleContinueToNext}
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
                    onClick={() => {
                      lastFailedQueueSignatureRef.current = null;
                      setFetchError(null);
                      void fetchAndEnqueueTasks({ replace: true });
                    }}
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
                      onClick={() => {
                        lastFailedQueueSignatureRef.current = null;
                        setFetchError(null);
                        void fetchAndEnqueueTasks({ replace: true });
                      }}
                      id={HOME_SECTION_IDS.retryButton}
                    >
                      Retry loading
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row" id={HOME_SECTION_IDS.reviewHistoryLink}>
            <Button
              variant="secondary"
              className="flex-1 rounded-2xl text-base sm:h-12"
              onClick={handleSkipTask}
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
