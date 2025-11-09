import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { inflections, lexemes, taskSpecs, words } from '@db/schema';
import type { LexemePos } from '@shared/task-registry';

import { generateTaskSpecs, type TaskTemplateSource } from './templates.js';

const SUPPORTED_POS: readonly LexemePos[] = ['verb', 'noun', 'adjective'];
const INSERT_CHUNK_SIZE = 500;
const DELETE_CHUNK_SIZE = 500;
const TASK_SYNC_PROFILING_ENABLED = process.env.DEBUG_TASK_SYNC_PROFILING === '1';

export interface EnsureTaskSpecsOptions {
  since?: Date | null;
}

export interface EnsureTaskSpecsResult {
  latestTouchedAt: Date | null;
}

let syncPromise: Promise<EnsureTaskSpecsResult> | null = null;

export function resetTaskSpecSync(): void {
  syncPromise = null;
}

export async function ensureTaskSpecsSynced(
  options?: EnsureTaskSpecsOptions,
): Promise<EnsureTaskSpecsResult> {
  const since = options?.since ?? null;

  if (!syncPromise) {
    syncPromise = (async () => {
      try {
        return await syncAllTaskSpecs(since ?? undefined);
      } finally {
        syncPromise = null;
      }
    })();
  }

  return await syncPromise;
}

interface LexemeRow {
  id: string;
  lemma: string;
  pos: string;
  gender: string | null;
  metadata: Record<string, unknown> | null;
  fallbackExampleDe: string | null;
  fallbackExampleEn: string | null;
  updatedAt: Date;
}

interface InflectionRow {
  lexemeId: string;
  form: string;
  features: Record<string, unknown>;
}

type FeatureKey = 'tense' | 'mood' | 'person' | 'number' | 'aspect' | 'case' | 'degree';
type FeatureQuery = Partial<Record<FeatureKey, string | number>>;
type InflectionIndex = Map<string, Map<string, string>>;

const FEATURE_KEY_ORDER: readonly FeatureKey[] = ['tense', 'mood', 'person', 'number', 'aspect', 'case', 'degree'];

const SUPPORTED_FEATURE_COMBINATIONS: readonly FeatureKey[][] = [
  ['tense', 'mood', 'person', 'number'],
  ['tense', 'aspect'],
  ['tense'],
  ['case', 'number'],
  ['degree'],
];

