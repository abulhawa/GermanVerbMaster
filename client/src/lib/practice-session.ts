import { resolveLocalStorage } from '@/lib/storage';
import type { PracticeTask } from '@/lib/tasks';
import type { PracticeResult } from '@shared';

interface LeitnerEntryState {
  box: number;
  dueStep: number;
  seen: number;
}

interface LeitnerState {
  intervals: number[];
  step: number;
  entries: Record<string, LeitnerEntryState>;
  seenUnique: number;
  totalUnique: number;
  serverExhausted: boolean;
}

export interface PracticeSessionState {
  version: number;
  activeTaskId: string | null;
  queue: string[];
  completed: string[];
  fetchedAt: string | null;
  recent: string[];
  leitner: LeitnerState | null;
  isReviewSession: boolean;
}

const STORAGE_KEY = 'practice.session';
const STORAGE_CONTEXT = 'practice session';
const PERSISTED_SESSION_VERSION = 1;
const CURRENT_SESSION_STATE_VERSION = 3;
const DEFAULT_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface PersistedPracticeSessionEnvelope {
  version: number;
  savedAt: string;
  scopeKey: string | null;
  userId: string | null;
  state: PracticeSessionState;
}

export interface LoadPracticeSessionOptions {
  scopeKey?: string | null;
  userId?: string | null;
  now?: Date;
  expiryMs?: number;
}

export interface SavePracticeSessionOptions {
  scopeKey?: string | null;
  userId?: string | null;
  now?: Date;
}

const MAX_RECENT_HISTORY = 50;

const LEITNER_INTERVAL_PRESETS: Array<{ max: number; intervals: number[] }> = [
  { max: 6, intervals: [1, 3, 6] },
  { max: 12, intervals: [1, 4, 8, 14] },
  { max: Number.POSITIVE_INFINITY, intervals: [1, 4, 9, 16, 24] },
];

function cloneLeitnerState(state: LeitnerState | null): LeitnerState | null {
  if (!state) {
    return null;
  }

  const entries: Record<string, LeitnerEntryState> = {};
  for (const [taskId, entry] of Object.entries(state.entries)) {
    entries[taskId] = { ...entry } satisfies LeitnerEntryState;
  }

  return {
    intervals: [...state.intervals],
    step: state.step,
    entries,
    seenUnique: state.seenUnique,
    totalUnique: state.totalUnique,
    serverExhausted: state.serverExhausted,
  } satisfies LeitnerState;
}

function computeLeitnerIntervals(totalTasks: number): number[] {
  const preset = LEITNER_INTERVAL_PRESETS.find((option) => totalTasks <= option.max) ?? LEITNER_INTERVAL_PRESETS[0];
  return [...preset.intervals];
}

function createLeitnerStateFromTasks(tasks: PracticeTask[], baseStep = 0): LeitnerState {
  const intervals = computeLeitnerIntervals(Math.max(tasks.length, 1));
  const entries: Record<string, LeitnerEntryState> = {};
  const seenTasks = new Set<string>();

  for (const task of tasks) {
    if (seenTasks.has(task.taskId)) {
      continue;
    }
    seenTasks.add(task.taskId);
    entries[task.taskId] = {
      box: 0,
      dueStep: baseStep,
      seen: 0,
    } satisfies LeitnerEntryState;
  }

  return {
    intervals,
    step: baseStep,
    entries,
    seenUnique: 0,
    totalUnique: Object.keys(entries).length,
    serverExhausted: false,
  } satisfies LeitnerState;
}

function ensureLeitnerState(
  state: PracticeSessionState,
  tasks: PracticeTask[],
  replace: boolean,
): LeitnerState | null {
  if (replace) {
    return createLeitnerStateFromTasks(tasks);
  }

  const cloned = cloneLeitnerState(state.leitner);
  if (cloned) {
    return cloned;
  }

  if (!tasks.length) {
    return null;
  }

  return createLeitnerStateFromTasks(tasks);
}

