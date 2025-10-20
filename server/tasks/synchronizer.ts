import { inArray, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { inflections, lexemes, taskSpecs } from '@db/schema';
import type { LexemePos } from '@shared/task-registry';

import { generateTaskSpecs, type TaskTemplateSource } from './templates.js';

const SUPPORTED_POS: readonly LexemePos[] = ['verb', 'noun', 'adjective'];
const INSERT_CHUNK_SIZE = 500;

let syncPromise: Promise<void> | null = null;

export function resetTaskSpecSync(): void {
  syncPromise = null;
}

export async function ensureTaskSpecsSynced(): Promise<void> {
  if (!syncPromise) {
    syncPromise = (async () => {
      try {
        await syncAllTaskSpecs();
      } finally {
        syncPromise = null;
      }
    })();
  }

  await syncPromise;
}

interface LexemeRow {
  id: string;
  lemma: string;
  pos: string;
  gender: string | null;
  metadata: Record<string, unknown> | null;
}

interface InflectionRow {
  lexemeId: string;
  form: string;
  features: Record<string, unknown>;
}

async function syncAllTaskSpecs(): Promise<void> {
  const db = getDb();

  const lexemeRows = await db
    .select({
      id: lexemes.id,
      lemma: lexemes.lemma,
      pos: lexemes.pos,
      gender: lexemes.gender,
      metadata: lexemes.metadata,
    })
    .from(lexemes)
    .where(inArray(lexemes.pos, SUPPORTED_POS as string[]));

  if (lexemeRows.length === 0) {
    return;
  }

  const lexemeIds = lexemeRows.map((row) => row.id);

  const inflectionRows = await db
    .select({
      lexemeId: inflections.lexemeId,
      form: inflections.form,
      features: inflections.features,
    })
    .from(inflections)
    .where(inArray(inflections.lexemeId, lexemeIds));

  const inflectionsByLexeme = new Map<string, InflectionRow[]>();
  for (const row of inflectionRows) {
    const list = inflectionsByLexeme.get(row.lexemeId) ?? [];
    list.push({
      lexemeId: row.lexemeId,
      form: row.form,
      features: row.features ?? {},
    });
    inflectionsByLexeme.set(row.lexemeId, list);
  }

  const inserts: Array<typeof taskSpecs.$inferInsert> = [];

  for (const lexeme of lexemeRows) {
    const pos = asLexemePos(lexeme.pos);
    if (!pos || !SUPPORTED_POS.includes(pos)) {
      continue;
    }

    const groupedInflections = inflectionsByLexeme.get(lexeme.id) ?? [];
    const source = buildTaskSource(lexeme, pos, groupedInflections);
    if (!source) {
      continue;
    }

    const tasks = generateTaskSpecs(source);
    for (const task of tasks) {
      inserts.push({
        id: task.id,
        lexemeId: task.lexemeId,
        pos: task.pos,
        taskType: task.taskType,
        renderer: task.renderer,
        prompt: task.prompt,
        solution: task.solution,
        hints: task.hints ?? null,
        metadata: task.metadata ?? null,
        revision: task.revision,
      });
    }
  }

  if (inserts.length === 0) {
    return;
  }

  for (const chunk of chunkArray(inserts, INSERT_CHUNK_SIZE)) {
    await db
      .insert(taskSpecs)
      .values(chunk)
      .onConflictDoUpdate({
        target: taskSpecs.id,
        set: {
          prompt: sql`excluded.prompt`,
          solution: sql`excluded.solution`,
          hints: sql`excluded.hints`,
          metadata: sql`excluded.metadata`,
          revision: sql`excluded.revision`,
          updatedAt: sql`now()`,
        },
      });
  }
}

function buildTaskSource(
  lexeme: LexemeRow,
  pos: LexemePos,
  inflectionRows: InflectionRow[],
): TaskTemplateSource | null {
  const metadata = (lexeme.metadata ?? {}) as Record<string, unknown>;
  const exampleRaw = metadata.example as Record<string, unknown> | undefined;

  const exampleDe = toOptionalString(exampleRaw?.de ?? exampleRaw?.exampleDe);
  const exampleEn = toOptionalString(exampleRaw?.en ?? exampleRaw?.exampleEn);

  const base: TaskTemplateSource = {
    lexemeId: lexeme.id,
    lemma: lexeme.lemma,
    pos,
    level: toOptionalString(metadata.level),
    english: toOptionalString(metadata.english),
    exampleDe,
    exampleEn,
    gender: toOptionalString(lexeme.gender),
    plural: null,
    separable: toOptionalBoolean(metadata.separable),
    aux: toOptionalString(metadata.auxiliary),
    praesensIch: null,
    praesensEr: null,
    praeteritum: null,
    partizipIi: null,
    perfekt: toOptionalString(metadata.perfekt),
    comparative: null,
    superlative: null,
  };

  const finder = createInflectionFinder(inflectionRows);

  if (pos === 'verb') {
    base.praesensIch = finder((features) =>
      matchesFeature(features, 'tense', 'present') &&
      matchesFeature(features, 'mood', 'indicative') &&
      matchesFeature(features, 'person', 1) &&
      matchesFeature(features, 'number', 'singular'),
    );

    base.praesensEr = finder((features) =>
      matchesFeature(features, 'tense', 'present') &&
      matchesFeature(features, 'mood', 'indicative') &&
      matchesFeature(features, 'person', 3) &&
      matchesFeature(features, 'number', 'singular'),
    );

    base.praeteritum = finder((features) =>
      matchesFeature(features, 'tense', 'past') &&
      matchesFeature(features, 'mood', 'indicative') &&
      matchesFeature(features, 'person', 3) &&
      matchesFeature(features, 'number', 'singular'),
    );

    base.partizipIi = finder((features) =>
      matchesFeature(features, 'tense', 'participle') && matchesFeature(features, 'aspect', 'perfect'),
    );

    base.perfekt = base.perfekt ?? finder((features) => matchesFeature(features, 'tense', 'perfect'));
  } else if (pos === 'noun') {
    base.plural = finder((features) =>
      matchesFeature(features, 'case', 'nominative') && matchesFeature(features, 'number', 'plural'),
    );
  } else if (pos === 'adjective') {
    base.comparative = finder((features) => matchesFeature(features, 'degree', 'comparative'));
    base.superlative = finder((features) => matchesFeature(features, 'degree', 'superlative'));
  }

  return base;
}

function createInflectionFinder(inflectionRows: InflectionRow[]): (predicate: (features: Record<string, unknown>) => boolean) => string | null {
  return (predicate) => {
    for (const entry of inflectionRows) {
      const form = toOptionalString(entry.form);
      if (!form) {
        continue;
      }
      const features = entry.features ?? {};
      if (predicate(features)) {
        return form;
      }
    }
    return null;
  };
}

function matchesFeature(
  features: Record<string, unknown>,
  key: string,
  expected: string | number,
): boolean {
  const value = features[key];
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof expected === 'number') {
    if (typeof value === 'number') {
      return value === expected;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed === expected;
    }
    return false;
  }

  if (Array.isArray(value)) {
    return value.includes(expected);
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value) === expected;
  }

  return false;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toOptionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asLexemePos(value: string | null | undefined): LexemePos | null {
  if (!value) {
    return null;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return null;
  }
  if (normalised === 'verb' || normalised === 'noun' || normalised === 'adjective') {
    return normalised as LexemePos;
  }
  return null;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