async function syncAllTaskSpecs(since?: Date): Promise<EnsureTaskSpecsResult> {
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

  if (since) {
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
      .where(and(inArray(lexemes.pos, SUPPORTED_POS as string[]), gt(inflections.updatedAt, since)));

    for (const row of updatedInflections) {
      if (row.lexemeId) {
        lexemeIds.add(row.lexemeId);
        updateLatest(row.updatedAt);
      }
    }

    if (lexemeIds.size === 0) {
      return { latestTouchedAt: null };
    }
  }

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

  const lexemeRows = since
    ? await lexemeQuery.where(inArray(lexemes.id, Array.from(lexemeIds)))
    : await lexemeQuery.where(inArray(lexemes.pos, SUPPORTED_POS as string[]));

  if (lexemeRows.length === 0) {
    return { latestTouchedAt };
  }

  const lexemeIdList = lexemeRows.map((row) => {
    updateLatest(row.updatedAt);
    return row.id;
  });

  const inflectionRows = lexemeIdList.length
    ? await db
        .select({
          lexemeId: inflections.lexemeId,
          form: inflections.form,
          features: inflections.features,
          updatedAt: inflections.updatedAt,
        })
        .from(inflections)
        .where(inArray(inflections.lexemeId, lexemeIdList))
    : [];

  const inflectionsByLexeme = new Map<string, InflectionRow[]>();
  for (const row of inflectionRows) {
    updateLatest(row.updatedAt);
    const list = inflectionsByLexeme.get(row.lexemeId) ?? [];
    list.push({
      lexemeId: row.lexemeId,
      form: row.form,
      features: row.features ?? {},
    });
    inflectionsByLexeme.set(row.lexemeId, list);
  }

  const inserts: Array<typeof taskSpecs.$inferInsert> = [];
  const expectedTaskIdsByLexeme = new Map<string, Set<string>>();
  const expectedTaskTypesByLexeme = new Map<string, Set<string>>();

  for (const lexeme of lexemeRows) {
    let expectedIds = expectedTaskIdsByLexeme.get(lexeme.id);
    if (!expectedIds) {
      expectedIds = new Set<string>();
      expectedTaskIdsByLexeme.set(lexeme.id, expectedIds);
    }

    let expectedTypes = expectedTaskTypesByLexeme.get(lexeme.id);
    if (!expectedTypes) {
      expectedTypes = new Set<string>();
      expectedTaskTypesByLexeme.set(lexeme.id, expectedTypes);
    }

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
      expectedIds.add(task.id);
      expectedTypes.add(task.taskType);
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

  if (inserts.length > 0) {
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

  const fetchedAllLexemes = !since;
  const authoritativeLexemeIds = new Set(expectedTaskIdsByLexeme.keys());

  let existingTasks:
    | Array<{ id: string; lexemeId: string; taskType: string }>
    | undefined;

  if (!fetchedAllLexemes) {
    if (lexemeIdList.length === 0) {
      return { latestTouchedAt };
    }
    existingTasks = await db
      .select({ id: taskSpecs.id, lexemeId: taskSpecs.lexemeId, taskType: taskSpecs.taskType })
      .from(taskSpecs)
      .where(inArray(taskSpecs.lexemeId, lexemeIdList));
  } else {
    existingTasks = await db
      .select({ id: taskSpecs.id, lexemeId: taskSpecs.lexemeId, taskType: taskSpecs.taskType })
      .from(taskSpecs);
  }

  const taskRows = existingTasks ?? [];
  const staleTaskIds: string[] = [];

  for (const task of taskRows) {
    const lexemeId = task.lexemeId;
    const lexemeFetched = authoritativeLexemeIds.has(lexemeId);

    if (!lexemeFetched) {
      if (fetchedAllLexemes) {
        staleTaskIds.push(task.id);
      }
      continue;
    }

    const expectedIds = expectedTaskIdsByLexeme.get(lexemeId);
    const expectedTypes = expectedTaskTypesByLexeme.get(lexemeId);

    if (!expectedIds || !expectedTypes) {
      staleTaskIds.push(task.id);
      continue;
    }

    if (!expectedIds.has(task.id) || !expectedTypes.has(task.taskType)) {
      staleTaskIds.push(task.id);
    }
  }

  if (staleTaskIds.length > 0) {
    for (const chunk of chunkArray(staleTaskIds, DELETE_CHUNK_SIZE)) {
      await db.delete(taskSpecs).where(inArray(taskSpecs.id, chunk));
    }
  }

  return { latestTouchedAt };
}

function buildTaskSource(
  lexeme: LexemeRow,
  pos: LexemePos,
  inflectionRows: InflectionRow[],
): TaskTemplateSource | null {
  const buildStart = TASK_SYNC_PROFILING_ENABLED ? process.hrtime.bigint() : null;
  const metadata = (lexeme.metadata ?? {}) as Record<string, unknown>;
  const exampleRaw = metadata.example as Record<string, unknown> | undefined;

  const fallbackExampleDe = toOptionalString(lexeme.fallbackExampleDe);
  const fallbackExampleEn = toOptionalString(lexeme.fallbackExampleEn);

  const metadataExampleDe = toOptionalString(exampleRaw?.de ?? exampleRaw?.exampleDe);
  const metadataExampleEn = toOptionalString(exampleRaw?.en ?? exampleRaw?.exampleEn);

  let exampleDe = metadataExampleDe ?? fallbackExampleDe ?? null;
  let exampleEn = metadataExampleEn ?? fallbackExampleEn ?? null;

  if (!exampleDe && fallbackExampleDe) {
    exampleDe = fallbackExampleDe;
  }

  if (
    fallbackExampleEn &&
    (!exampleEn || (exampleDe && exampleEn === exampleDe))
  ) {
    exampleEn = fallbackExampleEn;
  }

  const base: TaskTemplateSource = {
    lexemeId: lexeme.id,
    lemma: lexeme.lemma,
    pos,
    level: toOptionalString(metadata.level),
    english: toOptionalString(metadata.english),
    exampleDe,
    exampleEn,
    gender: normaliseGenderValue(toOptionalString(lexeme.gender)),
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
    base.praesensIch = finder({
      tense: 'present',
      mood: 'indicative',
      person: 1,
      number: 'singular',
    });

    base.praesensEr = finder({
      tense: 'present',
      mood: 'indicative',
      person: 3,
      number: 'singular',
    });

    base.praeteritum = finder({
      tense: 'past',
      mood: 'indicative',
      person: 3,
      number: 'singular',
    });

    base.partizipIi = finder({
      tense: 'participle',
      aspect: 'perfect',
    });

    base.perfekt = base.perfekt ?? finder({ tense: 'perfect' });
  } else if (pos === 'noun') {
    base.plural = finder({
      case: 'nominative',
      number: 'plural',
    });
  } else if (pos === 'adjective') {
    base.comparative = finder({ degree: 'comparative' });
    base.superlative = finder({ degree: 'superlative' });
  }

  if (TASK_SYNC_PROFILING_ENABLED && buildStart) {
    const durationMs = Number(process.hrtime.bigint() - buildStart) / 1_000_000;
    console.debug(
      `[task-sync] buildTaskSource ${lexeme.lemma} (${lexeme.id}) took ${durationMs.toFixed(3)}ms`,
    );
  }

  return base;
}

function createInflectionFinder(inflectionRows: InflectionRow[]): (query: FeatureQuery) => string | null {
  const buildStart = TASK_SYNC_PROFILING_ENABLED ? process.hrtime.bigint() : null;
  const index = buildInflectionIndex(inflectionRows);

  if (TASK_SYNC_PROFILING_ENABLED && buildStart) {
    const durationMs = Number(process.hrtime.bigint() - buildStart) / 1_000_000;
    console.debug(
      `[task-sync] built inflection index with ${inflectionRows.length} entries in ${durationMs.toFixed(3)}ms`,
    );
  }

  return (query) => {
    const lookupStart = TASK_SYNC_PROFILING_ENABLED ? process.hrtime.bigint() : null;
    const result = lookupInflection(index, inflectionRows, query);

    if (TASK_SYNC_PROFILING_ENABLED && lookupStart) {
      const elapsedMs = Number(process.hrtime.bigint() - lookupStart) / 1_000_000;
      const keys = Object.keys(query)
        .sort(
          (left, right) => FEATURE_KEY_ORDER.indexOf(left as FeatureKey) - FEATURE_KEY_ORDER.indexOf(right as FeatureKey),
        )
        .join(',');
      console.debug(`[task-sync] lookup ${keys} -> ${result ?? '∅'} (${elapsedMs.toFixed(3)}ms)`);
    }

    return result;
  };
}

function buildInflectionIndex(inflectionRows: InflectionRow[]): InflectionIndex {
  const index: InflectionIndex = new Map();

  for (const entry of inflectionRows) {
    const form = toOptionalString(entry.form);
    if (!form) {
      continue;
    }

    const features = entry.features ?? {};
    for (const combination of SUPPORTED_FEATURE_COMBINATIONS) {
      const sortedKeys = normaliseCombinationKeys(combination);
      const valueMatrix = sortedKeys.map((key) => extractFeatureValues(features, key));

      if (valueMatrix.some((values) => values.length === 0)) {
        continue;
      }

      const combinationKey = buildCombinationKey(sortedKeys);
      let bucket = index.get(combinationKey);
      if (!bucket) {
        bucket = new Map<string, string>();
        index.set(combinationKey, bucket);
      }

      for (const tuple of cartesianProduct(valueMatrix)) {
        const valueKey = buildValueKey(tuple);
        if (!bucket.has(valueKey)) {
          bucket.set(valueKey, form);
        }
      }
    }
  }

  return index;
}

function lookupInflection(
  index: InflectionIndex,
  fallbackRows: InflectionRow[],
  query: FeatureQuery,
): string | null {
  const keys = Object.keys(query) as FeatureKey[];
  if (keys.length === 0) {
    return null;
  }

  const sortedKeys = normaliseCombinationKeys(keys);
  const combinationKey = buildCombinationKey(sortedKeys);
  const bucket = index.get(combinationKey);

  if (bucket) {
    const valueKeyParts: string[] = [];
    for (const key of sortedKeys) {
      const raw = query[key];
      const normalised = normaliseFeatureValue(raw);
      if (normalised === null) {
        return null;
      }
      valueKeyParts.push(normalised);
    }

    const lookupKey = buildValueKey(valueKeyParts);
    const hit = bucket.get(lookupKey);
    if (hit) {
      return hit;
    }
  }

  return fallbackLinearSearch(fallbackRows, query);
}

function normaliseCombinationKeys(keys: readonly FeatureKey[]): FeatureKey[] {
  return [...new Set(keys)].sort(
    (left, right) => FEATURE_KEY_ORDER.indexOf(left) - FEATURE_KEY_ORDER.indexOf(right),
  );
}

function buildCombinationKey(keys: readonly FeatureKey[]): string {
  return keys.join('|');
}

function buildValueKey(values: readonly string[]): string {
  return values.join('§');
}

function extractFeatureValues(features: Record<string, unknown>, key: FeatureKey): string[] {
  const raw = features[key];
  if (raw === undefined || raw === null) {
    return [];
  }

  if (Array.isArray(raw)) {
    const values: string[] = [];
    for (const value of raw) {
      const normalised = normaliseFeatureValue(value);
      if (normalised) {
        values.push(normalised);
      }
    }
    return Array.from(new Set(values));
  }

  const normalised = normaliseFeatureValue(raw);
  return normalised ? [normalised] : [];
}

function normaliseFeatureValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

function cartesianProduct(matrix: string[][]): string[][] {
  if (matrix.length === 0) {
    return [];
  }

  return matrix.reduce<string[][]>((accumulator, values) => {
    if (accumulator.length === 0) {
      return values.map((value) => [value]);
    }

    const next: string[][] = [];
    for (const tuple of accumulator) {
      for (const value of values) {
        next.push([...tuple, value]);
      }
    }
    return next;
  }, []);
}

function fallbackLinearSearch(inflectionRows: InflectionRow[], query: FeatureQuery): string | null {
  for (const entry of inflectionRows) {
    const form = toOptionalString(entry.form);
    if (!form) {
      continue;
    }

    const features = entry.features ?? {};
    let matches = true;
    for (const [key, expected] of Object.entries(query)) {
      if (!matchesFeature(features, key, expected as string | number)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return form;
    }
  }

  return null;
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

const SIMPLE_GENDERS = ['der', 'die', 'das'] as const;
const COMPOUND_GENDERS = ['der/die', 'der/das', 'die/das'] as const;
type SimpleGender = (typeof SIMPLE_GENDERS)[number];
type CompoundGender = (typeof COMPOUND_GENDERS)[number];

export function normaliseGenderValue(value: string | null): SimpleGender | CompoundGender | null {
  if (!value) {
    return null;
  }

  const normalised = value.trim().toLowerCase();
  if (!normalised || normalised === 'null') {
    return null;
  }

  if ((SIMPLE_GENDERS as readonly string[]).includes(normalised)) {
    return normalised as SimpleGender;
  }

  if ((COMPOUND_GENDERS as readonly string[]).includes(normalised)) {
    return normalised as CompoundGender;
  }

  const tokens = normalised
    .split(/[\/,]/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0 || tokens.length > 2) {
    return null;
  }

  const uniqueTokens: string[] = [];
  for (const token of tokens) {
    if (!uniqueTokens.includes(token)) {
      uniqueTokens.push(token);
    }
  }

  if (uniqueTokens.length === 1) {
    const [token] = uniqueTokens;
    return (SIMPLE_GENDERS as readonly string[]).includes(token) ? (token as SimpleGender) : null;
  }

  if (uniqueTokens.length !== 2) {
    return null;
  }

  const canonicalOrder: SimpleGender[] = ['der', 'die', 'das'];
  const orderedTokens = canonicalOrder.filter((gender) => uniqueTokens.includes(gender));

  if (orderedTokens.length !== uniqueTokens.length) {
    return null;
  }

  const compound = `${orderedTokens[0]}/${orderedTokens[1]}`;
  return (COMPOUND_GENDERS as readonly string[]).includes(compound)
    ? (compound as CompoundGender)
    : null;
}

function mapLexemePosToWordPosSql(column: typeof lexemes.pos) {
  return sql<string>`case ${column}
    when 'verb' then 'V'
    when 'noun' then 'N'
    when 'adjective' then 'Adj'
    else '' end`;
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

export const __TEST_ONLY__ = {
  createInflectionFinder,
};
