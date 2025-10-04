import { db } from '@db';
import { lexemes, schedulingState, taskSpecs } from '@db/schema';
import type { AdaptiveQueueItem } from '@shared';
import { and, desc, eq, sql } from 'drizzle-orm';

const MAX_COMPARISON_LIMIT = 50;
const MIN_COMPARISON_LIMIT = 1;
const DEFAULT_EMPTY_QUEUE_LIMIT = 10;

type SchedulingRow = {
  taskId: string;
  lexemeId: string;
  lemma: string;
  priorityScore: number;
  dueAt: Date | null;
  leitnerBox: number;
  accuracyWeight: number;
  latencyWeight: number;
  stabilityWeight: number;
};

type FallbackRow = {
  taskId: string;
  lexemeId: string;
  lemma: string;
};

export interface VerbShadowQueueItem {
  taskId: string;
  lexemeId: string;
  lemma: string;
  priorityScore: number;
  dueAt: Date | null;
  leitnerBox: number | null;
  accuracyWeight: number | null;
  latencyWeight: number | null;
  stabilityWeight: number | null;
  source: 'scheduled' | 'fallback';
}

export interface VerbShadowQueueSnapshot {
  generatedAt: Date;
  generationDurationMs: number;
  items: VerbShadowQueueItem[];
}

export interface LegacyVerbQueueSnapshot {
  deviceId: string;
  items: AdaptiveQueueItem[];
}

export interface QueueDivergenceReport {
  deviceId: string;
  legacyLength: number;
  shadowLength: number;
  matches: number;
  missingInShadow: string[];
  missingInLegacy: string[];
  orderMismatches: Array<{ index: number; legacyVerb: string; shadowLemma: string }>;
}

export async function buildVerbShadowQueue(
  deviceId: string,
  limit: number,
): Promise<VerbShadowQueueSnapshot> {
  const startedAt = Date.now();
  const safeLimit = Math.min(
    Math.max(Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_EMPTY_QUEUE_LIMIT, MIN_COMPARISON_LIMIT),
    MAX_COMPARISON_LIMIT,
  );

  const scheduledRows = await db
    .select({
      taskId: schedulingState.taskId,
      lexemeId: lexemes.id,
      lemma: lexemes.lemma,
      priorityScore: schedulingState.priorityScore,
      dueAt: schedulingState.dueAt,
      leitnerBox: schedulingState.leitnerBox,
      accuracyWeight: schedulingState.accuracyWeight,
      latencyWeight: schedulingState.latencyWeight,
      stabilityWeight: schedulingState.stabilityWeight,
    })
    .from(schedulingState)
    .innerJoin(taskSpecs, eq(taskSpecs.id, schedulingState.taskId))
    .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id))
    .where(and(eq(schedulingState.deviceId, deviceId), eq(taskSpecs.pos, 'verb')))
    .orderBy(
      desc(schedulingState.priorityScore),
      sql`COALESCE(${schedulingState.dueAt}, '1970-01-01T00:00:00Z'::timestamptz)`,
      sql`lower(${lexemes.lemma})`,
    )
    .limit(safeLimit);

  const items: VerbShadowQueueItem[] = scheduledRows.map((row) => ({
    taskId: row.taskId,
    lexemeId: row.lexemeId,
    lemma: row.lemma,
    priorityScore: Number.isFinite(row.priorityScore) ? Number(row.priorityScore) : 0,
    dueAt: row.dueAt ?? null,
    leitnerBox: row.leitnerBox,
    accuracyWeight: row.accuracyWeight,
    latencyWeight: row.latencyWeight,
    stabilityWeight: row.stabilityWeight,
    source: 'scheduled',
  }));

  const seenTaskIds = new Set(items.map((item) => item.taskId));

  if (items.length < safeLimit) {
    const fallbackRows = await db
      .select({
        taskId: taskSpecs.id,
        lexemeId: lexemes.id,
        lemma: lexemes.lemma,
      })
      .from(taskSpecs)
      .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id))
      .where(eq(taskSpecs.pos, 'verb'))
      .orderBy(sql`lower(${lexemes.lemma})`)
      .limit(safeLimit * 3);

    for (const row of fallbackRows) {
      if (seenTaskIds.has(row.taskId)) continue;
      items.push({
        taskId: row.taskId,
        lexemeId: row.lexemeId,
        lemma: row.lemma,
        priorityScore: 0,
        dueAt: null,
        leitnerBox: null,
        accuracyWeight: null,
        latencyWeight: null,
        stabilityWeight: null,
        source: 'fallback',
      });
      seenTaskIds.add(row.taskId);
      if (items.length >= safeLimit) break;
    }
  }

  return {
    generatedAt: new Date(),
    generationDurationMs: Date.now() - startedAt,
    items,
  } satisfies VerbShadowQueueSnapshot;
}

