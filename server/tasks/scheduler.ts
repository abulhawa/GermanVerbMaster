import { db } from "@db";
import {
  schedulingState,
  taskSpecs,
  telemetryPriorities,
} from "@db";
import type { PracticeResult } from "@shared";
import type { TaskType } from "@shared";
import { and, count, eq } from "drizzle-orm";
import {
  BOX_INTERVALS_MS,
  MAX_LEITNER_BOX,
  clamp,
  computeAccuracyWeight,
  computeLatencyWeight,
  computeNextDueDate,
  computePriorityScore,
  computeStabilityWeight,
} from "../srs/priority.js";

export interface SchedulingSnapshot {
  id?: number;
  leitnerBox: number;
  totalAttempts: number;
  correctAttempts: number;
  averageResponseMs: number;
  accuracyWeight: number;
  latencyWeight: number;
  stabilityWeight: number;
  dueAt?: Date | null;
  priorityScore?: number | null;
}

export interface SubmissionComputationParams {
  result: PracticeResult;
  responseMs: number;
  queueCap: number;
  coverageAssignments: number;
  now: Date;
}

export interface SubmissionMetrics {
  leitnerBox: number;
  totalAttempts: number;
  correctAttempts: number;
  averageResponseMs: number;
  accuracyWeight: number;
  latencyWeight: number;
  stabilityWeight: number;
  basePriority: number;
  weaknessComponent: number;
  coverageScore: number;
  blendedPriority: number;
  dueAt: Date;
}

export interface TaskSubmissionParams {
  deviceId: string;
  taskId: string;
  taskType: TaskType;
  pos: string;
  queueCap: number;
  result: PracticeResult;
  responseMs: number;
  submittedAt?: Date;
  frequencyRank?: number | null;
}

export interface TaskSubmissionResult {
  leitnerBox: number;
  totalAttempts: number;
  correctAttempts: number;
  averageResponseMs: number;
  dueAt: Date;
  priorityScore: number;
  coverageScore: number;
  queueCap: number;
}

const INCORRECT_REVIEW_DELAY_MS = 10 * 60 * 1000;

export function computeCoverageScore(assignments: number, queueCap: number): number {
  if (!Number.isFinite(queueCap) || queueCap <= 0) {
    return 0;
  }
  const ratio = assignments / queueCap;
  return Number(clamp(1 - Math.min(Math.max(ratio, 0), 1), 0, 1).toFixed(4));
}

export function calculateSubmissionMetrics(
  snapshot: SchedulingSnapshot | null,
  params: SubmissionComputationParams,
): SubmissionMetrics {
  const now = params.now;
  const previousBox = snapshot?.leitnerBox ?? 1;
  const previousAttempts = snapshot?.totalAttempts ?? 0;
  const previousCorrect = snapshot?.correctAttempts ?? 0;
  const previousAverage = snapshot?.averageResponseMs ?? params.responseMs;

  const totalAttempts = previousAttempts + 1;
  const correctAttempts = previousCorrect + (params.result === "correct" ? 1 : 0);
  const averageResponseMs = Math.round(
    ((previousAverage || params.responseMs) * previousAttempts + params.responseMs) /
      Math.max(totalAttempts, 1),
  );

  const updatedBox = params.result === "correct"
    ? Math.min(previousBox + 1, MAX_LEITNER_BOX)
    : Math.max(previousBox - 1, 1);

  const accuracyWeight = computeAccuracyWeight(totalAttempts, correctAttempts);
  const latencyWeight = computeLatencyWeight(averageResponseMs);
  const stabilityWeight = computeStabilityWeight(updatedBox, totalAttempts);

  const dueAt = params.result === "correct"
    ? computeNextDueDate(updatedBox, now.getTime())
    : new Date(now.getTime() + Math.max(INCORRECT_REVIEW_DELAY_MS, BOX_INTERVALS_MS[1] / 12));

  const basePriority = computePriorityScore({
    accuracyWeight,
    latencyWeight,
    stabilityWeight,
    leitnerBox: updatedBox,
    dueAt,
    now: now.getTime(),
  });

  const weaknessComponent = Number((1 - accuracyWeight).toFixed(4));
  const coverageScore = computeCoverageScore(params.coverageAssignments, params.queueCap);

  const blendedPriority = Number(
    clamp(basePriority * 0.7 + weaknessComponent * 0.2 + coverageScore * 0.1, 0, 1.5).toFixed(6),
  );

  return {
    leitnerBox: updatedBox,
    totalAttempts,
    correctAttempts,
    averageResponseMs,
    accuracyWeight,
    latencyWeight,
    stabilityWeight,
    basePriority,
    weaknessComponent,
    coverageScore,
    blendedPriority,
    dueAt,
  };
}