function refillQueueFromLeitner(
  queue: string[],
  leitner: LeitnerState | null,
  { forceAtLeastOne = false }: { forceAtLeastOne?: boolean } = {},
): { queue: string[]; leitner: LeitnerState | null; reviewStarted: boolean } {
  if (!leitner) {
    return { queue, leitner, reviewStarted: false };
  }

  const nextQueue = [...queue];
  const queueSet = new Set(nextQueue);
  const dueNow: Array<{ taskId: string; dueStep: number; box: number }> = [];
  let earliestFuture: { taskId: string; dueStep: number } | null = null;

  for (const [taskId, entry] of Object.entries(leitner.entries)) {
    if (queueSet.has(taskId)) {
      continue;
    }
    if (entry.dueStep <= leitner.step) {
      dueNow.push({ taskId, dueStep: entry.dueStep, box: entry.box });
    } else if (!earliestFuture || entry.dueStep < earliestFuture.dueStep) {
      earliestFuture = { taskId, dueStep: entry.dueStep };
    }
  }

  dueNow.sort((a, b) => {
    if (a.dueStep !== b.dueStep) {
      return a.dueStep - b.dueStep;
    }
    return a.box - b.box;
  });

  for (const entry of dueNow) {
    if (queueSet.has(entry.taskId)) {
      continue;
    }
    queueSet.add(entry.taskId);
    nextQueue.push(entry.taskId);
  }

  let reviewStarted = false;
  if (nextQueue.length === 0 && forceAtLeastOne && earliestFuture) {
    const entry = leitner.entries[earliestFuture.taskId];
    if (entry && leitner.step < earliestFuture.dueStep) {
      leitner.step = earliestFuture.dueStep;
    }
    queueSet.add(earliestFuture.taskId);
    nextQueue.push(earliestFuture.taskId);
    reviewStarted = true;
  }

  return { queue: nextQueue, leitner, reviewStarted };
}

export function createEmptySessionState(): PracticeSessionState {
  return {
    version: CURRENT_SESSION_STATE_VERSION,
    activeTaskId: null,
    queue: [],
    completed: [],
    fetchedAt: null,
    recent: [],
    leitner: null,
    isReviewSession: false,
  } satisfies PracticeSessionState;
}

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

function normaliseScopeKey(scopeKey?: string | null): string | null {
  if (!scopeKey) {
    return null;
  }
  const trimmed = scopeKey.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.replace(/[^0-9a-zA-Z_-]+/g, '-');
  const collapsedHyphen = sanitized.replace(/-{2,}/g, '-');
  const collapsedUnderscore = collapsedHyphen.replace(/_{2,}/g, '_');
  const normalized = collapsedUnderscore.replace(/^[-_]+|[-_]+$/g, '');

  return normalized.length ? normalized : null;
}

function resolveStorageKey(scopeKey?: string | null): string {
  const normalised = normaliseScopeKey(scopeKey);
  if (!normalised) {
    return STORAGE_KEY;
  }
  return `${STORAGE_KEY}.${normalised}`;
}

function parsePersistedSession(raw: string): PersistedPracticeSessionEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as PersistedPracticeSessionEnvelope | PracticeSessionState | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if ('state' in parsed && typeof parsed.state === 'object') {
      return parsed as PersistedPracticeSessionEnvelope;
    }

    // Legacy format: plain session state without envelope metadata.
    if ('queue' in parsed) {
      return {
        version: 0,
        savedAt: '',
        scopeKey: null,
        userId: null,
        state: parsed as PracticeSessionState,
      } satisfies PersistedPracticeSessionEnvelope;
    }

    return null;
  } catch (error) {
    console.warn('Failed to parse practice session state, resetting', error);
    return null;
  }
}

function sanitiseLoadedState(state: PracticeSessionState): PracticeSessionState {
  const parsedRecent = Array.isArray(state.recent)
    ? state.recent.filter((value): value is string => typeof value === 'string')
    : [];
  const uniqueRecent = Array.from(new Set(parsedRecent));

  const baseState = {
    ...createEmptySessionState(),
    ...state,
    recent: uniqueRecent.slice(0, MAX_RECENT_HISTORY),
  } satisfies PracticeSessionState;

  if (baseState.version < 2) {
    baseState.version = 2;
    baseState.leitner = null;
    baseState.isReviewSession = false;
  }

  if (baseState.version < CURRENT_SESSION_STATE_VERSION) {
    baseState.version = CURRENT_SESSION_STATE_VERSION;
  }

  return baseState;
}

