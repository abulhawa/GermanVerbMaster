import { randomUUID } from "node:crypto";
import { db } from "@db";
import {
  verbSchedulingState,
  verbReviewQueues,
  words,
  type VerbReviewQueue,
  type VerbSchedulingState,
} from "@db/schema";
import type { AdaptiveQueueItem, PracticeResult } from "@shared";
import { and, eq, sql } from "drizzle-orm";
import {
  BOX_INTERVALS_MS,
  MAX_LEITNER_BOX,
  computeAccuracyWeight,
  computeLatencyWeight,
  computeNextDueDate,
  computePredictedIntervalMinutes,
  computePriorityScore,
  computeStabilityWeight,
} from "./priority";

const FEATURE_FLAG_ENV = "FEATURE_ADAPTIVE_QUEUE";
const MIN_QUEUE_SIZE_ENV = "ADAPTIVE_QUEUE_MIN_SIZE";
const MAX_QUEUE_ITEMS_ENV = "ADAPTIVE_QUEUE_MAX_ITEMS";
const QUEUE_TTL_ENV = "ADAPTIVE_QUEUE_TTL_MS";
const DEFAULT_MIN_QUEUE_SIZE = 20;
const DEFAULT_MAX_QUEUE_ITEMS = 50;
const DEFAULT_QUEUE_TTL_MS = 15 * 60 * 1000;

