import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { inflections, lexemes, taskSpecs, words } from '@db/schema';
import type { LexemePos } from '@shared/task-registry';

import { logStructured } from '../logger.js';
import { emitMetric } from '../metrics/emitter.js';

import { generateTaskSpecs, type TaskTemplateSource } from './templates.js';

const LOG_SOURCE = 'task-sync';
const METRIC_DURATION_NAME = 'task_sync_duration_ms';
const METRIC_ERROR_NAME = 'task_sync_error_total';

const SUPPORTED_POS: readonly LexemePos[] = ['verb', 'noun', 'adjective'];
const INSERT_CHUNK_SIZE = 500;
const DELETE_CHUNK_SIZE = 500;
const TASK_SYNC_PROFILING_ENABLED = process.env.DEBUG_TASK_SYNC_PROFILING === '1';
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

export interface EnsureTaskSpecsOptions {
  since?: Date | null;
}

export interface EnsureTaskSpecsResult {
  latestTouchedAt: Date | null;
  stats: TaskSyncStats;
}

export interface TaskSyncStats {
  lexemesConsidered: number;
  lexemesProcessed: number;
  lexemesSkipped: number;
  taskSpecsProcessed: number;
  taskSpecsSkipped: number;
  taskSpecsInserted: number;
  taskSpecsUpdated: number;
  taskSpecsDeleted: number;
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
    const startedAt = process.hrtime.bigint();
    logStructured({
      source: LOG_SOURCE,
      event: 'task_sync.start',
      data: {
        since: since ? since.toISOString() : null,
      },
    });

