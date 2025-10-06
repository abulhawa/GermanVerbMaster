import type {
  PracticeProgressState,
  PracticeSettingsState,
  TaskType,
  CEFRLevel,
  LexemePos,
} from '@shared';

import { clientTaskRegistry, listClientTaskTypes } from '@/lib/tasks';

export type PracticeScope = 'all' | 'verbs' | 'nouns' | 'adjectives' | 'custom';

export const AVAILABLE_TASK_TYPES = listClientTaskTypes();

export const TASK_TYPE_TO_SCOPE: Record<TaskType, PracticeScope> = {
  conjugate_form: 'verbs',
  noun_case_declension: 'nouns',
  adj_ending: 'adjectives',
};

export const SCOPE_LABELS: Record<PracticeScope, string> = {
  all: 'All tasks',
  verbs: 'Verbs only',
  nouns: 'Nouns only',
  adjectives: 'Adjectives only',
  custom: 'Custom mix',
};

export function normalisePreferredTaskTypes(taskTypes: TaskType[]): TaskType[] {
  const allowed = new Set(AVAILABLE_TASK_TYPES);
  const unique = Array.from(new Set(taskTypes.filter((type) => allowed.has(type))));
  if (unique.length > 0) {
    return unique;
  }
  return AVAILABLE_TASK_TYPES.length ? [AVAILABLE_TASK_TYPES[0]!] : ['conjugate_form'];
}

export function determineScope(taskTypes: TaskType[]): PracticeScope {
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

export function computeScope(settings: PracticeSettingsState): PracticeScope {
  const preferred = settings.preferredTaskTypes.length
    ? settings.preferredTaskTypes
    : [settings.defaultTaskType];
  return determineScope(preferred);
}

export function scopeToTaskTypes(scope: PracticeScope): TaskType[] {
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

export interface PracticeSummary {
  total: number;
  correct: number;
  streak: number;
  accuracy: number;
  uniqueLexemes: number;
  lastPracticedAt: string | null;
}

export function computePracticeSummary(
  progress: PracticeProgressState,
  taskTypes: TaskType[],
): PracticeSummary {
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
  } satisfies PracticeSummary;
}

export function buildCefrLabel(
  taskTypes: TaskType[],
  settings: PracticeSettingsState,
): string | undefined {
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

export function getVerbLevel(settings: PracticeSettingsState): CEFRLevel {
  return settings.cefrLevelByPos.verb ?? settings.legacyVerbLevel ?? 'A1';
}
