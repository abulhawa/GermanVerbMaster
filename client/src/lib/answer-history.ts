import { resolveLocalStorage } from '@/lib/storage';
import { clientTaskRegistry } from '@/lib/tasks';
import type { PracticeTask } from '@/lib/tasks';
import type {
  AnswerHistoryLexemeSnapshot,
  CEFRLevel,
  PracticeMode,
  PracticeResult,
  TaskAnswerHistoryItem,
} from '@shared';
import type { GermanVerb } from '@shared';

const ANSWER_HISTORY_STORAGE_KEY = 'practice.answerHistory';
const LEGACY_STORAGE_KEY = 'answerHistory';
const MIGRATION_MARKER_KEY = 'practice.answerHistory.migrated';
const STORAGE_CONTEXT = 'answer history';
export const DEFAULT_MAX_STORED_ANSWERS = 60;

interface LegacyAnsweredQuestion {
  id: string;
  verb: GermanVerb;
  mode: PracticeMode;
  result: PracticeResult;
  attemptedAnswer: string;
  correctAnswer: string;
  prompt: string;
  timeSpent: number;
  answeredAt: string;
  level: string;
}

interface CreateHistoryEntryOptions {
  task: PracticeTask;
  result: PracticeResult;
  submittedResponse: unknown;
  expectedResponse?: unknown;
  promptSummary: string;
  timeSpentMs: number;
  answeredAt?: string;
}

export interface LegacyAnswerHistoryEntryOptions {
  id: string;
  verb: GermanVerb;
  mode: PracticeMode;
  result: PracticeResult;
  attemptedAnswer: string;
  correctAnswer: string;
  prompt: string;
  timeSpentMs: number;
  answeredAt?: string;
  level: CEFRLevel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function toLexemeSnapshotFromVerb(
  verb: GermanVerb,
  level?: CEFRLevel,
): AnswerHistoryLexemeSnapshot {
  return {
    id: `legacy:verb:${verb.infinitive}`,
    lemma: verb.infinitive,
    pos: 'verb',
    level,
    english: verb.english,
    example: verb.präteritumExample
      ? { de: verb.präteritumExample }
      : undefined,
    auxiliary: verb.auxiliary,
  } satisfies AnswerHistoryLexemeSnapshot;
}

function extractLexemeSnapshotFromTask(task: PracticeTask): AnswerHistoryLexemeSnapshot | undefined {
  const metadata = task.lexeme.metadata;
  let level: CEFRLevel | undefined;
  let english: string | undefined;
  let exampleDe: string | null | undefined;
  let exampleEn: string | null | undefined;
  let auxiliary: 'haben' | 'sein' | 'haben / sein' | null | undefined;

  if (isRecord(metadata)) {
    if (typeof metadata.level === 'string') {
      const upperLevel = metadata.level.toUpperCase();
      if (upperLevel === 'A1' || upperLevel === 'A2' || upperLevel === 'B1' || upperLevel === 'B2' || upperLevel === 'C1' || upperLevel === 'C2') {
        level = upperLevel as CEFRLevel;
      }
    }
    if (typeof metadata.english === 'string') {
      english = metadata.english;
    }
    if (isRecord(metadata.example)) {
      if (typeof metadata.example.de === 'string') {
        exampleDe = metadata.example.de;
      }
      if (typeof metadata.example.en === 'string') {
        exampleEn = metadata.example.en;
      }
    }
    if (
      metadata.auxiliary === 'haben'
      || metadata.auxiliary === 'sein'
      || metadata.auxiliary === 'haben / sein'
    ) {
      auxiliary = metadata.auxiliary;
    }
  }

  return {
    id: task.lexeme.id,
    lemma: task.lexeme.lemma,
    pos: task.pos,
    level,
    english,
    example:
      typeof exampleDe === 'string' || typeof exampleEn === 'string'
        ? { de: exampleDe ?? undefined, en: exampleEn ?? undefined }
        : undefined,
    auxiliary: typeof auxiliary === 'string' ? auxiliary : undefined,
  } satisfies AnswerHistoryLexemeSnapshot;
}

function ensureLexemeSnapshot(entry: TaskAnswerHistoryItem): TaskAnswerHistoryItem {
  if (entry.lexeme) {
    return entry;
  }

  if (entry.verb) {
    return { ...entry, lexeme: toLexemeSnapshotFromVerb(entry.verb, entry.level ?? entry.cefrLevel) };
  }

  if (entry.legacyVerb?.verb) {
    return {
      ...entry,
      lexeme: toLexemeSnapshotFromVerb(entry.legacyVerb.verb, entry.level ?? entry.cefrLevel),
    };
  }

  return entry;
}

export function createLegacyAnswerHistoryEntry(options: LegacyAnswerHistoryEntryOptions): TaskAnswerHistoryItem {
  const legacyId = `legacy:verb:${options.verb.infinitive}`;
  const answeredAt = options.answeredAt ?? new Date().toISOString();
  const lexeme = toLexemeSnapshotFromVerb(options.verb, options.level);

  return {
    id: options.id,
    taskId: legacyId,
    lexemeId: legacyId,
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: clientTaskRegistry.conjugate_form.renderer,
    result: options.result,
    submittedResponse: options.attemptedAnswer,
    expectedResponse: options.correctAnswer,
    promptSummary: options.prompt,
    answeredAt,
    timeSpentMs: options.timeSpentMs,
    timeSpent: options.timeSpentMs,
    cefrLevel: options.level,
    packId: null,
    mode: options.mode,
    attemptedAnswer: options.attemptedAnswer,
    correctAnswer: options.correctAnswer,
    prompt: options.prompt,
    level: options.level,
    lexeme,
    verb: options.verb,
    legacyVerb: {
      verb: options.verb,
      mode: options.mode,
    },
  };
}

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

function createLegacyHistoryEntry(entry: LegacyAnsweredQuestion): TaskAnswerHistoryItem {
  return createLegacyAnswerHistoryEntry({
    id: entry.id,
    verb: entry.verb,
    mode: entry.mode,
    result: entry.result,
    attemptedAnswer: entry.attemptedAnswer,
    correctAnswer: entry.correctAnswer,
    prompt: entry.prompt,
    timeSpentMs: entry.timeSpent,
    answeredAt: entry.answeredAt,
    level: entry.level as CEFRLevel,
  });
}

function parseLegacyEntries(raw: string): TaskAnswerHistoryItem[] {
  try {
    const parsed = JSON.parse(raw) as LegacyAnsweredQuestion[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(createLegacyHistoryEntry);
  } catch (error) {
    console.warn('Failed to parse legacy answer history from storage, ignoring', error);
    return [];
  }
}

function migrateLegacyEntries(storage: Storage): TaskAnswerHistoryItem[] {
  const marker = storage.getItem(MIGRATION_MARKER_KEY);
  if (marker === '1') {
    const current = storage.getItem(ANSWER_HISTORY_STORAGE_KEY);
    if (!current) {
      return [];
    }

    try {
      const parsed = JSON.parse(current) as TaskAnswerHistoryItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Failed to parse migrated answer history, resetting', error);
      storage.removeItem(ANSWER_HISTORY_STORAGE_KEY);
      return [];
    }
  }

  const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
  const entries = legacyRaw ? parseLegacyEntries(legacyRaw) : [];

  if (entries.length) {
    try {
      storage.setItem(ANSWER_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, DEFAULT_MAX_STORED_ANSWERS)));
    } catch (error) {
      console.warn('Unable to persist migrated answer history', error);
    }
  } else {
    storage.removeItem(ANSWER_HISTORY_STORAGE_KEY);
  }

