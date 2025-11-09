import { eq, sql } from "drizzle-orm";

import { backgroundJobRuns, db } from "@db";

import { logStructured } from "../logger.js";
import { emitMetric } from "../metrics/emitter.js";
import { ensureTaskSpecsSynced, type TaskSyncStats } from "../tasks/synchronizer.js";

import { notifyJobFailure } from "./notifier.js";

const JOB_NAME = "regenerate_queues";
const METRIC_DURATION = "background_job_duration_ms";
const METRIC_FAILURE_TOTAL = "background_job_failure_total";

export interface RunRegenerateQueuesOptions {
  triggeredBy?: string | null;
  reason?: string | null;
}

export interface RegenerateQueuesJobResult {
  jobRunId: number;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  stats: TaskSyncStats;
  latestTouchedAt: Date | null;
}

export async function runRegenerateQueuesJob(
  options: RunRegenerateQueuesOptions = {},
): Promise<RegenerateQueuesJobResult> {
  const startedAt = new Date();
  const startedHr = process.hrtime.bigint();
  const triggeredBy = options.triggeredBy ?? null;
  const reason = options.reason ?? null;

  logStructured({
    source: "jobs",
    event: "jobs.regenerate_queues.start",
    data: {
      job: JOB_NAME,
      triggeredBy,
      reason,
    },
  });

  const [run] = await db
    .insert(backgroundJobRuns)
    .values({
      jobName: JOB_NAME,
      status: "running",
      startedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
      stats: buildInitialMetadata(triggeredBy, reason),
    })
    .returning({ id: backgroundJobRuns.id });

  const runId = run.id;

  try {
    const syncResult = await ensureTaskSpecsSynced();
    const finishedAt = new Date();
    const durationMs = Number(process.hrtime.bigint() - startedHr) / 1_000_000;

    emitMetric({
      name: METRIC_DURATION,
      value: durationMs,
      tags: { job: JOB_NAME, status: "success" },
    });

    await db
      .update(backgroundJobRuns)
      .set({
        status: "success",
        finishedAt,
        durationMs,
        stats: buildSuccessMetadata(syncResult.stats, syncResult.latestTouchedAt, triggeredBy, reason),
        updatedAt: sql`now()`,
      })
      .where(eq(backgroundJobRuns.id, runId));

    logStructured({
      source: "jobs",
      event: "jobs.regenerate_queues.finish",
      message: "Practice queues regenerated successfully.",
      data: {
        job: JOB_NAME,
        durationMs,
        latestTouchedAt: syncResult.latestTouchedAt?.toISOString() ?? null,
        stats: syncResult.stats,
      },
    });

    return {
      jobRunId: runId,
      startedAt,
      finishedAt,
      durationMs,
      stats: syncResult.stats,
      latestTouchedAt: syncResult.latestTouchedAt ?? null,
    };
  } catch (error) {
    const finishedAt = new Date();
    const durationMs = Number(process.hrtime.bigint() - startedHr) / 1_000_000;

    emitMetric({
      name: METRIC_DURATION,
      value: durationMs,
      tags: { job: JOB_NAME, status: "failed" },
    });

    emitMetric({
      name: METRIC_FAILURE_TOTAL,
      value: 1,
      tags: { job: JOB_NAME },
    });

    await db
      .update(backgroundJobRuns)
      .set({
        status: "failed",
        finishedAt,
        durationMs,
        error: serialiseError(error),
        updatedAt: sql`now()`,
      })
      .where(eq(backgroundJobRuns.id, runId));

    logStructured({
      source: "jobs",
      level: "error",
      event: "jobs.regenerate_queues.failed",
      message: "Regenerate queues job failed.",
      data: {
        job: JOB_NAME,
        durationMs,
      },
      error,
    });

    await notifyJobFailure({
      jobName: JOB_NAME,
      startedAt,
      finishedAt,
      durationMs,
      error,
    });

    throw error;
  }
}

function buildInitialMetadata(triggeredBy: string | null, reason: string | null) {
  return {
    triggeredBy,
    reason,
  } satisfies Record<string, unknown>;
}

function buildSuccessMetadata(
  stats: TaskSyncStats,
  latestTouchedAt: Date | null,
  triggeredBy: string | null,
  reason: string | null,
): Record<string, unknown> {
  return {
    triggeredBy,
    reason,
    latestTouchedAt: latestTouchedAt ? latestTouchedAt.toISOString() : null,
    stats,
  } satisfies Record<string, unknown>;
}

function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object") {
    return error as Record<string, unknown>;
  }

  return { message: String(error) };
}