export async function processTaskSubmission(params: TaskSubmissionParams): Promise<TaskSubmissionResult> {
  const now = params.submittedAt ?? new Date();
  const existingRows = await db
    .select({
      id: schedulingState.id,
      leitnerBox: schedulingState.leitnerBox,
      totalAttempts: schedulingState.totalAttempts,
      correctAttempts: schedulingState.correctAttempts,
      averageResponseMs: schedulingState.averageResponseMs,
      accuracyWeight: schedulingState.accuracyWeight,
      latencyWeight: schedulingState.latencyWeight,
      stabilityWeight: schedulingState.stabilityWeight,
      dueAt: schedulingState.dueAt,
      priorityScore: schedulingState.priorityScore,
    })
    .from(schedulingState)
    .where(
      and(
        eq(schedulingState.deviceId, params.deviceId),
        eq(schedulingState.taskId, params.taskId),
      ),
    )
    .limit(1);

  const snapshot: SchedulingSnapshot | null = existingRows.length
    ? {
        id: existingRows[0].id,
        leitnerBox: existingRows[0].leitnerBox,
        totalAttempts: existingRows[0].totalAttempts,
        correctAttempts: existingRows[0].correctAttempts,
        averageResponseMs: existingRows[0].averageResponseMs,
        accuracyWeight: existingRows[0].accuracyWeight,
        latencyWeight: existingRows[0].latencyWeight,
        stabilityWeight: existingRows[0].stabilityWeight,
        dueAt: existingRows[0].dueAt,
        priorityScore: existingRows[0].priorityScore,
      }
    : null;

  const coverageRows = await db
    .select({
      value: count(),
    })
    .from(schedulingState)
    .innerJoin(taskSpecs, eq(taskSpecs.id, schedulingState.taskId))
    .where(
      and(
        eq(schedulingState.deviceId, params.deviceId),
        eq(taskSpecs.pos, params.pos),
      ),
    )
    .limit(1);

  const rawAssignments = coverageRows[0]?.value;
  let currentAssignments = Number(rawAssignments);
  if (!Number.isFinite(currentAssignments)) {
    currentAssignments = 0;
  }
  let predictedAssignments = snapshot ? currentAssignments : currentAssignments + 1;
  if (!Number.isFinite(predictedAssignments)) {
    predictedAssignments = snapshot ? currentAssignments : currentAssignments + 1;
    if (!Number.isFinite(predictedAssignments)) {
      predictedAssignments = snapshot ? 0 : 1;
    }
  }

  const metrics = calculateSubmissionMetrics(snapshot, {
    result: params.result,
    responseMs: params.responseMs,
    queueCap: params.queueCap,
    coverageAssignments: predictedAssignments,
    now,
  });

  if (snapshot?.id) {
    await db
      .update(schedulingState)
      .set({
        leitnerBox: metrics.leitnerBox,
        totalAttempts: metrics.totalAttempts,
        correctAttempts: metrics.correctAttempts,
        averageResponseMs: metrics.averageResponseMs,
        accuracyWeight: metrics.accuracyWeight,
        latencyWeight: metrics.latencyWeight,
        stabilityWeight: metrics.stabilityWeight,
        priorityScore: metrics.blendedPriority,
        dueAt: metrics.dueAt,
        lastResult: params.result,
        lastPracticedAt: now,
        updatedAt: now,
      })
      .where(eq(schedulingState.id, snapshot.id!));
  } else {
    await db.insert(schedulingState).values({
      deviceId: params.deviceId,
      taskId: params.taskId,
      leitnerBox: metrics.leitnerBox,
      totalAttempts: metrics.totalAttempts,
      correctAttempts: metrics.correctAttempts,
      averageResponseMs: metrics.averageResponseMs,
      accuracyWeight: metrics.accuracyWeight,
      latencyWeight: metrics.latencyWeight,
      stabilityWeight: metrics.stabilityWeight,
      priorityScore: metrics.blendedPriority,
      dueAt: metrics.dueAt,
      lastResult: params.result,
      lastPracticedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.insert(telemetryPriorities).values({
    taskId: params.taskId,
    sampledAt: now,
    priorityScore: metrics.blendedPriority,
    accuracyWeight: metrics.accuracyWeight,
    latencyWeight: metrics.latencyWeight,
    stabilityWeight: metrics.stabilityWeight,
    frequencyRank: params.frequencyRank ?? null,
    metadata: {
      basePriority: metrics.basePriority,
      blendedPriority: metrics.blendedPriority,
      coverageScore: metrics.coverageScore,
      weaknessComponent: metrics.weaknessComponent,
      queueCap: params.queueCap,
      posAssignments: predictedAssignments,
      totalAttempts: metrics.totalAttempts,
      correctAttempts: metrics.correctAttempts,
      responseMs: params.responseMs,
      dueAt: metrics.dueAt.toISOString(),
    },
    createdAt: now,
  });

  return {
    leitnerBox: metrics.leitnerBox,
    totalAttempts: metrics.totalAttempts,
    correctAttempts: metrics.correctAttempts,
    averageResponseMs: metrics.averageResponseMs,
    dueAt: metrics.dueAt,
    priorityScore: metrics.blendedPriority,
    coverageScore: metrics.coverageScore,
    queueCap: params.queueCap,
  } satisfies TaskSubmissionResult;
}
