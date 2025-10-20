import { resolveLocalStorage } from '@/lib/storage';
import type { PracticeTask } from '@/lib/tasks';

export interface PracticeSessionState {
  version: number;
  activeTaskId: string | null;
  queue: string[];
  completed: string[];
  fetchedAt: string | null;
  recent: string[];
}

const STORAGE_KEY = 'practice.session';
const STORAGE_CONTEXT = 'practice session';

const MAX_RECENT_HISTORY = 50;

export function createEmptySessionState(): PracticeSessionState {
  return {
    version: 1,
    activeTaskId: null,
    queue: [],
    completed: [],
    fetchedAt: null,
    recent: [],
  } satisfies PracticeSessionState;
}

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

export function loadPracticeSession(): PracticeSessionState {
  const storage = getStorage();
  if (!storage) {
    return createEmptySessionState();
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptySessionState();
  }

  try {
    const parsed = JSON.parse(raw) as PracticeSessionState;
    if (!parsed || typeof parsed !== 'object') {
      return createEmptySessionState();
    }
    const parsedRecent = Array.isArray((parsed as PracticeSessionState).recent)
      ? (parsed as PracticeSessionState).recent.filter((value): value is string => typeof value === 'string')
      : [];
    const uniqueRecent = Array.from(new Set(parsedRecent));

    return {
      ...createEmptySessionState(),
      ...parsed,
      recent: uniqueRecent.slice(0, MAX_RECENT_HISTORY),
    } satisfies PracticeSessionState;
  } catch (error) {
    console.warn('Failed to parse practice session state, resetting', error);
    storage.removeItem(STORAGE_KEY);
    return createEmptySessionState();
  }
}

export function savePracticeSession(state: PracticeSessionState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist practice session state', error);
  }
}

export function enqueueTasks(
  state: PracticeSessionState,
  tasks: PracticeTask[],
  options: { replace?: boolean; ignoreRecent?: boolean } = {},
): PracticeSessionState {
  const { replace = false, ignoreRecent = replace } = options;
  const nextQueue = replace ? [] : [...state.queue];
  const seen = new Set(nextQueue);

  if (!ignoreRecent) {
    for (const taskId of state.recent) {
      seen.add(taskId);
    }
  }

  for (const task of tasks) {
    if (seen.has(task.taskId)) {
      continue;
    }
    seen.add(task.taskId);
    nextQueue.push(task.taskId);
  }

  const candidateActive = state.activeTaskId && nextQueue.includes(state.activeTaskId) ? state.activeTaskId : null;
  const nextActive = candidateActive ?? nextQueue[0] ?? null;

  const nextState: PracticeSessionState = {
    ...state,
    queue: nextQueue,
    activeTaskId: nextActive,
    fetchedAt: new Date().toISOString(),
  };
  return nextState;
}

export function completeTask(state: PracticeSessionState, taskId: string): PracticeSessionState {
  const nextCompleted = state.completed.includes(taskId) ? state.completed : [...state.completed, taskId];
  const remainingQueue = state.queue.filter((id) => id !== taskId);
  const nextActive = remainingQueue[0] ?? null;
  const filteredRecent = state.recent.filter((id) => id !== taskId);
  filteredRecent.unshift(taskId);
  const nextRecent = filteredRecent.slice(0, MAX_RECENT_HISTORY);

  return {
    ...state,
    completed: nextCompleted,
    queue: remainingQueue,
    activeTaskId: nextActive,
    recent: nextRecent,
  };
}

export function resetSession(): PracticeSessionState {
  const state = createEmptySessionState();
  const storage = getStorage();
  if (storage) {
    storage.removeItem(STORAGE_KEY);
  }
  return state;
}

export function clearSessionQueue(
  state: PracticeSessionState,
  { preserveCompleted = false }: { preserveCompleted?: boolean } = {},
): PracticeSessionState {
  return {
    ...state,
    queue: [],
    activeTaskId: null,
    fetchedAt: null,
    completed: preserveCompleted ? state.completed : [],
  };
}