function shouldDiscardPersistedSession(
  envelope: PersistedPracticeSessionEnvelope,
  options: LoadPracticeSessionOptions,
): boolean {
  if (envelope.version !== PERSISTED_SESSION_VERSION) {
    return true;
  }

  const expectedScope = normaliseScopeKey(options.scopeKey ?? null);
  if (expectedScope && envelope.scopeKey !== expectedScope) {
    return true;
  }
  if (expectedScope === null && envelope.scopeKey) {
    return true;
  }

  if (typeof options.userId !== 'undefined') {
    const expectedUserId = options.userId ?? null;
    if ((envelope.userId ?? null) !== expectedUserId) {
      return true;
    }
  }

  const expiryMs = typeof options.expiryMs === 'number' ? options.expiryMs : DEFAULT_SESSION_EXPIRY_MS;
  const now = options.now?.getTime() ?? Date.now();
  const savedAt = Date.parse(envelope.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > expiryMs) {
    return true;
  }

  return false;
}

export function loadPracticeSession(options: LoadPracticeSessionOptions = {}): PracticeSessionState {
  const storage = getStorage();
  if (!storage) {
    return createEmptySessionState();
  }

  const storageKey = resolveStorageKey(options.scopeKey);
  const raw = storage.getItem(storageKey);
  if (!raw) {
    return createEmptySessionState();
  }

  const parsed = parsePersistedSession(raw);
  if (!parsed) {
    storage.removeItem(storageKey);
    return createEmptySessionState();
  }

  if (parsed.version === 0) {
    // Legacy session without metadata should be discarded so we don't reuse stale tasks.
    storage.removeItem(storageKey);
    return createEmptySessionState();
  }

  if (shouldDiscardPersistedSession(parsed, options)) {
    storage.removeItem(storageKey);
    return createEmptySessionState();
  }

  return sanitiseLoadedState(parsed.state);
}

export function savePracticeSession(
  state: PracticeSessionState,
  options: SavePracticeSessionOptions = {},
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const storageKey = resolveStorageKey(options.scopeKey);
  const envelope: PersistedPracticeSessionEnvelope = {
    version: PERSISTED_SESSION_VERSION,
    savedAt: (options.now ?? new Date()).toISOString(),
    scopeKey: normaliseScopeKey(options.scopeKey ?? null),
    userId: options.userId ?? null,
    state: { ...state, version: CURRENT_SESSION_STATE_VERSION },
  };

  try {
    storage.setItem(storageKey, JSON.stringify(envelope));
  } catch (error) {
    console.warn('Failed to persist practice session state', error);
  }
}

export function enqueueTasks(
  state: PracticeSessionState,
  tasks: PracticeTask[],
  options: { replace?: boolean; ignoreRecent?: boolean } = {},
): PracticeSessionState {
  const { replace = false } = options;
  const ignoreRecent = options.ignoreRecent ?? (replace || Boolean(state.leitner));
  const nextQueue = replace ? [] : [...state.queue];
  const seen = new Set(nextQueue);

  if (!ignoreRecent) {
    for (const taskId of state.recent) {
      seen.add(taskId);
    }
  }

  let nextLeitner = ensureLeitnerState(state, tasks, replace);
  if (nextLeitner && replace) {
    nextLeitner.serverExhausted = false;
  }

  let reviewSession = replace ? false : state.isReviewSession;

  for (const task of tasks) {
    const existingEntry = nextLeitner?.entries[task.taskId];

    if (nextLeitner && !existingEntry) {
      nextLeitner.entries[task.taskId] = {
        box: 0,
        dueStep: nextLeitner.step,
        seen: 0,
      } satisfies LeitnerEntryState;
      nextLeitner.totalUnique += 1;
      nextLeitner.serverExhausted = false;
    }

    const entry = nextLeitner?.entries[task.taskId];

    if (entry && nextLeitner && entry.dueStep > nextLeitner.step && !seen.has(task.taskId)) {
      continue;
    }

    if (seen.has(task.taskId)) {
      continue;
    }
    seen.add(task.taskId);
    nextQueue.push(task.taskId);
  }

  const { queue: filledQueue, leitner: updatedLeitner } = refillQueueFromLeitner(nextQueue, nextLeitner);

  if (updatedLeitner) {
    if (updatedLeitner.seenUnique < updatedLeitner.totalUnique) {
      reviewSession = false;
    }
  } else {
    reviewSession = false;
  }

  const candidateActive = state.activeTaskId && filledQueue.includes(state.activeTaskId) ? state.activeTaskId : null;
  const nextActive = candidateActive ?? filledQueue[0] ?? null;

  return {
    ...state,
    queue: filledQueue,
    activeTaskId: nextActive,
    fetchedAt: new Date().toISOString(),
    leitner: updatedLeitner,
    isReviewSession: reviewSession,
  } satisfies PracticeSessionState;
}

