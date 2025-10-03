import { db } from '@db';
import {
  contentPacks,
  packLexemeMap,
  practiceHistory,
  schedulingState,
  taskSpecs,
  telemetryPriorities,
} from '@db/schema';
import { eq, gte } from 'drizzle-orm';

import { computePostLaunchAnalytics } from '../analytics/post-launch';

const LOOKBACK_DAYS = Number.parseInt(process.env.POS_ANALYTICS_LOOKBACK_DAYS ?? '', 10) || 30;

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function main(): Promise<void> {
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const practiceRows = await db
    .select({
      taskId: practiceHistory.taskId,
      lexemeId: practiceHistory.lexemeId,
      pos: practiceHistory.pos,
      taskType: practiceHistory.taskType,
      renderer: practiceHistory.renderer,
      deviceId: practiceHistory.deviceId,
      userId: practiceHistory.userId,
      result: practiceHistory.result,
      responseMs: practiceHistory.responseMs,
      submittedAt: practiceHistory.submittedAt,
      answeredAt: practiceHistory.answeredAt,
      hintsUsed: practiceHistory.hintsUsed,
      packId: practiceHistory.packId,
      featureFlags: practiceHistory.featureFlags,
      metadata: practiceHistory.metadata,
    })
    .from(practiceHistory)
    .where(gte(practiceHistory.submittedAt, since))
    .orderBy(practiceHistory.submittedAt);

  const schedulingRows = await db
    .select({
      taskId: schedulingState.taskId,
      deviceId: schedulingState.deviceId,
      pos: taskSpecs.pos,
      taskType: taskSpecs.taskType,
      leitnerBox: schedulingState.leitnerBox,
      priorityScore: schedulingState.priorityScore,
      dueAt: schedulingState.dueAt,
      updatedAt: schedulingState.updatedAt,
      totalAttempts: schedulingState.totalAttempts,
      correctAttempts: schedulingState.correctAttempts,
      averageResponseMs: schedulingState.averageResponseMs,
      accuracyWeight: schedulingState.accuracyWeight,
      latencyWeight: schedulingState.latencyWeight,
      stabilityWeight: schedulingState.stabilityWeight,
    })
    .from(schedulingState)
    .innerJoin(taskSpecs, eq(taskSpecs.id, schedulingState.taskId));

  const telemetryRows = await db
    .select({
      taskId: telemetryPriorities.taskId,
      pos: taskSpecs.pos,
      sampledAt: telemetryPriorities.sampledAt,
      priorityScore: telemetryPriorities.priorityScore,
      accuracyWeight: telemetryPriorities.accuracyWeight,
      latencyWeight: telemetryPriorities.latencyWeight,
      stabilityWeight: telemetryPriorities.stabilityWeight,
      metadata: telemetryPriorities.metadata,
    })
    .from(telemetryPriorities)
    .innerJoin(taskSpecs, eq(taskSpecs.id, telemetryPriorities.taskId))
    .where(gte(telemetryPriorities.sampledAt, since));

  const packRows = await db
    .select({
      packId: packLexemeMap.packId,
      packName: contentPacks.name,
      posScope: contentPacks.posScope,
      lexemeId: packLexemeMap.lexemeId,
    })
    .from(packLexemeMap)
    .innerJoin(contentPacks, eq(contentPacks.id, packLexemeMap.packId));

  const report = computePostLaunchAnalytics({
    practiceAttempts: practiceRows.map((row) => ({
      taskId: row.taskId,
      lexemeId: row.lexemeId,
      pos: row.pos,
      taskType: row.taskType,
      renderer: row.renderer,
      deviceId: row.deviceId,
      userId: row.userId ?? null,
      result: row.result,
      responseMs: row.responseMs,
      submittedAt: toDate(row.submittedAt) ?? new Date(),
      answeredAt: toDate(row.answeredAt),
      hintsUsed: row.hintsUsed,
      packId: row.packId ?? null,
      featureFlags: row.featureFlags ?? null,
      metadata: row.metadata ?? null,
    })),
    schedulingSnapshots: schedulingRows.map((row) => ({
      taskId: row.taskId,
      deviceId: row.deviceId,
      pos: row.pos,
      taskType: row.taskType,
      leitnerBox: row.leitnerBox,
      priorityScore: row.priorityScore,
      dueAt: toDate(row.dueAt),
      updatedAt: toDate(row.updatedAt) ?? new Date(),
      totalAttempts: row.totalAttempts,
      correctAttempts: row.correctAttempts,
      averageResponseMs: row.averageResponseMs,
      accuracyWeight: row.accuracyWeight,
      latencyWeight: row.latencyWeight,
      stabilityWeight: row.stabilityWeight,
    })),
    telemetrySnapshots: telemetryRows.map((row) => ({
      taskId: row.taskId,
      pos: row.pos,
      sampledAt: toDate(row.sampledAt) ?? new Date(),
      priorityScore: row.priorityScore,
      accuracyWeight: row.accuracyWeight,
      latencyWeight: row.latencyWeight,
      stabilityWeight: row.stabilityWeight,
      metadata: row.metadata ?? null,
    })),
    packMemberships: packRows.map((row) => ({
      packId: row.packId,
      packName: row.packName,
      posScope: row.posScope,
      lexemeId: row.lexemeId,
    })),
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Failed to export POS analytics report:', error);
  process.exit(1);
});
