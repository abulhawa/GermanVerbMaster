import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import {
  BarChart2,
  BookOpen,
  Compass,
  Flame,
  History,
  Loader2,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { PracticeCard, type PracticeCardResult } from '@/components/practice-card';
import { ProgressDisplay } from '@/components/progress-display';
import { SettingsDialog } from '@/components/settings-dialog';
import { PracticeModeSwitcher, type PracticeScope } from '@/components/practice-mode-switcher';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
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
  listClientTaskTypes,
} from '@/lib/tasks';
import { getDevAttributes } from '@/lib/dev-attributes';
import { getTaskTypeCopy } from '@/lib/task-metadata';
import type {
  CEFRLevel,
  PracticeSettingsState,
  PracticeProgressState,
  TaskType,
  LexemePos,
} from '@shared';

interface SessionProgressBarProps {
  value: number;
  completed: number;
  target: number;
  debugId?: string;
}

function SessionProgressBar({ value, completed, target, debugId }: SessionProgressBarProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'session-progress';

  return (
    <div
      className="w-full rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lg shadow-primary/5"
      {...getDevAttributes('session-progress-bar', resolvedDebugId)}
    >
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <span>Session progress</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-border/60 bg-muted">
        <motion.span
          className="block h-full rounded-full bg-gradient-to-r from-brand-gradient-start via-primary to-brand-gradient-end"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {completed} of {target} tasks completed in this session.
      </p>
    </div>
  );
}

const MIN_QUEUE_THRESHOLD = 5;
const FETCH_LIMIT = 15;
const AVAILABLE_TASK_TYPES = listClientTaskTypes();

const TASK_TYPE_TO_SCOPE: Record<TaskType, PracticeScope> = {
  conjugate_form: 'verbs',
  noun_case_declension: 'nouns',
  adj_ending: 'adjectives',
};

const SCOPE_LABELS: Record<PracticeScope, string> = {
  all: 'All tasks',
  verbs: 'Verbs only',
  nouns: 'Nouns only',
  adjectives: 'Adjectives only',
  custom: 'Custom mix',
};

function normalisePreferredTaskTypes(taskTypes: TaskType[]): TaskType[] {
  const allowed = new Set(AVAILABLE_TASK_TYPES);
  const unique = Array.from(new Set(taskTypes.filter((type) => allowed.has(type))));
  if (unique.length > 0) {
    return unique;
  }
  return AVAILABLE_TASK_TYPES.length ? [AVAILABLE_TASK_TYPES[0]!] : ['conjugate_form'];
}

function determineScope(taskTypes: TaskType[]): PracticeScope {
  const normalised = normalisePreferredTaskTypes(taskTypes);
  const allMatch =
    normalised.length === AVAILABLE_TASK_TYPES.length &&
    normalised.every((type) => AVAILABLE_TASK_TYPES.includes(type));
  if (allMatch) {
    return 'all';
  }
  if (normalised.length === 1) {
    return TASK_TYPE_TO_SCOPE[normalised[0]!] ?? 'custom';
  }
  return 'custom';
}

function computeScope(settings: PracticeSettingsState): PracticeScope {
  const preferred = settings.preferredTaskTypes.length
    ? settings.preferredTaskTypes
    : [settings.defaultTaskType];
  return determineScope(preferred);
}

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

interface SummaryResult {
  total: number;
  correct: number;
  streak: number;
  accuracy: number;
  uniqueLexemes: number;
  lastPracticedAt: string | null;
}

function computeSummary(progress: PracticeProgressState, taskTypes: TaskType[]): SummaryResult {
  const lexemeIds = new Set<string>();
  let correct = 0;
  let incorrect = 0;
  let streak = 0;
  let lastPracticedAt: string | null = null;

  for (const taskType of taskTypes) {
    const summary = progress.totals[taskType];
    if (!summary) {
      continue;
    }
    correct += summary.correctAttempts;
    incorrect += summary.incorrectAttempts;
    streak = Math.max(streak, summary.streak);
    if (summary.lastPracticedAt) {
      if (!lastPracticedAt || new Date(summary.lastPracticedAt) > new Date(lastPracticedAt)) {
        lastPracticedAt = summary.lastPracticedAt;
      }
    }
    for (const lexemeId of Object.keys(summary.lexemes)) {
      lexemeIds.add(lexemeId);
    }
  }

  const total = correct + incorrect;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  return {
    total,
    correct,
    streak,
    accuracy,
    uniqueLexemes: lexemeIds.size,
    lastPracticedAt,
  } satisfies SummaryResult;
}

