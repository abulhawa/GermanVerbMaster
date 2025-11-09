import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { LexemePos, TaskType } from '@shared/task-registry';

import type { AttributionEntry } from './attribution';

export const INFLECTION_DELETE_CHUNK_SIZE = 500;
export const TASK_DELETE_CHUNK_SIZE = 1000;

export interface LexemeSeed {
  id: string;
  lemma: string;
  language: string;
  pos: LexemePos;
  gender: string | null;
  metadata: Record<string, unknown>;
  frequencyRank: number | null;
  sourceIds: string[];
}

export interface InflectionSeed {
  id: string;
  lexemeId: string;
  form: string;
  features: Record<string, unknown>;
  audioAsset: string | null;
  sourceRevision: string | null;
  checksum: string | null;
}

export interface TaskSpecSeed {
  id: string;
  lexemeId: string;
  pos: LexemePos;
  taskType: TaskType;
  renderer: string;
  prompt: Record<string, unknown>;
  solution: Record<string, unknown>;
  hints: unknown[] | null;
  metadata: Record<string, unknown> | null;
  revision: number;
}

export interface TaskInventory {
  tasks: TaskSpecSeed[];
}

export interface LexemeInventory {
  lexemes: LexemeSeed[];
  inflections: InflectionSeed[];
  attribution: AttributionEntry[];
}

export type DrizzleDatabase = NodePgDatabase<typeof import('@db/schema')>;