interface SchedulingAttempt {
  deviceId: string;
  verb: string;
  level: string;
  result: PracticeResult;
  timeSpent: number;
  userId?: number | null;
  practicedAt?: Date;
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function getMinQueueSize(): number {
  const parsed = Number.parseInt(process.env[MIN_QUEUE_SIZE_ENV] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MIN_QUEUE_SIZE;
  }
  return Math.min(parsed, 200);
}

function getMaxQueueItems(): number {
  const parsed = Number.parseInt(process.env[MAX_QUEUE_ITEMS_ENV] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_QUEUE_ITEMS;
  }
  return Math.min(parsed, 200);
}

function getQueueTtlMs(): number {
  const parsed = Number.parseInt(process.env[QUEUE_TTL_ENV] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUEUE_TTL_MS;
  }
  return Math.min(parsed, 1000 * 60 * 60 * 24);
}

function now(): Date {
  return new Date();
}

async function getState(deviceId: string, verb: string): Promise<VerbSchedulingState | undefined> {
  return db.query.verbSchedulingState.findFirst({
    where: and(eq(verbSchedulingState.deviceId, deviceId), eq(verbSchedulingState.verb, verb)),
  });
}

async function ensureMinimumDeviceStates(deviceId: string, preferredLevel: string, referenceTime: Date): Promise<void> {
  const minSize = getMinQueueSize();
  const existing = await db
    .select({ verb: verbSchedulingState.verb })
    .from(verbSchedulingState)
    .where(eq(verbSchedulingState.deviceId, deviceId));

  if (existing.length >= minSize) {
    return;
  }

  const missing = minSize - existing.length;
  const existingSet = new Set(existing.map((row) => row.verb.toLowerCase()));

  const levelPriority = sql`CASE upper(coalesce(${words.level}, 'Z'))
    WHEN 'A1' THEN 0
    WHEN 'A2' THEN 1
    WHEN 'B1' THEN 2
    WHEN 'B2' THEN 3
    WHEN 'C1' THEN 4
    WHEN 'C2' THEN 5
    ELSE 6
  END`;

  const candidateRows = await db
    .select({ lemma: words.lemma, level: words.level })
    .from(words)
    .where(
      and(eq(words.pos, "V"), eq(words.canonical, true), eq(words.complete, true))
    )
    .orderBy(levelPriority, sql`lower(${words.lemma})`)
    .limit(minSize * 4);

  if (!candidateRows.length) {
    return;
  }

  const inserts = candidateRows
    .filter((row) => {
      const key = row.lemma.toLowerCase();
      if (existingSet.has(key)) return false;
      existingSet.add(key);
      return true;
    })
    .slice(0, missing)
    .map((row) => {
      const level = row.level ?? preferredLevel ?? "A1";
      return {
        deviceId,
        verb: row.lemma,
        level,
        leitnerBox: 1,
        totalAttempts: 0,
        correctAttempts: 0,
        averageResponseMs: BOX_INTERVALS_MS[1] / 10,
        accuracyWeight: 0.5,
        latencyWeight: 0.8,
        stabilityWeight: 0.1,
        priorityScore: 1,
        dueAt: referenceTime,
        lastResult: "incorrect" as PracticeResult,
        lastPracticedAt: referenceTime,
        createdAt: referenceTime,
        updatedAt: referenceTime,
      };
    });

  if (!inserts.length) {
    return;
  }

  await db
    .insert(verbSchedulingState)
    .values(inserts)
    .onConflictDoNothing({ target: [verbSchedulingState.deviceId, verbSchedulingState.verb] });
}

async function invalidateQueue(deviceId: string, referenceTime: Date): Promise<void> {
  await db
    .update(verbReviewQueues)
    .set({
      validUntil: new Date(referenceTime.getTime() - 1),
      updatedAt: referenceTime,
    })
    .where(eq(verbReviewQueues.deviceId, deviceId));
}

async function buildQueueItems(deviceId: string, generationTime: Date): Promise<AdaptiveQueueItem[]> {
  const states = await db.query.verbSchedulingState.findMany({
    where: eq(verbSchedulingState.deviceId, deviceId),
  });

  const updates: Array<Promise<unknown>> = [];
  const items: AdaptiveQueueItem[] = [];

  for (const state of states) {
    const dueDate = state.dueAt ?? computeNextDueDate(state.leitnerBox, generationTime.getTime());
    const priority = computePriorityScore({
      accuracyWeight: state.accuracyWeight,
      latencyWeight: state.latencyWeight,
      stabilityWeight: state.stabilityWeight,
      leitnerBox: state.leitnerBox,
      dueAt: dueDate,
      now: generationTime.getTime(),
    });

    if (!state.dueAt || Math.abs(priority - (state.priorityScore ?? 0)) > 0.0001) {
      updates.push(
        db
          .update(verbSchedulingState)
          .set({
            priorityScore: priority,
            dueAt: dueDate,
            updatedAt: generationTime,
          })
          .where(eq(verbSchedulingState.id, state.id)),
      );
    }

    items.push({
      verb: state.verb,
      priority,
      dueAt: dueDate.toISOString(),
      leitnerBox: state.leitnerBox,
      accuracyWeight: state.accuracyWeight,
      latencyWeight: state.latencyWeight,
      stabilityWeight: state.stabilityWeight,
      predictedIntervalMinutes: computePredictedIntervalMinutes(state.leitnerBox),
    });
  }

  if (updates.length) {
    await Promise.allSettled(updates);
  }

  return items;
}

async function storeQueue(
  deviceId: string,
  generatedAt: Date,
  durationMs: number,
  items: AdaptiveQueueItem[],
  userId: number | null,
): Promise<VerbReviewQueue> {
  const ttl = getQueueTtlMs();
  const validUntil = new Date(generatedAt.getTime() + ttl);
  const version = randomUUID();
  const itemCount = items.length;

  await db
    .insert(verbReviewQueues)
    .values({
      deviceId,
      userId,
      version,
      generatedAt,
      validUntil,
      generationDurationMs: durationMs,
      itemCount,
      items,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    })
    .onConflictDoUpdate({
      target: verbReviewQueues.deviceId,
      set: {
        userId,
        version,
        generatedAt,
        validUntil,
        generationDurationMs: durationMs,
        itemCount,
        items,
        updatedAt: generatedAt,
      },
    });

  const refreshed = await fetchQueueForDevice(deviceId);
  if (!refreshed) {
    throw new Error("Failed to persist adaptive review queue");
  }
  return refreshed;
}

async function regenerateForDevice(deviceId: string, levelHint: string | null): Promise<VerbReviewQueue | null> {
  const generatedAt = now();
  await ensureMinimumDeviceStates(deviceId, levelHint ?? "A1", generatedAt);
  const states = await db.query.verbSchedulingState.findMany({
    where: eq(verbSchedulingState.deviceId, deviceId),
  });

  if (!states.length) {
    await invalidateQueue(deviceId, generatedAt);
    return null;
  }

  const started = Date.now();
  const items = await buildQueueItems(deviceId, generatedAt);
  items.sort((a, b) => b.priority - a.priority);
  const limited = items.slice(0, getMaxQueueItems());
  const durationMs = Date.now() - started;

  const firstWithUser = states.find((state) => state.userId != null);
  return storeQueue(deviceId, generatedAt, durationMs, limited, firstWithUser?.userId ?? null);
}

async function regenerateQueues(): Promise<void> {
  if (!isEnabled()) {
    return;
  }
  const devices = await db
    .selectDistinct({ deviceId: verbSchedulingState.deviceId })
    .from(verbSchedulingState);

  for (const entry of devices) {
    const deviceId = entry.deviceId;
    if (!deviceId) continue;
    try {
      await regenerateForDevice(deviceId, null);
    } catch (error) {
      console.error("Failed to regenerate queue for device", deviceId, error);
    }
  }
}

const regenerationState: { activeRun: Promise<void> | null } = {
  activeRun: null,
};

export function isEnabled(): boolean {
  return parseBooleanFlag(process.env[FEATURE_FLAG_ENV]);
}

export async function recordPracticeAttempt(attempt: SchedulingAttempt): Promise<void> {
  const practicedAt = attempt.practicedAt ?? now();
  const existing = await getState(attempt.deviceId, attempt.verb);
  const previousBox = existing?.leitnerBox ?? 1;
  const totalAttempts = (existing?.totalAttempts ?? 0) + 1;
  const correctAttempts = (existing?.correctAttempts ?? 0) + (attempt.result === "correct" ? 1 : 0);
  const averageResponseMs = existing
    ? Math.round(((existing.averageResponseMs || attempt.timeSpent) * (totalAttempts - 1) + attempt.timeSpent) / totalAttempts)
    : attempt.timeSpent;
  const updatedBox = attempt.result === "correct"
    ? Math.min(MAX_LEITNER_BOX, previousBox + 1)
    : Math.max(1, previousBox - 1);

  const accuracyWeight = computeAccuracyWeight(totalAttempts, correctAttempts);
  const latencyWeight = computeLatencyWeight(averageResponseMs);
  const stabilityWeight = computeStabilityWeight(updatedBox, totalAttempts);
  const dueDate = computeNextDueDate(updatedBox, practicedAt.getTime());
  const priorityScore = computePriorityScore({
    accuracyWeight,
    latencyWeight,
    stabilityWeight,
    leitnerBox: updatedBox,
    dueAt: dueDate,
    now: practicedAt.getTime(),
  });
  const level = attempt.level ?? existing?.level ?? "A1";

  if (existing) {
    await db
      .update(verbSchedulingState)
      .set({
        userId: attempt.userId ?? existing.userId ?? null,
        level,
        leitnerBox: updatedBox,
        totalAttempts,
        correctAttempts,
        averageResponseMs,
        accuracyWeight,
        latencyWeight,
        stabilityWeight,
        priorityScore,
        dueAt: dueDate,
        lastResult: attempt.result,
        lastPracticedAt: practicedAt,
        updatedAt: practicedAt,
      })
      .where(eq(verbSchedulingState.id, existing.id));
  } else {
    await db.insert(verbSchedulingState).values({
      userId: attempt.userId ?? null,
      deviceId: attempt.deviceId,
      verb: attempt.verb,
      level,
      leitnerBox: updatedBox,
      totalAttempts,
      correctAttempts,
      averageResponseMs,
      accuracyWeight,
      latencyWeight,
      stabilityWeight,
      priorityScore,
      dueAt: dueDate,
      lastResult: attempt.result,
      lastPracticedAt: practicedAt,
      createdAt: practicedAt,
      updatedAt: practicedAt,
    });
  }

  await ensureMinimumDeviceStates(attempt.deviceId, level, practicedAt);
  await invalidateQueue(attempt.deviceId, practicedAt);
}

export async function fetchQueueForDevice(deviceId: string): Promise<VerbReviewQueue | null> {
  const record = await db.query.verbReviewQueues.findFirst({
    where: eq(verbReviewQueues.deviceId, deviceId),
  });
  return record ?? null;
}

export function isQueueStale(queue: VerbReviewQueue): boolean {
  if (!queue.validUntil) {
    return true;
  }
  return queue.validUntil.getTime() <= Date.now();
}

export async function generateQueueForDevice(deviceId: string, levelHint: string | null = null): Promise<VerbReviewQueue | null> {
  if (!isEnabled()) {
    return null;
  }
  return regenerateForDevice(deviceId, levelHint);
}

export async function regenerateQueuesOnce(): Promise<void> {
  if (!isEnabled()) {
    return;
  }

  if (regenerationState.activeRun) {
    return regenerationState.activeRun;
  }

  const runPromise = (async () => {
    try {
      await regenerateQueues();
    } finally {
      regenerationState.activeRun = null;
    }
  })();

  regenerationState.activeRun = runPromise;
  return runPromise;
}

export const srsEngine = {
  isEnabled,
  recordPracticeAttempt,
  fetchQueueForDevice,
  generateQueueForDevice,
  isQueueStale,
  regenerateQueuesOnce,
};
