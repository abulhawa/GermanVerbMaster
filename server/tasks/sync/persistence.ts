import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { inflections, lexemes, taskSpecs, words } from '@db/schema';
import type { LexemePos } from '@shared/task-registry';

export interface LexemeRow {
  id: string;
  lemma: string;
  pos: string;
  gender: string | null;
  metadata: Record<string, unknown> | null;
  fallbackExampleDe: string | null;
  fallbackExampleEn: string | null;
  updatedAt: Date;
}

export interface InflectionRow {
  id: string;
  lexemeId: string;
  form: string;
  features: Record<string, unknown>;
  updatedAt: Date | null;
}

export interface ExistingTaskSpecRow {
  id: string;
  lexemeId: string;
  taskType: string;
}

export async function fetchUpdatedLexemeIds(
  since: Date,
  supportedPos: readonly LexemePos[],
): Promise<{ lexemeIds: Set<string>; latestTouchedAt: Date | null }> {
  const db = getDb();
  const lexemeIds = new Set<string>();
  let latestTouchedAt: Date | null = null;

  const updateLatest = (value: Date | null | undefined) => {
    if (!value) {
      return;
    }

    if (!latestTouchedAt || value > latestTouchedAt) {
      latestTouchedAt = value;
    }
  };

  const updatedLexemes = await db
    .select({
      id: lexemes.id,
      updatedAt: lexemes.updatedAt,
    })
    .from(lexemes)
    .where(gt(lexemes.updatedAt, since));

  for (const row of updatedLexemes) {
    if (row.id) {
      lexemeIds.add(row.id);
      updateLatest(row.updatedAt);
    }
  }

  const updatedInflections = await db
    .select({
      lexemeId: inflections.lexemeId,
      updatedAt: inflections.updatedAt,
    })
    .from(inflections)
    .innerJoin(lexemes, eq(inflections.lexemeId, lexemes.id))
    .where(and(inArray(lexemes.pos, supportedPos as string[]), gt(inflections.updatedAt, since)));

  for (const row of updatedInflections) {
    if (row.lexemeId) {
      lexemeIds.add(row.lexemeId);
      updateLatest(row.updatedAt);
    }
  }

  return { lexemeIds, latestTouchedAt };
}

export async function fetchLexemeRows(
  supportedPos: readonly LexemePos[],
  lexemeIds?: Iterable<string>,
): Promise<LexemeRow[]> {
  const db = getDb();
  const lexemeQuery = db
    .select({
      id: lexemes.id,
      lemma: lexemes.lemma,
      pos: lexemes.pos,
      gender: lexemes.gender,
      metadata: lexemes.metadata,
      fallbackExampleDe: words.exampleDe,
      fallbackExampleEn: words.exampleEn,
      updatedAt: lexemes.updatedAt,
    })
    .from(lexemes)
    .leftJoin(
      words,
      sql`lower(${words.lemma}) = lower(${lexemes.lemma}) AND ${words.pos} = ${mapLexemePosToWordPosSql(
        lexemes.pos,
      )}`,
    );

  if (lexemeIds) {
    const ids = Array.from(lexemeIds);
    if (ids.length === 0) {
      return [];
    }

    return await lexemeQuery.where(inArray(lexemes.id, ids));
  }

  return await lexemeQuery.where(inArray(lexemes.pos, supportedPos as string[]));
}

export async function fetchInflectionRows(lexemeIds: readonly string[]): Promise<InflectionRow[]> {
  if (lexemeIds.length === 0) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({
      id: inflections.id,
      lexemeId: inflections.lexemeId,
      form: inflections.form,
      features: inflections.features,
      updatedAt: inflections.updatedAt,
    })
    .from(inflections)
    .where(inArray(inflections.lexemeId, lexemeIds as string[]));

  return rows.map((row) => ({
    id: row.id,
    lexemeId: row.lexemeId,
    form: row.form,
    features: row.features ?? {},
    updatedAt: row.updatedAt ?? null,
  }));
}

export async function fetchExistingTaskSpecRows(
  lexemeIds: readonly string[] | null,
): Promise<ExistingTaskSpecRow[]> {
  const db = getDb();

  const query = db
    .select({ id: taskSpecs.id, lexemeId: taskSpecs.lexemeId, taskType: taskSpecs.taskType })
    .from(taskSpecs);

  if (lexemeIds && lexemeIds.length > 0) {
    return await query.where(inArray(taskSpecs.lexemeId, lexemeIds as string[]));
  }

  return await query;
}

export async function upsertTaskSpecChunk(
  chunk: Array<typeof taskSpecs.$inferInsert>,
): Promise<void> {
  if (chunk.length === 0) {
    return;
  }

  const db = getDb();
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

export async function deleteTaskSpecsById(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = getDb();
  await db.delete(taskSpecs).where(inArray(taskSpecs.id, ids as string[]));
}

function mapLexemePosToWordPosSql(column: typeof lexemes.pos) {
  return sql`case ${column}
    when 'verb' then 'V'
    when 'noun' then 'N'
    when 'adjective' then 'Adj'
    else '' end`;
}
