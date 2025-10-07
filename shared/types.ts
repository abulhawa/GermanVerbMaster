import type { LexemePos, TaskType } from './task-registry';

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type PracticeMode = 'präteritum' | 'partizipII' | 'auxiliary' | 'english';

export type PracticeResult = 'correct' | 'incorrect';

export type PartOfSpeech =
  | 'V'
  | 'N'
  | 'Adj'
  | 'Adv'
  | 'Pron'
  | 'Det'
  | 'Präp'
  | 'Konj'
  | 'Num'
  | 'Part'
  | 'Interj';

export interface Word {
  id: number;
  lemma: string;
  pos: PartOfSpeech;
  level: string | null;
  english: string | null;
  exampleDe: string | null;
  exampleEn: string | null;
  gender: string | null;
  plural: string | null;
  separable: boolean | null;
  aux: 'haben' | 'sein' | null;
  praesensIch: string | null;
  praesensEr: string | null;
  praeteritum: string | null;
  partizipIi: string | null;
  perfekt: string | null;
  comparative: string | null;
  superlative: string | null;
  canonical: boolean;
  complete: boolean;
  sourcesCsv: string | null;
  sourceNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GermanVerb {
  infinitive: string;
  english: string;
  präteritum: string;
  partizipII: string;
  auxiliary: 'haben' | 'sein';
  level: CEFRLevel;
  präteritumExample: string;
  partizipIIExample: string;
  source: {
    name: 'Duden' | 'Goethe-Institut' | 'CEFR' | string;
    levelReference: string;
  };
  pattern?: {
    type: 'ablaut' | 'mixed' | 'modal' | 'other' | string;
    group?: string;
  } | null;
  praesensIch?: string | null;
  praesensEr?: string | null;
  perfekt?: string | null;
  separable?: boolean | null;
}

export interface AnswerHistoryLexemeExample {
  de?: string | null;
  en?: string | null;
}

export interface AnswerHistoryLexemeSnapshot {
  id: string;
  lemma: string;
  pos: LexemePos;
  level?: CEFRLevel;
  english?: string;
  example?: AnswerHistoryLexemeExample;
  auxiliary?: 'haben' | 'sein' | null;
}

export interface PracticeAttemptPayload {
  verb: string;
  mode: PracticeMode;
  result: PracticeResult;
  attemptedAnswer: string;
  timeSpent: number;
  level: CEFRLevel;
  deviceId: string;
  queuedAt?: string;
}

export interface TaskAnswerHistoryItem {
  id: string;
  taskId: string;
  lexemeId: string;
  taskType: TaskType;
  pos: LexemePos;
  renderer: string;
  result: PracticeResult;
  submittedResponse: unknown;
  expectedResponse?: unknown;
  promptSummary: string;
  answeredAt: string;
  timeSpentMs: number;
  timeSpent: number;
  cefrLevel?: CEFRLevel;
  packId?: string | null;
  mode?: PracticeMode;
  attemptedAnswer?: string;
  correctAnswer?: string;
  prompt?: string;
  level?: CEFRLevel;
  lexeme?: AnswerHistoryLexemeSnapshot;
  verb?: GermanVerb;
  legacyVerb?: {
    verb: GermanVerb;
    mode: PracticeMode;
  };
}

export interface PracticeTaskQueueItemMetadata {
  lemma?: string;
  cefrLevel?: CEFRLevel;
  legacyVerbInfinitive?: string;
  legacyPracticeMode?: PracticeMode;
  packId?: string | null;
  packSlug?: string | null;
  packName?: string | null;
}

export interface PracticeTaskQueueItem {
  taskId: string;
  lexemeId: string;
  taskType: TaskType;
  pos: LexemePos;
  renderer: string;
  source: 'review' | 'seed' | 'scheduler';
  enqueuedAt: string;
  metadata?: PracticeTaskQueueItemMetadata;
  pack?: {
    id: string;
    slug: string;
    name: string;
  } | null;
}

export interface TaskAttemptPayload {
  taskId: string;
  lexemeId: string;
  taskType: TaskType;
  pos: LexemePos;
  renderer: string;
  result: PracticeResult;
  submittedResponse: unknown;
  expectedResponse?: unknown;
  timeSpentMs: number;
  answeredAt: string;
  deviceId: string;
  queuedAt?: string;
  cefrLevel?: CEFRLevel;
  packId?: string | null;
  legacyVerb?: {
    infinitive: string;
    mode: PracticeMode;
    level?: CEFRLevel;
    attemptedAnswer?: string;
  };
}

export interface TaskProgressLexemeRecord {
  lexemeId: string;
  taskId: string;
  lastPracticedAt: string;
  correctAttempts: number;
  incorrectAttempts: number;
  cefrLevel?: CEFRLevel;
}

export interface TaskProgressSummary {
  correctAttempts: number;
  incorrectAttempts: number;
  streak: number;
  lastPracticedAt: string | null;
  lexemes: Record<string, TaskProgressLexemeRecord>;
}

export interface PracticeProgressState {
  version: number;
  totals: Record<TaskType, TaskProgressSummary>;
  lastPracticedTaskId: string | null;
  migratedFromLegacy?: boolean;
  updatedAt?: string;
}

export interface PracticeSettingsRendererPreferences {
  showHints: boolean;
  showExamples: boolean;
}

export interface PracticeSettingsState {
  version: number;
  defaultTaskType: TaskType;
  preferredTaskTypes: TaskType[];
  cefrLevelByPos: Partial<Record<LexemePos, CEFRLevel>>;
  rendererPreferences: Record<TaskType, PracticeSettingsRendererPreferences>;
  legacyVerbLevel?: CEFRLevel;
  migratedFromLegacy?: boolean;
  updatedAt: string;
}

export interface AdaptiveQueueItem {
  verb: string;
  priority: number;
  dueAt: string;
  leitnerBox: number;
  accuracyWeight: number;
  latencyWeight: number;
  stabilityWeight: number;
  predictedIntervalMinutes: number;
}

export interface AdaptiveQueueResponse {
  deviceId: string;
  version: string;
  generatedAt: string;
  validUntil: string;
  featureEnabled: boolean;
  items: AdaptiveQueueItem[];
  metrics: {
    queueLength: number;
    generationDurationMs: number;
  };
}
