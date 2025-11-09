import process from "node:process";

import { and, desc, eq, sql } from "drizzle-orm";

import { backgroundJobRuns, getDb, getPool } from "@db";

const DEFAULT_JOB_NAME = "regenerate_queues";
const DEFAULT_MAX_AGE_MINUTES = 180;
const DEFAULT_MAX_RUNNING_MINUTES = 30;

type JobStatus = "running" | "success" | "failed";

type JobRunRow = typeof backgroundJobRuns.$inferSelect;

const STATUS_SUCCESS: JobStatus = "success";

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveJobName(): string {
  const cliJob = process.argv[2];
  if (cliJob && cliJob.trim().length > 0) {
    return cliJob.trim();
  }
  const envJob = process.env.JOB_NAME;
  if (envJob && envJob.trim().length > 0) {
    return envJob.trim();
  }
  return DEFAULT_JOB_NAME;
}

function describeRun(run: JobRunRow): Record<string, unknown> {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt?.toISOString?.() ?? null,
    finishedAt: run.finishedAt?.toISOString?.() ?? null,
    durationMs: run.durationMs ?? null,
  };
}

async function main(): Promise<void> {
  const jobName = resolveJobName();
  const maxAgeMinutes = parseNumber(process.env.JOB_MAX_AGE_MINUTES, DEFAULT_MAX_AGE_MINUTES);
  const maxRunningMinutes = parseNumber(
    process.env.JOB_MAX_RUNNING_MINUTES,
    DEFAULT_MAX_RUNNING_MINUTES,
  );

  const db = getDb();

  const [latestRun] = await db
    .select()
    .from(backgroundJobRuns)
    .where(eq(backgroundJobRuns.jobName, jobName))
    .orderBy(desc(backgroundJobRuns.startedAt))
    .limit(1);

  if (!latestRun) {
    console.error(
      JSON.stringify({
        event: "jobs.health.missing",
        message: `No runs recorded for job ${jobName}.`,
        job: jobName,
      }),
    );
    process.exit(2);
  }

  const now = Date.now();
  const startedAt = latestRun.startedAt ? new Date(latestRun.startedAt) : null;

  if (latestRun.status === "running") {
    const elapsed = startedAt ? now - startedAt.getTime() : 0;
    const elapsedMinutes = elapsed / 60000;

    if (elapsedMinutes > maxRunningMinutes) {
      console.error(
        JSON.stringify({
          event: "jobs.health.running_timeout",
          message: `Job ${jobName} has been running for ${elapsedMinutes.toFixed(1)} minutes (threshold ${maxRunningMinutes}).`,
          job: jobName,
          run: describeRun(latestRun),
        }),
      );
      process.exit(3);
    }
  }

  const [latestSuccess] = await db
    .select()
    .from(backgroundJobRuns)
    .where(and(eq(backgroundJobRuns.jobName, jobName), eq(backgroundJobRuns.status, STATUS_SUCCESS)))
    .orderBy(desc(sql`coalesce(${backgroundJobRuns.finishedAt}, ${backgroundJobRuns.startedAt})`))
    .limit(1);

  if (!latestSuccess) {
    console.error(
      JSON.stringify({
        event: "jobs.health.no_success",
        message: `Job ${jobName} has never succeeded.`,
        job: jobName,
        run: describeRun(latestRun),
      }),
    );
    process.exit(4);
  }

  const reference = latestSuccess.finishedAt ?? latestSuccess.startedAt ?? null;
  if (!reference) {
    console.error(
      JSON.stringify({
        event: "jobs.health.unknown_reference",
        message: `Unable to determine completion time for job ${jobName}.`,
        job: jobName,
        run: describeRun(latestSuccess),
      }),
    );
    process.exit(5);
  }

  const referenceAgeMinutes = (now - new Date(reference).getTime()) / 60000;
  if (referenceAgeMinutes > maxAgeMinutes) {
    console.error(
      JSON.stringify({
        event: "jobs.health.stale",
        message: `Last successful ${jobName} run was ${referenceAgeMinutes.toFixed(1)} minutes ago (threshold ${maxAgeMinutes}).`,
        job: jobName,
        run: describeRun(latestSuccess),
      }),
    );
    process.exit(6);
  }

  if (latestRun.status === "failed") {
    console.error(
      JSON.stringify({
        event: "jobs.health.last_run_failed",
        message: `Most recent ${jobName} run failed at ${latestRun.finishedAt?.toISOString() ?? latestRun.startedAt?.toISOString()}.`,
        job: jobName,
        run: describeRun(latestRun),
      }),
    );
    process.exit(7);
  }

  console.log(
    JSON.stringify({
      event: "jobs.health.ok",
      message: `Job ${jobName} healthy. Last success ${referenceAgeMinutes.toFixed(1)} minutes ago.`,
      job: jobName,
      run: describeRun(latestSuccess),
    }),
  );
}

try {
  await main();
} finally {
  const pool = getPool();
  await pool.end();
}
