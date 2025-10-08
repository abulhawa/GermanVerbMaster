import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Compass, History, Loader2, Settings2 } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { AccountMobileTrigger } from '@/components/auth/account-mobile-trigger';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { PracticeCard, type PracticeCardResult } from '@/components/practice-card';
import { SettingsDialog } from '@/components/settings-dialog';
import { PracticeModeSwitcher, type PracticeScope } from '@/components/practice-mode-switcher';
import { LanguageToggle } from '@/components/language-toggle';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { useAuthSession } from '@/auth/session';
import {
  loadPracticeSettings,
  savePracticeSettings,
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
  resetSession,
  type PracticeSessionState,
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
import { getTaskTypeCopy } from '@/lib/task-metadata';
import { useTranslations } from '@/locales';
import type {
  CEFRLevel,
  PracticeSettingsState,
  PracticeProgressState,
  TaskType,
  LexemePos,
} from '@shared';
import {
  AVAILABLE_TASK_TYPES,
  SCOPE_LABELS,
  buildCefrLabel,
  computeScope,
  getVerbLevel,
  normalisePreferredTaskTypes,
  scopeToTaskTypes,
} from '@/lib/practice-overview';

const MIN_QUEUE_THRESHOLD = 5;
const FETCH_LIMIT = 15;

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

export default function Home() {
  const [settings, setSettings] = useState<PracticeSettingsState>(() => loadPracticeSettings());
  const [progress, setProgress] = useState<PracticeProgressState>(() => loadPracticeProgress());
  const [session, setSession] = useState<PracticeSessionState>(() => loadPracticeSession());
  const [answerHistory, setAnswerHistory] = useState(() => loadAnswerHistory());
  const [tasksById, setTasksById] = useState<Record<string, PracticeTask>>({});
  const [isFetchingTasks, setIsFetchingTasks] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [shouldReloadTasks, setShouldReloadTasks] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const pendingFetchRef = useRef(false);

  const authSession = useAuthSession();
  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession.data?.user.role ?? null),
    [authSession.data?.user.role],
  );
  const translations = useTranslations();
  const homeTopBarCopy = translations.home.topBar;
  const unknownUserLabel = translations.auth.dialog.unknownUser;
  const topBarDisplayName = authSession.data?.user.name?.trim() || authSession.data?.user.email || unknownUserLabel;
  const topBarSubtitle = authSession.data
    ? homeTopBarCopy.signedInSubtitle.replace('{name}', topBarDisplayName)
    : homeTopBarCopy.signedOutSubtitle;

  const scope = computeScope(settings);
  const activeTaskTypes = useMemo(() => {
    const preferred = settings.preferredTaskTypes.length
      ? settings.preferredTaskTypes
      : [settings.defaultTaskType];
    return normalisePreferredTaskTypes(preferred);
  }, [settings.preferredTaskTypes, settings.defaultTaskType]);
  const activeTaskType = activeTaskTypes[0] ?? 'conjugate_form';
  const verbLevel = getVerbLevel(settings);

  useEffect(() => {
    savePracticeSettings(settings);
  }, [settings]);

  useEffect(() => {
    savePracticeProgress(progress);
  }, [progress]);

  useEffect(() => {
    savePracticeSession(session);
  }, [session]);

  useEffect(() => {
    saveAnswerHistory(answerHistory);
  }, [answerHistory]);

  const activeTask = session.activeTaskId ? tasksById[session.activeTaskId] : undefined;

  const fetchAndEnqueueTasks = useCallback(
    async ({ replace = false }: { replace?: boolean } = {}) => {
      if (pendingFetchRef.current) {
        return;
      }

      pendingFetchRef.current = true;
      setIsFetchingTasks(true);
      setFetchError(null);

      try {
        const perTypeLimit = Math.max(1, Math.ceil(FETCH_LIMIT / activeTaskTypes.length));
        const fetchedTasks: PracticeTask[][] = [];

        for (const taskType of activeTaskTypes) {
          const entry = clientTaskRegistry[taskType];
          if (!entry) {
            continue;
          }
          const pos = entry.supportedPos[0];
          const tasksForType = await fetchPracticeTasks({
            taskType,
            pos,
            limit: perTypeLimit,
          });
          fetchedTasks.push(tasksForType);
        }

        const tasks = mergeTaskLists(fetchedTasks, FETCH_LIMIT);

        setTasksById((prev) => {
          const next = replace ? {} : { ...prev };
          for (const task of tasks) {
            next[task.taskId] = task;
          }
          return next;
        });

        setSession((prev) => enqueueTasks(replace ? resetSession() : prev, tasks, { replace }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load practice tasks';
        console.error('[home] Unable to fetch practice tasks', error);
        setFetchError(message);
      } finally {
        pendingFetchRef.current = false;
        setIsFetchingTasks(false);
      }
    },
    [activeTaskTypes],
  );

  useEffect(() => {
    if (fetchError) {
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

    if (session.queue.length < MIN_QUEUE_THRESHOLD && !isFetchingTasks) {
      void fetchAndEnqueueTasks();
    }
  }, [session.queue.length, session.activeTaskId, tasksById, isFetchingTasks, fetchAndEnqueueTasks, fetchError]);

  useEffect(() => {
    if (shouldReloadTasks) {
      setShouldReloadTasks(false);
      setTasksById({});
      setSession(resetSession());
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

      setSession((prev) => completeTask(prev, details.task.taskId));

      setTasksById((prev) => {
        const next = { ...prev };
        delete next[details.task.taskId];
        return next;
      });
    },
    [],
  );

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

  const handleSettingsChange = useCallback(
    (nextSettings: PracticeSettingsState) => {
      const previousLevel = getVerbLevel(settings);
      const nextLevel = getVerbLevel(nextSettings);
      setSettings(nextSettings);
      if (previousLevel !== nextLevel) {
        setShouldReloadTasks(true);
      }
    },
    [settings],
  );

  const handleScopeChange = useCallback(
    (nextScope: PracticeScope) => {
      const nextTypes = scopeToTaskTypes(nextScope);
      if (nextScope !== 'custom' && nextTypes.length > 0) {
        setSettings((prev) => {
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
    [scope],
  );

  const handleCustomTaskTypesChange = useCallback((taskTypes: TaskType[]) => {
    if (!taskTypes.length) {
      return;
    }
    setSettings((prev) => updatePreferredTaskTypes(prev, normalisePreferredTaskTypes(taskTypes)));
    setShouldReloadTasks(true);
  }, []);

  const scopeBadgeLabel = scope === 'custom'
    ? `${SCOPE_LABELS[scope]} (${activeTaskTypes.length})`
    : SCOPE_LABELS[scope];
  const cefrLabel = buildCefrLabel(activeTaskTypes, settings);
  const taskTypeCopy = getTaskTypeCopy(activeTaskType);
  const cefrLevelForDisplay = scope === 'verbs' ? verbLevel : undefined;
  const levelSummary = cefrLabel ?? (cefrLevelForDisplay ? `Level ${cefrLevelForDisplay}` : 'Mixed levels');

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

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-6">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground group-data-[collapsed=true]/sidebar:hidden">
            Navigate
          </p>
          <div className="grid justify-center gap-2">
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
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground group-data-[collapsed=true]/sidebar:hidden">Language</p>
          <LanguageToggle className="w-full rounded-2xl border-border/60 bg-background/90" debugId="sidebar-language-toggle" />
        </div>
        <div className="flex items-center gap-3 group-data-[collapsed=true]/sidebar:justify-center">
          <SettingsDialog
            debugId="sidebar-settings-dialog"
            settings={settings}
            onSettingsChange={handleSettingsChange}
            taskType={activeTaskType}
            presetLabel={scopeBadgeLabel}
            taskTypeLabel={taskTypeCopy.label}
          />
          <span className="text-sm font-medium text-foreground group-data-[collapsed=true]/sidebar:hidden">
            Settings & Level
          </span>
        </div>
      </div>
      <div className="hidden text-center text-sm text-muted-foreground group-data-[collapsed=true]/sidebar:block">
        Hold to expand
      </div>
    </div>
  );
  return (
    <AppShell
      sidebar={sidebar}
      mobileNav={<MobileNavBar items={navigationItems} accountAction={<AccountMobileTrigger />} />}
      debugId="home-app-shell"
    >
      <div className="space-y-6">
        <section className="flex min-h-[540px] flex-col gap-6 rounded-3xl border border-border/50 bg-card/80 p-6 shadow-xl shadow-primary/10">
          <div className="space-y-6 text-left">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PracticeModeSwitcher
                debugId="topbar-mode-switcher"
                scope={scope}
                onScopeChange={handleScopeChange}
                selectedTaskTypes={activeTaskTypes}
                onTaskTypesChange={handleCustomTaskTypesChange}
                availableTaskTypes={AVAILABLE_TASK_TYPES}
                scopeBadgeLabel={scopeBadgeLabel}
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-6">
            <div className="w-full xl:max-w-none" data-testid="practice-card-container">
              {isInitialLoading ? (
                <div className="flex h-[340px] items-center justify-center rounded-[28px] border border-dashed border-border/60 bg-background/70 shadow-2xl shadow-primary/15">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : activeTask ? (
                <PracticeCard
                  key={activeTask.taskId}
                  task={activeTask}
                  settings={settings}
                  onResult={handleTaskResult}
                  isLoadingNext={isFetchingTasks && session.queue.length === 0}
                  debugId="home-practice-card"
                  sessionProgress={{
                    completed: sessionCompleted,
                    target: milestoneTarget,
                  }}
                />
              ) : (
                <div className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-[28px] border border-border/60 bg-background/70 text-center shadow-2xl shadow-primary/10">
                  <p className="text-sm text-muted-foreground">
                    No tasks are queued right now. Adjust your practice scope or reload to fetch fresh prompts.
                  </p>
                  <Button
                    variant="secondary"
                    className="rounded-full px-4"
                    onClick={() => {
                      setFetchError(null);
                      void fetchAndEnqueueTasks({ replace: true });
                    }}
                  >
                    Reload tasks
                  </Button>
                </div>
              )}
              {fetchError && (
                <div
                  className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive"
                  role="alert"
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
                        setFetchError(null);
                        void fetchAndEnqueueTasks({ replace: true });
                      }}
                    >
                      Retry loading
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1 rounded-2xl text-base sm:h-12"
              onClick={handleSkipTask}
              disabled={!activeTask}
              debugId="practice-skip-button"
            >
              Skip to next
            </Button>
            <Link href="/answers" className="flex-1">
              <Button variant="secondary" className="w-full rounded-2xl text-base sm:h-12" debugId="practice-review-history-button">
                <History className="mr-2 h-4 w-4" aria-hidden />
                Review answer history
              </Button>
            </Link>
          </div>
        </section>

        
      </div>
    </AppShell>
  );
}