export function completeTask(state: PracticeSessionState, taskId: string, result?: PracticeResult): PracticeSessionState {
  const nextCompleted = state.completed.includes(taskId) ? state.completed : [...state.completed, taskId];
  const remainingQueue = state.queue.filter((id) => id !== taskId);
  const filteredRecent = state.recent.filter((id) => id !== taskId);
  filteredRecent.unshift(taskId);
  const nextRecent = filteredRecent.slice(0, MAX_RECENT_HISTORY);

  let nextLeitner = cloneLeitnerState(state.leitner);
  let reviewSession = state.isReviewSession;

  if (nextLeitner) {
    const existingEntry = nextLeitner.entries[taskId];
    const entry = existingEntry ?? {
      box: 0,
      dueStep: nextLeitner.step,
      seen: 0,
    } satisfies LeitnerEntryState;

    if (!existingEntry) {
      nextLeitner.entries[taskId] = entry;
      nextLeitner.totalUnique += 1;
    }

    const previousSeen = entry.seen;
    const maxBoxIndex = Math.max(0, nextLeitner.intervals.length - 1);
    if (result === 'correct') {
      entry.box = Math.min(entry.box + 1, maxBoxIndex);
    } else {
      entry.box = 0;
    }

    nextLeitner.step += 1;
    entry.seen = previousSeen + 1;
    if (previousSeen === 0 && nextLeitner.seenUnique < nextLeitner.totalUnique) {
      nextLeitner.seenUnique += 1;
    }

    const interval = nextLeitner.intervals[entry.box] ?? nextLeitner.intervals[maxBoxIndex] ?? 1;
    entry.dueStep = nextLeitner.step + interval;
    nextLeitner.entries[taskId] = entry;

    const { queue: replenishedQueue, leitner: updatedLeitner, reviewStarted } = refillQueueFromLeitner(
      remainingQueue,
      nextLeitner,
      { forceAtLeastOne: true },
    );

    nextLeitner = updatedLeitner;
    if (updatedLeitner) {
      if (updatedLeitner.seenUnique >= updatedLeitner.totalUnique && updatedLeitner.totalUnique > 0) {
        reviewSession = true;
      }
      if (reviewStarted) {
        reviewSession = true;
      }
    }

    const nextActive = replenishedQueue[0] ?? null;

    return {
      ...state,
      completed: nextCompleted,
      queue: replenishedQueue,
      activeTaskId: nextActive,
      recent: nextRecent,
      leitner: nextLeitner,
      isReviewSession: reviewSession,
    } satisfies PracticeSessionState;
  }

  const nextActive = remainingQueue[0] ?? null;

  return {
    ...state,
    completed: nextCompleted,
    queue: remainingQueue,
    activeTaskId: nextActive,
    recent: nextRecent,
    leitner: nextLeitner,
    isReviewSession: reviewSession,
  } satisfies PracticeSessionState;
}

export function resetSession(options: { scopeKey?: string | null } = {}): PracticeSessionState {
  const state = createEmptySessionState();
  const storage = getStorage();
  if (storage) {
    storage.removeItem(resolveStorageKey(options.scopeKey));
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
    leitner: null,
    isReviewSession: false,
  };
}

export function markLeitnerServerExhausted(state: PracticeSessionState): PracticeSessionState {
  if (!state.leitner || state.leitner.serverExhausted) {
    return state;
  }

  return {
    ...state,
    leitner: {
      ...state.leitner,
      serverExhausted: true,
    },
  } satisfies PracticeSessionState;
}