function buildCefrLabel(taskTypes: TaskType[], settings: PracticeSettingsState): string | undefined {
  const entries = new Map<LexemePos, CEFRLevel>();
  for (const taskType of taskTypes) {
    const registryEntry = clientTaskRegistry[taskType];
    if (!registryEntry) {
      continue;
    }
    const pos = registryEntry.supportedPos[0];
    const level = settings.cefrLevelByPos[pos] ?? (pos === 'verb' ? settings.legacyVerbLevel ?? 'A1' : 'A1');
    if (!entries.has(pos)) {
      entries.set(pos, level ?? 'A1');
    }
  }
  if (!entries.size) {
    return undefined;
  }
  if (entries.size === 1) {
    const [entry] = Array.from(entries.entries());
    const [pos, level] = entry;
    const posLabel = pos === 'verb' ? 'Verb' : pos === 'noun' ? 'Noun' : 'Adjective';
    return `${posLabel} level ${level}`;
  }
  return Array.from(entries.entries())
    .map(([pos, level]) => {
      const posLabel = pos === 'verb' ? 'Verb' : pos === 'noun' ? 'Noun' : 'Adjective';
      return `${posLabel} ${level}`;
    })
    .join(' · ');
}

function scopeToTaskTypes(scope: PracticeScope): TaskType[] {
  switch (scope) {
    case 'all':
      return [...AVAILABLE_TASK_TYPES];
    case 'verbs':
      return ['conjugate_form'];
    case 'nouns':
      return ['noun_case_declension'];
    case 'adjectives':
      return ['adj_ending'];
    case 'custom':
    default:
      return [];
  }
}

