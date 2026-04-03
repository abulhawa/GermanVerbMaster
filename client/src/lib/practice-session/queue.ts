import type { PracticeResult } from '@shared';

import type { PracticeTask } from '@/lib/tasks';

import {
  cloneLeitnerState,
  MAX_RECENT_HISTORY,
  type LeitnerEntryState,
  type LeitnerState,
  type PracticeSessionState,
} from './state';

const LEITNER_INTERVAL_PRESETS: Array<{ max: number; intervals: number[] }> = [
  { max: 6, intervals: [1, 3, 6] },
  { max: 12, intervals: [1, 4, 8, 14] },
  { max: Number.POSITIVE_INFINITY, intervals: [1, 4, 9, 16, 24] },
];

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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

  const shuffledDueNow = shuffleArray(dueNow);
  shuffledDueNow.sort((a, b) => {
    if (a.dueStep !== b.dueStep) {
      return a.dueStep - b.dueStep;
    }
    return 0;
  });

  for (const entry of shuffledDueNow) {
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

function buildRecentHistory(recent: string[], taskId: string): string[] {
  const filteredRecent = recent.filter((id) => id !== taskId);
  filteredRecent.unshift(taskId);
  return filteredRecent.slice(0, MAX_RECENT_HISTORY);
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
  const shuffledTasks = shuffleArray(tasks);

  for (const task of shuffledTasks) {
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
  const nextRecent = buildRecentHistory(state.recent, taskId);

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

export function skipTask(state: PracticeSessionState, taskId: string): PracticeSessionState {
  const remainingQueue = state.queue.filter((id) => id !== taskId);
  const nextRecent = buildRecentHistory(state.recent, taskId);

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
    nextLeitner.step += 1;
    entry.seen = previousSeen + 1;
    if (previousSeen === 0 && nextLeitner.seenUnique < nextLeitner.totalUnique) {
      nextLeitner.seenUnique += 1;
    }

    // Skips should move the card behind the rest of the current batch so the
    // refill logic does not immediately surface it again.
    const deferSteps = Math.max(1, remainingQueue.length + 1);
    entry.dueStep = nextLeitner.step + deferSteps;
    nextLeitner.entries[taskId] = entry;

    const { queue: replenishedQueue, leitner: updatedLeitner } = refillQueueFromLeitner(
      remainingQueue,
      nextLeitner,
    );

    nextLeitner = updatedLeitner;
    if (updatedLeitner) {
      if (updatedLeitner.seenUnique < updatedLeitner.totalUnique) {
        reviewSession = false;
      }
    } else {
      reviewSession = false;
    }

    const nextActive = replenishedQueue[0] ?? null;

    return {
      ...state,
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
    queue: remainingQueue,
    activeTaskId: nextActive,
    recent: nextRecent,
    leitner: nextLeitner,
    isReviewSession: reviewSession,
  } satisfies PracticeSessionState;
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

export const __TEST_ONLY__ = {
  refillQueueFromLeitner,
  shuffleArray,
};