  storage.setItem(MIGRATION_MARKER_KEY, '1');
  storage.removeItem(LEGACY_STORAGE_KEY);
  return entries;
}

function ensureMigrated(storage: Storage): TaskAnswerHistoryItem[] {
  const marker = storage.getItem(MIGRATION_MARKER_KEY);
  if (marker !== '1') {
    return migrateLegacyEntries(storage);
  }

  const existing = storage.getItem(ANSWER_HISTORY_STORAGE_KEY);
  if (!existing) {
    return [];
  }

  try {
    const parsed = JSON.parse(existing) as TaskAnswerHistoryItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse answer history, clearing storage', error);
    storage.removeItem(ANSWER_HISTORY_STORAGE_KEY);
    return [];
  }
}

export function createAnswerHistoryEntry(options: CreateHistoryEntryOptions): TaskAnswerHistoryItem {
  const answeredAt = options.answeredAt ?? new Date().toISOString();
  const submitted = options.submittedResponse;
  const expected = options.expectedResponse;
  const lexeme = extractLexemeSnapshotFromTask(options.task);

  return {
    id: `${options.task.taskId}:${answeredAt}`,
    taskId: options.task.taskId,
    lexemeId: options.task.lexemeId,
    taskType: options.task.taskType,
    pos: options.task.pos,
    renderer: options.task.renderer,
    result: options.result,
    submittedResponse: options.submittedResponse,
    expectedResponse: options.expectedResponse,
    promptSummary: options.promptSummary,
    answeredAt,
    timeSpentMs: options.timeSpentMs,
    timeSpent: options.timeSpentMs,
    cefrLevel: options.task.lexeme.metadata?.level as TaskAnswerHistoryItem['cefrLevel'] | undefined,
    packId: options.task.pack?.id ?? null,
    mode: undefined,
    attemptedAnswer: typeof submitted === 'string' ? submitted : undefined,
    correctAnswer: typeof expected === 'string' ? expected : undefined,
    prompt: options.promptSummary,
    level: options.task.lexeme.metadata?.level as CEFRLevel | undefined,
    lexeme,
    verb: undefined,
    legacyVerb: undefined,
  } satisfies TaskAnswerHistoryItem;
}

export function loadAnswerHistory(): TaskAnswerHistoryItem[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  return ensureMigrated(storage)
    .slice(0, DEFAULT_MAX_STORED_ANSWERS)
    .map(ensureLexemeSnapshot);
}

export function saveAnswerHistory(history: TaskAnswerHistoryItem[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const normalised = history
      .slice(0, DEFAULT_MAX_STORED_ANSWERS)
      .map(ensureLexemeSnapshot);
    storage.setItem(ANSWER_HISTORY_STORAGE_KEY, JSON.stringify(normalised));
    storage.setItem(MIGRATION_MARKER_KEY, '1');
  } catch (error) {
    console.warn('Failed to persist answer history', error);
  }
}

export function appendAnswer(
  entry: TaskAnswerHistoryItem,
  history: TaskAnswerHistoryItem[],
  limit = DEFAULT_MAX_STORED_ANSWERS,
): TaskAnswerHistoryItem[] {
  const nextHistory = [entry, ...history];
  return nextHistory.slice(0, Math.max(limit, 1));
}

export type AnsweredQuestion = TaskAnswerHistoryItem;

export type { TaskAnswerHistoryItem };
