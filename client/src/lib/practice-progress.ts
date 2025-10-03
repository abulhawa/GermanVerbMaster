import type { PracticeProgressState, TaskProgressLexemeRecord, TaskProgressSummary, TaskType } from '@shared';
import type { CEFRLevel } from '@shared';

const STORAGE_KEY = 'practice.progress';
const LEGACY_STORAGE_KEY = 'progress';
const MIGRATION_MARKER_KEY = 'practice.progress.migrated';

interface LegacyProgress {
  correct: number;
  total: number;
  lastPracticed: string;
  streak: number;
  practicedVerbs: Record<CEFRLevel, string[]>;
}

const EMPTY_SUMMARY: TaskProgressSummary = {
  correctAttempts: 0,
  incorrectAttempts: 0,
  streak: 0,
  lastPracticedAt: null,
  lexemes: {},
};

function createEmptyTotals(): Record<TaskType, TaskProgressSummary> {
  return {
    conjugate_form: { ...EMPTY_SUMMARY, lexemes: {} },
    noun_case_declension: { ...EMPTY_SUMMARY, lexemes: {} },
    adj_ending: { ...EMPTY_SUMMARY, lexemes: {} },
  };
}

export function createEmptyProgressState(): PracticeProgressState {
  return {
    version: 1,
    totals: createEmptyTotals(),
    lastPracticedTaskId: null,
  } satisfies PracticeProgressState;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      return window.localStorage;
    }
    if (typeof globalThis.localStorage !== 'undefined') {
      return globalThis.localStorage;
    }
    return null;
  } catch (error) {
    console.warn('Local storage unavailable for practice progress:', error);
    return null;
  }
}

function parseLegacyProgress(raw: string): LegacyProgress | null {
  try {
    const parsed = JSON.parse(raw) as LegacyProgress;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse legacy practice progress, ignoring', error);
    return null;
  }
}

function convertLegacyProgress(progress: LegacyProgress): PracticeProgressState {
  const state = createEmptyProgressState();
  const summary: TaskProgressSummary = {
    ...EMPTY_SUMMARY,
    correctAttempts: progress.correct,
    incorrectAttempts: Math.max(progress.total - progress.correct, 0),
    streak: progress.streak,
    lastPracticedAt: progress.lastPracticed || null,
    lexemes: {},
  };

  for (const [level, verbs] of Object.entries(progress.practicedVerbs ?? {})) {
    const cefrLevel = level as CEFRLevel;
    for (const verb of verbs ?? []) {
      const lexemeId = `legacy:verb:${verb}`;
      const record: TaskProgressLexemeRecord = {
        lexemeId,
        taskId: lexemeId,
        lastPracticedAt: progress.lastPracticed || new Date().toISOString(),
        correctAttempts: 1,
        incorrectAttempts: 0,
        cefrLevel,
      };
      summary.lexemes[lexemeId] = record;
    }
  }

  state.totals.conjugate_form = summary;
  state.lastPracticedTaskId = null;
  state.migratedFromLegacy = true;
  return state;
}

function migrateLegacyProgress(storage: Storage): PracticeProgressState {
  const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
  const legacy = legacyRaw ? parseLegacyProgress(legacyRaw) : null;
  const migrated = legacy ? convertLegacyProgress(legacy) : createEmptyProgressState();

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch (error) {
    console.warn('Failed to persist migrated practice progress', error);
  }

  storage.setItem(MIGRATION_MARKER_KEY, '1');
  storage.removeItem(LEGACY_STORAGE_KEY);
  return migrated;
}

function parseProgress(raw: string): PracticeProgressState | null {
  try {
    const parsed = JSON.parse(raw) as PracticeProgressState;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse practice progress, resetting', error);
    return null;
  }
}

function ensureState(storage: Storage): PracticeProgressState {
  const marker = storage.getItem(MIGRATION_MARKER_KEY);
  if (marker !== '1') {
    return migrateLegacyProgress(storage);
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyProgressState();
  }

  const parsed = parseProgress(raw);
  if (!parsed) {
    storage.removeItem(STORAGE_KEY);
    return createEmptyProgressState();
  }
  return parsed;
}

export function loadPracticeProgress(): PracticeProgressState {
  const storage = getStorage();
  if (!storage) {
    return createEmptyProgressState();
  }

  return ensureState(storage);
}

export function savePracticeProgress(state: PracticeProgressState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    storage.setItem(MIGRATION_MARKER_KEY, '1');
  } catch (error) {
    console.warn('Failed to persist practice progress', error);
  }
}

export interface RecordTaskResultInput {
  taskId: string;
  lexemeId: string;
  taskType: TaskType;
  result: 'correct' | 'incorrect';
  practicedAt?: string;
  cefrLevel?: CEFRLevel;
}

export function recordTaskResult(
  state: PracticeProgressState,
  input: RecordTaskResultInput,
): PracticeProgressState {
  const timestamp = input.practicedAt ?? new Date().toISOString();
  const existingSummary = state.totals[input.taskType];
  const summary: TaskProgressSummary = existingSummary
    ? {
        ...existingSummary,
        lexemes: { ...existingSummary.lexemes },
      }
    : {
        ...EMPTY_SUMMARY,
        lexemes: {},
      };

  const existingRecord = summary.lexemes[input.lexemeId];
  const lexemeRecord: TaskProgressLexemeRecord = existingRecord
    ? { ...existingRecord }
    : {
        lexemeId: input.lexemeId,
        taskId: input.taskId,
        lastPracticedAt: timestamp,
        correctAttempts: 0,
        incorrectAttempts: 0,
        cefrLevel: input.cefrLevel,
      };

  if (input.result === 'correct') {
    summary.correctAttempts += 1;
    lexemeRecord.correctAttempts += 1;
    summary.streak += 1;
  } else {
    summary.incorrectAttempts += 1;
    lexemeRecord.incorrectAttempts += 1;
    summary.streak = 0;
  }

  lexemeRecord.lastPracticedAt = timestamp;
  summary.lexemes[input.lexemeId] = lexemeRecord;
  summary.lastPracticedAt = timestamp;

  return {
    ...state,
    totals: {
      ...state.totals,
      [input.taskType]: summary,
    },
    lastPracticedTaskId: input.taskId,
  };
}