function normaliseLemma(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= 10) break;
  }
  return result;
}

export function computeQueueDivergence(
  legacy: LegacyVerbQueueSnapshot,
  shadow: VerbShadowQueueSnapshot,
): QueueDivergenceReport {
  const legacyVerbs = legacy.items.map((item) => normaliseLemma(item.verb));
  const shadowLemmas = shadow.items.map((item) => normaliseLemma(item.lemma));

  const legacySet = new Set(legacyVerbs);
  const shadowSet = new Set(shadowLemmas);

  const missingInShadow = legacy.items
    .filter((item) => !shadowSet.has(normaliseLemma(item.verb)))
    .map((item) => item.verb);
  const missingInLegacy = shadow.items
    .filter((item) => !legacySet.has(normaliseLemma(item.lemma)))
    .map((item) => item.lemma);

  const orderMismatches: Array<{ index: number; legacyVerb: string; shadowLemma: string }> = [];
  const comparisonLength = Math.min(legacy.items.length, shadow.items.length);
  for (let index = 0; index < comparisonLength; index += 1) {
    const legacyVerb = normaliseLemma(legacy.items[index]?.verb ?? '');
    const shadowLemma = normaliseLemma(shadow.items[index]?.lemma ?? '');
    if (!legacyVerb || !shadowLemma) continue;
    if (legacyVerb !== shadowLemma) {
      orderMismatches.push({
        index,
        legacyVerb: legacy.items[index]!.verb,
        shadowLemma: shadow.items[index]!.lemma,
      });
      if (orderMismatches.length >= 10) break;
    }
  }

  const matches = legacy.items.length - missingInShadow.length;

  return {
    deviceId: legacy.deviceId,
    legacyLength: legacy.items.length,
    shadowLength: shadow.items.length,
    matches,
    missingInShadow: unique(missingInShadow),
    missingInLegacy: unique(missingInLegacy),
    orderMismatches,
  } satisfies QueueDivergenceReport;
}

export interface ShadowComparisonLogger {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
}

export async function runVerbQueueShadowComparison({
  deviceId,
  legacyQueue,
  limit,
  logger = console,
}: {
  deviceId: string;
  legacyQueue: LegacyVerbQueueSnapshot;
  limit?: number;
  logger?: ShadowComparisonLogger;
}): Promise<void> {
  const comparisonLimit = Math.min(
    Math.max(
      limit ?? (legacyQueue.items.length || DEFAULT_EMPTY_QUEUE_LIMIT),
      MIN_COMPARISON_LIMIT,
    ),
    MAX_COMPARISON_LIMIT,
  );

  const shadowQueue = await buildVerbShadowQueue(deviceId, comparisonLimit);
  const divergence = computeQueueDivergence(legacyQueue, shadowQueue);

  const metadata = {
    deviceId,
    generatedAt: shadowQueue.generatedAt.toISOString(),
    generationDurationMs: shadowQueue.generationDurationMs,
    legacyLength: divergence.legacyLength,
    shadowLength: divergence.shadowLength,
    matches: divergence.matches,
    missingInShadow: divergence.missingInShadow,
    missingInLegacy: divergence.missingInLegacy,
    orderMismatches: divergence.orderMismatches,
    legacySample: legacyQueue.items.slice(0, 5),
    shadowSample: shadowQueue.items.slice(0, 5).map((item) => ({
      lemma: item.lemma,
      taskId: item.taskId,
      priorityScore: item.priorityScore,
      dueAt: item.dueAt ? item.dueAt.toISOString() : null,
      source: item.source,
    })),
  } satisfies Record<string, unknown>;

  if (
    divergence.missingInShadow.length > 0 ||
    divergence.missingInLegacy.length > 0 ||
    divergence.orderMismatches.length > 0 ||
    divergence.shadowLength === 0
  ) {
    logger.warn('[shadow-mode] Verb queue divergence detected', metadata);
  } else {
    logger.info('[shadow-mode] Verb queue parity confirmed', metadata);
  }
}