function getVerbLevel(settings: PracticeSettingsState): CEFRLevel {
  return settings.cefrLevelByPos.verb ?? settings.legacyVerbLevel ?? 'A1';
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
  const pendingFetchRef = useRef(false);

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

  const summary = useMemo(() => computeSummary(progress, activeTaskTypes), [progress, activeTaskTypes]);

  const scopeBadgeLabel = scope === 'custom'
    ? `${SCOPE_LABELS[scope]} (${activeTaskTypes.length})`
    : SCOPE_LABELS[scope];
  const cefrLabel = buildCefrLabel(activeTaskTypes, settings);
  const taskTypeCopy = getTaskTypeCopy(activeTaskType);
  const cefrLevelForDisplay = scope === 'verbs' ? verbLevel : undefined;
  const levelSummary = cefrLabel ?? (cefrLevelForDisplay ? `Level ${cefrLevelForDisplay}` : 'Mixed levels');
  const queueLabel = scope === 'verbs' || scope === 'nouns' || scope === 'adjectives' ? taskTypeCopy.label : 'Task mix';

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

  const historyCount = answerHistory.length;

  const isInitialLoading = !activeTask && isFetchingTasks;

  const topBar = (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-4 lg:max-w-xl">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
            Adaptive practice
          </p>
          <h1 className="text-3xl font-semibold text-foreground lg:text-4xl">
            Practice that adapts to every task type
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Sessions now draw from the shared task registry. Choose a scope to rotate between verbs, nouns, adjectives, or your
            custom mix.
          </p>
        </div>
        <PracticeModeSwitcher
          debugId="topbar-mode-switcher"
          scope={scope}
          onScopeChange={handleScopeChange}
          selectedTaskTypes={activeTaskTypes}
          onTaskTypesChange={handleCustomTaskTypesChange}
          availableTaskTypes={AVAILABLE_TASK_TYPES}
        />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-muted/40 p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Flame className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Streak</p>
            <p className="text-lg font-semibold text-foreground">{summary.streak} day{summary.streak === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-muted/40 p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
            <Target className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Accuracy</p>
            <p className="text-lg font-semibold text-foreground">{summary.accuracy}%</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/analytics">
            <Button debugId="topbar-insights-button" className="rounded-2xl px-6">
              <BarChart2 className="mr-2 h-4 w-4" aria-hidden />
              Insights
            </Button>
          </Link>
          <SettingsDialog
            debugId="topbar-settings-dialog"
            settings={settings}
            onSettingsChange={handleSettingsChange}
            taskType={activeTaskType}
            presetLabel={scopeBadgeLabel}
            taskTypeLabel={taskTypeCopy.label}
          />
          <div className="hidden sm:block">
            <Avatar className="h-11 w-11 border border-border/60 shadow-sm">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">LV</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Navigate</p>
          <div className="grid gap-2">
            <SidebarNavButton href="/" icon={Sparkles} label="Practice" exact />
            <SidebarNavButton href="/answers" icon={History} label="Answer history" />
            <SidebarNavButton href="/analytics" icon={Compass} label="Analytics" />
            <SidebarNavButton href="/admin" icon={Settings2} label="Admin tools" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Active preset</p>
            <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-[10px] uppercase tracking-[0.22em] text-primary">
              {scopeBadgeLabel}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {levelSummary} · {queueLabel}
          </p>
        </div>
      </div>
      <div className="space-y-3 rounded-3xl border border-border/60 bg-muted/40 p-5 text-sm shadow-sm">
        <p className="font-semibold text-foreground">Session recap</p>
        <p className="text-xs text-muted-foreground">
          {summary.total > 0
            ? `${summary.total} attempt${summary.total === 1 ? '' : 's'} recorded · ${summary.accuracy}% accuracy`
            : 'Take your first attempt to unlock personalised insights.'}
        </p>
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar} topBar={topBar} debugId="home-app-shell">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col items-center gap-6">
          <div className="flex w-full max-w-xl flex-col items-center gap-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              <Sparkles className="h-3 w-3" aria-hidden />
              {scopeBadgeLabel}
            </div>
            <h2 className="text-3xl font-semibold text-foreground">Focus mode</h2>
            <p className="text-sm text-muted-foreground">
              Answer the prompt below to keep your streak alive and build mixed-part-of-speech mastery.
            </p>
          </div>

          <div className="w-full max-w-2xl">
            {isInitialLoading ? (
              <div className="flex h-[340px] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/70">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : activeTask ? (
              <PracticeCard
                key={activeTask.taskId}
                task={activeTask}
                settings={settings}
                onResult={handleTaskResult}
                isLoadingNext={isFetchingTasks && session.queue.length <= 1}
                className="mx-auto"
                debugId="home-practice-card"
              />
            ) : (
              <div className="flex h-[340px] items-center justify-center rounded-3xl border border-border/70 bg-card/70">
                <p className="text-sm text-muted-foreground">No tasks available right now. Try refreshing in a moment.</p>
              </div>
            )}
            {fetchError && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-destructive" role="alert">
                <span>{fetchError}</span>
                <Button
                  variant="link"
                  className="h-auto px-0 text-destructive"
                  onClick={() => {
                    setFetchError(null);
                    void fetchAndEnqueueTasks({ replace: true });
                  }}
                >
                  Try again
                </Button>
              </div>
            )}
          </div>

          <SessionProgressBar
            value={milestoneProgress}
            completed={sessionCompleted}
            target={milestoneTarget}
            debugId="home-session-progress"
          />

          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1 rounded-2xl"
              onClick={handleSkipTask}
              disabled={!activeTask}
              debugId="practice-skip-button"
            >
              Skip to next
            </Button>
            <Link href="/answers" className="flex-1">
              <Button variant="secondary" className="w-full rounded-2xl" debugId="practice-review-history-button">
                <History className="mr-2 h-4 w-4" aria-hidden />
                Review answer history
              </Button>
            </Link>
          </div>
        </section>

        <aside className="space-y-6">
          <ProgressDisplay
            progress={progress}
            taskType={activeTaskType}
            taskTypes={activeTaskTypes}
            taskLabel={scopeBadgeLabel}
            cefrLevel={cefrLevelForDisplay}
            cefrLabel={cefrLabel}
            headline={`${scopeBadgeLabel} progress`}
            debugId="sidebar-progress-display"
          />
          <div className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Session details
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                {historyCount} entries
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm">
              <motion.div
                className="h-10 w-10 rounded-full bg-primary/10 p-2"
                initial={{ scale: 0.9, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <BookOpen className="h-full w-full text-primary" aria-hidden />
              </motion.div>
              <div>
                <p className="font-medium text-foreground">{summary.correct} correct attempts logged</p>
                <p className="text-xs text-muted-foreground">
                  Review your detailed answer history to reinforce the tricky lexemes.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Next milestone
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                {milestoneTarget} tasks
              </span>
            </div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-border/60 bg-muted">
              <motion.span
                className="block h-full rounded-full bg-gradient-to-r from-brand-gradient-start via-primary to-brand-gradient-end"
                initial={{ width: 0 }}
                animate={{ width: `${milestoneProgress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {sessionCompleted} of {milestoneTarget} tasks completed in this streak cycle.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

