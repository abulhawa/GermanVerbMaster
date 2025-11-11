import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PracticeCardResult } from '@/components/practice-card';
import {
  clearSessionQueue,
  completeTask,
  enqueueTasks,
  loadPracticeSession,
  markLeitnerServerExhausted,
  savePracticeSession,
  type PracticeSessionState,
} from '@/lib/practice-session';
import type { PracticeTask, MultiTaskFetchOptions } from '@/lib/tasks';
import { clientTaskRegistry, fetchPracticeTasksByType } from '@/lib/tasks';
import type { CEFRLevel, LexemePos, TaskType } from '@shared';

export const MIN_QUEUE_THRESHOLD = 5;
const FETCH_LIMIT = 15;

type FetchPracticeTasksFn = (
  options: MultiTaskFetchOptions,
) => Promise<Record<TaskType, PracticeTask[]>>;

interface FetchTasksForActiveTypesOptions {
  taskTypes: TaskType[];
  perTypeLimit: number;
  resolveLevelForPos: (pos: LexemePos) => CEFRLevel;
  fetcher?: FetchPracticeTasksFn;
}

interface FetchTasksForActiveTypesResult {
  tasksByType: PracticeTask[][];
  errors: Array<{ taskType: TaskType; error: unknown }>;
}

export async function fetchTasksForActiveTypes({
  taskTypes,
  perTypeLimit,
  resolveLevelForPos,
  fetcher = fetchPracticeTasksByType,
}: FetchTasksForActiveTypesOptions): Promise<FetchTasksForActiveTypesResult> {
  const taskLevels = taskTypes.map((taskType) => {
    const entry = clientTaskRegistry[taskType];
    const pos = entry?.supportedPos[0];
    return pos ? resolveLevelForPos(pos) : resolveLevelForPos('verb');
  });

  try {
    const groupedTasks = await fetcher({
      taskTypes,
      limit: perTypeLimit,
      level: taskLevels,
    });

    return {
      tasksByType: taskTypes.map((taskType) => groupedTasks[taskType] ?? []),
      errors: [],
    };
  } catch (error) {
    console.error('[home] Unable to fetch practice tasks', error);
    return {
      tasksByType: taskTypes.map(() => []),
      errors: taskTypes.map((taskType) => ({ taskType, error })),
    };
  }
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

function createQueueSignature(queue: string[], taskTypes: TaskType[]): string {
  return `${taskTypes.join(',')}|${queue.join(',')}`;
}

export interface UseHomePracticeSessionOptions {
  activeTaskTypes: TaskType[];
  sessionScopeKey: string;
  userId: string | null | undefined;
  resolveLevelForPos: (pos: LexemePos) => CEFRLevel;
}

export interface QueueDiagnosticsSnapshot {
  queueLength: number;
  threshold: number;
  lastFailedSignature: string | null;
  isServerExhausted: boolean;
}

export interface UseHomePracticeSessionResult {
  session: PracticeSessionState;
  activeTask: PracticeTask | undefined;
  pendingResult: PracticeCardResult | null;
  isFetchingTasks: boolean;
  isInitialLoading: boolean;
  fetchError: string | null;
  hasBlockingFetchError: boolean;
  queueDiagnostics: QueueDiagnosticsSnapshot;
  registerPendingResult: (result: PracticeCardResult | null) => void;
  continueToNext: () => void;
  skipActiveTask: () => void;
  requestQueueReload: () => void;
  reloadQueue: () => Promise<void>;
  resetFetchError: () => void;
}

export function useHomePracticeSession({
  activeTaskTypes,
  sessionScopeKey,
  userId,
  resolveLevelForPos,
}: UseHomePracticeSessionOptions): UseHomePracticeSessionResult {
  const [session, setSession] = useState<PracticeSessionState>(() =>
    loadPracticeSession({ scopeKey: sessionScopeKey, userId }),
  );
  const [tasksById, setTasksById] = useState<Record<string, PracticeTask>>({});
  const [pendingResult, setPendingResult] = useState<PracticeCardResult | null>(null);
  const [isFetchingTasks, setIsFetchingTasks] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasBlockingFetchError, setHasBlockingFetchError] = useState(false);
  const [shouldReloadTasks, setShouldReloadTasks] = useState(false);
  const pendingFetchRef = useRef(false);
  const sessionRef = useRef(session);
  const sessionHydrationRef = useRef({ scopeKey: sessionScopeKey, userId });
  const previousScopeKeyRef = useRef(sessionScopeKey);
  const lastFailedQueueSignatureRef = useRef<string | null>(null);
  const lastAutoReloadSignatureRef = useRef<string | null>(null);
  const lastAllInteractedQueueSignatureRef = useRef<string | null>(null);

  const activeTask = session.activeTaskId ? tasksById[session.activeTaskId] : undefined;
  const queueSignature = useMemo(
    () => createQueueSignature(session.queue, activeTaskTypes),
    [session.queue, activeTaskTypes],
  );

  useEffect(() => {
    if (previousScopeKeyRef.current !== sessionScopeKey) {
      previousScopeKeyRef.current = sessionScopeKey;
      setShouldReloadTasks(true);
    }
  }, [sessionScopeKey]);

  useEffect(() => {
    if (userId === undefined) {
      return;
    }

    const previous = sessionHydrationRef.current;
    if (previous.scopeKey === sessionScopeKey && previous.userId === userId) {
      return;
    }

    sessionHydrationRef.current = { scopeKey: sessionScopeKey, userId };
    setSession(loadPracticeSession({ scopeKey: sessionScopeKey, userId }));
    setTasksById({});
    setShouldReloadTasks(true);
  }, [sessionScopeKey, userId]);

  useEffect(() => {
    if (userId === undefined) {
      return;
    }

    savePracticeSession(session, { scopeKey: sessionScopeKey, userId });
  }, [session, sessionScopeKey, userId]);

  useEffect(() => {
    if (pendingResult && pendingResult.task.taskId !== session.activeTaskId) {
      setPendingResult(null);
    }
  }, [pendingResult, session.activeTaskId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (
      !session.leitner ||
      session.leitner.totalUnique === 0 ||
      session.leitner.seenUnique < session.leitner.totalUnique
    ) {
      lastAllInteractedQueueSignatureRef.current = null;
    }
  }, [session.leitner?.seenUnique, session.leitner?.totalUnique, session.leitner]);

  const fetchAndEnqueueTasks = useCallback(
    async ({ replace = false }: { replace?: boolean } = {}) => {
      if (pendingFetchRef.current || !activeTaskTypes.length) {
        return;
      }

      const currentSession = sessionRef.current;
      const baseQueue = replace ? [] : currentSession.queue;
      const baseSignature = createQueueSignature(baseQueue, activeTaskTypes);

      pendingFetchRef.current = true;
      setIsFetchingTasks(true);

      try {
        const perTypeLimit = Math.max(1, Math.ceil(FETCH_LIMIT / activeTaskTypes.length));
        const { tasksByType: fetchedTasks, errors: taskFetchErrors } = await fetchTasksForActiveTypes({
          taskTypes: activeTaskTypes,
          perTypeLimit,
          resolveLevelForPos,
        });

        const tasks = mergeTaskLists(fetchedTasks, FETCH_LIMIT);

        if (!tasks.length) {
          if (taskFetchErrors.length) {
            setHasBlockingFetchError(true);
            setFetchError("We couldn't load additional practice tasks. Please try again in a moment.");
          } else if (!baseQueue.length) {
            setHasBlockingFetchError(true);
            setFetchError(
              'No practice tasks are available for your current scope right now. Try adjusting your practice scope or check back later.',
            );
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
          setHasBlockingFetchError(true);
          setFetchError(
            'No practice tasks are available for your current scope right now. Try adjusting your practice scope or check back later.',
          );
          return;
        }

        lastFailedQueueSignatureRef.current = null;
        if (taskFetchErrors.length) {
          setHasBlockingFetchError(false);
          setFetchError('Some practice tasks failed to load. Showing the available tasks while we retry.');
        } else {
          setHasBlockingFetchError(false);
          setFetchError(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load practice tasks';
        console.error('[home] Unable to fetch practice tasks', error);
        lastFailedQueueSignatureRef.current = null;
        setHasBlockingFetchError(true);
        setFetchError(message);
      } finally {
        pendingFetchRef.current = false;
        setIsFetchingTasks(false);
      }
    },
    [activeTaskTypes, resolveLevelForPos],
  );

  useEffect(() => {
    if (hasBlockingFetchError) {
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

    if (
      session.leitner &&
      session.leitner.totalUnique > 0 &&
      session.leitner.seenUnique >= session.leitner.totalUnique &&
      !isFetchingTasks &&
      lastAllInteractedQueueSignatureRef.current !== queueSignature
    ) {
      lastAllInteractedQueueSignatureRef.current = queueSignature;
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
    fetchAndEnqueueTasks,
    hasBlockingFetchError,
    isFetchingTasks,
    queueSignature,
    session.activeTaskId,
    session.leitner?.serverExhausted,
    session.leitner?.seenUnique,
    session.leitner?.totalUnique,
    session.queue.length,
    tasksById,
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

  const continueToNext = useCallback(() => {
    setPendingResult((current) => {
      const taskId = current?.task.taskId;
      if (!taskId) {
        return current;
      }

      setSession((prev) => {
        const updated = completeTask(prev, taskId, current?.result);

        if (!updated.queue.includes(taskId)) {
          setTasksById((previous) => {
            if (!(taskId in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[taskId];
            return next;
          });
        }

        return updated;
      });

      return null;
    });
  }, []);

  const skipActiveTask = useCallback(() => {
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

  const reloadQueue = useCallback(async () => {
    lastFailedQueueSignatureRef.current = null;
    setHasBlockingFetchError(false);
    setFetchError(null);
    await fetchAndEnqueueTasks({ replace: true });
  }, [fetchAndEnqueueTasks]);

  useEffect(() => {
    if (!session.leitner?.serverExhausted) {
      lastAutoReloadSignatureRef.current = null;
      return;
    }

    const signature = lastFailedQueueSignatureRef.current;
    if (!signature || lastAutoReloadSignatureRef.current === signature) {
      return;
    }

    lastAutoReloadSignatureRef.current = signature;
    void reloadQueue();
  }, [reloadQueue, session.leitner?.serverExhausted]);

  const resetFetchError = useCallback(() => {
    lastFailedQueueSignatureRef.current = null;
    setHasBlockingFetchError(false);
    setFetchError(null);
  }, []);

  const queueDiagnostics = useMemo<QueueDiagnosticsSnapshot>(
    () => ({
      queueLength: session.queue.length,
      threshold: MIN_QUEUE_THRESHOLD,
      lastFailedSignature: lastFailedQueueSignatureRef.current,
      isServerExhausted: Boolean(session.leitner?.serverExhausted),
    }),
    [session.leitner?.serverExhausted, session.queue.length],
  );

  const registerPendingResult = useCallback((result: PracticeCardResult | null) => {
    setPendingResult(result);
  }, []);

  const isInitialLoading = !activeTask && isFetchingTasks;

  return {
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
    requestQueueReload: () => setShouldReloadTasks(true),
    reloadQueue,
    resetFetchError,
  };
}