    syncPromise = (async () => {
      try {
        const result = await syncAllTaskSpecs(since ?? undefined);
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

        emitMetric({
          name: METRIC_DURATION_NAME,
          value: durationMs,
          tags: { status: 'success' },
        });

        logStructured({
          source: LOG_SOURCE,
          event: 'task_sync.finish',
          data: {
            since: since ? since.toISOString() : null,
            durationMs,
            latestTouchedAt: result.latestTouchedAt ? result.latestTouchedAt.toISOString() : null,
            stats: result.stats,
          },
        });

        return result;
      } catch (error) {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

        emitMetric({
          name: METRIC_DURATION_NAME,
          value: durationMs,
          tags: { status: 'error' },
        });

        emitMetric({
          name: METRIC_ERROR_NAME,
          value: 1,
          tags: { stage: 'sync' },
        });

        logStructured({
          source: LOG_SOURCE,
          level: 'error',
          event: 'task_sync.failure',
          message: 'Task spec synchronisation failed',
          data: {
            since: since ? since.toISOString() : null,
            durationMs,
          },
          error,
        });

        throw error;
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
  const stats: TaskSyncStats = {
    lexemesConsidered: 0,
    lexemesProcessed: 0,
    lexemesSkipped: 0,
    taskSpecsProcessed: 0,
    taskSpecsSkipped: 0,
    taskSpecsInserted: 0,
    taskSpecsUpdated: 0,
    taskSpecsDeleted: 0,
  };
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
      logStructured({
        source: LOG_SOURCE,
        event: 'task_sync.no_candidates',
        data: {
          since: since.toISOString(),
          stats,
        },
      });

      return { latestTouchedAt: null, stats };
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

  stats.lexemesConsidered = lexemeRows.length;

  logStructured({
    source: LOG_SOURCE,
    event: 'task_sync.lexeme_scan',
    data: {
      since: since ? since.toISOString() : null,
      lexemesConsidered: stats.lexemesConsidered,
    },
  });

  if (lexemeRows.length === 0) {
    logStructured({
      source: LOG_SOURCE,
      event: 'task_sync.generation_summary',
      data: {
        lexemesConsidered: stats.lexemesConsidered,
        lexemesProcessed: 0,
        lexemesSkipped: 0,
        taskSpecsProcessed: 0,
        taskSpecsSkipped: 0,
      },
    });

    return { latestTouchedAt, stats };
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
      stats.lexemesSkipped += 1;
      stats.taskSpecsSkipped += 1;
      continue;
    }

    const groupedInflections = inflectionsByLexeme.get(lexeme.id) ?? [];
    const source = buildTaskSource(lexeme, pos, groupedInflections);
    if (!source) {
      stats.lexemesSkipped += 1;
      stats.taskSpecsSkipped += 1;
      continue;
    }

    const tasks = generateTaskSpecs(source);
    if (tasks.length === 0) {
      stats.lexemesSkipped += 1;
      stats.taskSpecsSkipped += 1;
      continue;
    }

    stats.lexemesProcessed += 1;
    stats.taskSpecsProcessed += tasks.length;
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

  logStructured({
    source: LOG_SOURCE,
    event: 'task_sync.generation_summary',
    data: {
      lexemesConsidered: stats.lexemesConsidered,
      lexemesProcessed: stats.lexemesProcessed,
      lexemesSkipped: stats.lexemesSkipped,
      taskSpecsProcessed: stats.taskSpecsProcessed,
      taskSpecsSkipped: stats.taskSpecsSkipped,
    },
  });

  const fetchedAllLexemes = !since;
  const authoritativeLexemeIds = new Set(expectedTaskIdsByLexeme.keys());

  let existingTasks:
    | Array<{ id: string; lexemeId: string; taskType: string }>
    | undefined;

  if (!fetchedAllLexemes) {
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
  const existingTaskIds = new Set(taskRows.map((task) => task.id));

  const insertChunks = inserts.length > 0 ? chunkArray(inserts, INSERT_CHUNK_SIZE) : [];

  if (insertChunks.length > 0) {
    await processChunksWithRetry(
      insertChunks,
      async (chunk) => {
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

        let existingCount = 0;
        for (const row of chunk) {
          if (existingTaskIds.has(row.id)) {
            existingCount += 1;
          }
        }

        stats.taskSpecsUpdated += existingCount;
        stats.taskSpecsInserted += chunk.length - existingCount;
      },
      { operation: 'task_sync.upsert' },
    );
  }

  logStructured({
    source: LOG_SOURCE,
    event: 'task_sync.upsert_summary',
    data: {
      chunksAttempted: insertChunks.length,
      taskSpecsInserted: stats.taskSpecsInserted,
      taskSpecsUpdated: stats.taskSpecsUpdated,
    },
  });
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

  const deleteChunks = staleTaskIds.length > 0 ? chunkArray(staleTaskIds, DELETE_CHUNK_SIZE) : [];

  if (deleteChunks.length > 0) {
    await processChunksWithRetry(
      deleteChunks,
      async (chunk) => {
        await db.delete(taskSpecs).where(inArray(taskSpecs.id, chunk));
        stats.taskSpecsDeleted += chunk.length;
      },
      { operation: 'task_sync.delete' },
    );
  }

  logStructured({
    source: LOG_SOURCE,
    event: 'task_sync.cleanup_summary',
    data: {
      chunksAttempted: deleteChunks.length,
      taskSpecsDeleted: stats.taskSpecsDeleted,
    },
  });

  return { latestTouchedAt, stats };
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

interface ChunkRetryOptions {
  operation: string;
  attempts?: number;
  delayMs?: number;
}

async function processChunksWithRetry<T>(
  chunks: T[][],
  handler: (chunk: T[]) => Promise<void>,
  options: ChunkRetryOptions,
): Promise<void> {
  const attempts = Math.max(options.attempts ?? DEFAULT_RETRY_ATTEMPTS, 1);
  const delayMs = Math.max(options.delayMs ?? DEFAULT_RETRY_DELAY_MS, 0);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    let attempt = 0;

    while (attempt < attempts) {
      try {
        await handler(chunk);
        break;
      } catch (error) {
        attempt += 1;
        if (attempt >= attempts) {
          throw error;
        }

        logStructured({
          source: LOG_SOURCE,
          level: 'warn',
          event: `${options.operation}.retry`,
          message: `Retrying chunk ${index + 1}/${chunks.length}`,
          data: {
            attempt,
            attempts,
            chunkSize: chunk.length,
          },
          error,
        });

        if (delayMs > 0) {
          await sleep(delayMs * attempt);
        }
      }
    }
  }
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
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
