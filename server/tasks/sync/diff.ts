import type { LexemePos } from '@shared/task-registry';

import { taskSpecs } from '@db/schema';

import { generateTaskSpecs, type TaskTemplateSource } from '../templates.js';
import type { TaskSpecSyncCheckpoint } from '../task-sync-state.js';
import type {
  ExistingTaskSpecRow,
  InflectionRow,
  LexemeRow,
} from './persistence.js';
import { TASK_SYNC_PROFILING_ENABLED, computeSyncVersionHash } from './utils.js';

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

export interface EnsureTaskSpecsResult {
  latestTouchedAt: Date | null;
  stats: TaskSyncStats;
  checkpoint: TaskSpecSyncCheckpoint | null;
}

type TaskSpecInsert = typeof taskSpecs.$inferInsert;

export interface TaskSyncPlan extends EnsureTaskSpecsResult {
  inserts: TaskSpecInsert[];
  staleTaskIds: string[];
  checkpointChanged: boolean;
}

export interface TaskSyncComputationInput {
  lexemeRows: LexemeRow[];
  inflectionRows: InflectionRow[];
  existingTasks: ExistingTaskSpecRow[];
  supportedPos: readonly LexemePos[];
  previousCheckpoint: TaskSpecSyncCheckpoint | null;
  fetchedAllLexemes: boolean;
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

export function calculateTaskSyncPlan(input: TaskSyncComputationInput): TaskSyncPlan {
  const {
    lexemeRows,
    inflectionRows,
    existingTasks,
    supportedPos,
    previousCheckpoint,
    fetchedAllLexemes,
  } = input;

  const stats: TaskSyncStats = {
    lexemesConsidered: lexemeRows.length,
    lexemesProcessed: 0,
    lexemesSkipped: 0,
    taskSpecsProcessed: 0,
    taskSpecsSkipped: 0,
    taskSpecsInserted: 0,
    taskSpecsUpdated: 0,
    taskSpecsDeleted: 0,
  };

  const updateLatest = (current: Date | null, candidate: Date | null | undefined): Date | null => {
    if (!candidate) {
      return current;
    }

    if (!current || candidate > current) {
      return candidate;
    }

    return current;
  };

  let latestTouchedAt: Date | null = null;
  const inflectionsByLexeme = new Map<string, InflectionRow[]>();
  for (const row of inflectionRows) {
    latestTouchedAt = updateLatest(latestTouchedAt, row.updatedAt ?? null);
    const list = inflectionsByLexeme.get(row.lexemeId) ?? [];
    list.push(row);
    inflectionsByLexeme.set(row.lexemeId, list);
  }

  const inserts: TaskSpecInsert[] = [];
  const expectedTaskIdsByLexeme = new Map<string, Set<string>>();
  const expectedTaskTypesByLexeme = new Map<string, Set<string>>();

  for (const lexeme of lexemeRows) {
    latestTouchedAt = updateLatest(latestTouchedAt, lexeme.updatedAt ?? null);

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
    if (!pos || !supportedPos.includes(pos)) {
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

  const existingTaskIds = new Set(existingTasks.map((task) => task.id));
  const authoritativeLexemeIds = new Set(expectedTaskIdsByLexeme.keys());

  const staleTaskIds: string[] = [];

  for (const task of existingTasks) {
    if (fetchedAllLexemes && !authoritativeLexemeIds.has(task.lexemeId)) {
      staleTaskIds.push(task.id);
      continue;
    }

    const expectedIds = expectedTaskIdsByLexeme.get(task.lexemeId);
    const expectedTypes = expectedTaskTypesByLexeme.get(task.lexemeId);

    if (!expectedIds || !expectedTypes) {
      staleTaskIds.push(task.id);
      continue;
    }

    if (!expectedIds.has(task.id) || !expectedTypes.has(task.taskType)) {
      staleTaskIds.push(task.id);
    }
  }

  const taskSpecsUpdated = inserts.filter((task) => existingTaskIds.has(task.id)).length;
  stats.taskSpecsUpdated = taskSpecsUpdated;
  stats.taskSpecsInserted = inserts.length - taskSpecsUpdated;
  stats.taskSpecsDeleted = staleTaskIds.length;

  const versionHash = computeSyncVersionHash(
    lexemeRows.map((row) => ({ id: row.id, updatedAt: row.updatedAt ?? null })),
    inflectionRows.map((row) => ({ id: row.id, lexemeId: row.lexemeId, updatedAt: row.updatedAt ?? null })),
  );

  const checkpoint: TaskSpecSyncCheckpoint | null =
    latestTouchedAt && lexemeRows.length > 0
      ? { lastSyncedAt: latestTouchedAt, versionHash: versionHash ?? null }
      : null;

  const checkpointChanged = Boolean(
    checkpoint &&
      (!previousCheckpoint ||
        checkpoint.lastSyncedAt.getTime() !== previousCheckpoint.lastSyncedAt.getTime() ||
        checkpoint.versionHash !== previousCheckpoint.versionHash),
  );

  return {
    inserts,
    staleTaskIds,
    latestTouchedAt,
    stats,
    checkpoint,
    checkpointChanged,
  };
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

  if (fallbackExampleEn && (!exampleEn || (exampleDe && exampleEn === exampleDe))) {
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
        .sort((left, right) => FEATURE_KEY_ORDER.indexOf(left as FeatureKey) - FEATURE_KEY_ORDER.indexOf(right as FeatureKey))
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
    return Number(value) === expected;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === expected.toLowerCase();
  }

  if (Array.isArray(value)) {
    return value.some((entry) => toOptionalString(entry)?.toLowerCase() === expected.toLowerCase());
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
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'true') {
      return true;
    }
    if (normalised === 'false') {
      return false;
    }
  }

  return null;
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

export function asLexemePos(value: string | null | undefined): LexemePos | null {
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

export const __TEST_ONLY__ = {
  createInflectionFinder,
};
