export interface LeitnerEntryState {
  box: number;
  dueStep: number;
  seen: number;
}

export interface LeitnerState {
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

export const CURRENT_SESSION_STATE_VERSION = 3;
export const MAX_RECENT_HISTORY = 50;

export function cloneLeitnerState(state: LeitnerState | null): LeitnerState | null {
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
  } satisfies PracticeSessionState;
}
