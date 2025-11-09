import { logStructured } from "../logger.js";

export interface JobFailureNotification {
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  error: unknown;
}

const WEBHOOK_URL = process.env.JOB_ALERT_WEBHOOK_URL?.trim();

export async function notifyJobFailure(
  payload: JobFailureNotification,
): Promise<void> {
  if (!WEBHOOK_URL) {
    logStructured({
      source: "jobs",
      level: "warn",
      event: "jobs.alert.skipped",
      message: "JOB_ALERT_WEBHOOK_URL is not configured; skipping job failure notification.",
      data: {
        job: payload.jobName,
      },
    });
    return;
  }

  const body = {
    job: payload.jobName,
    status: "failed",
    startedAt: payload.startedAt.toISOString(),
    finishedAt: payload.finishedAt.toISOString(),
    durationMs: payload.durationMs,
    error: normaliseError(payload.error),
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status} ${response.statusText}`);
    }

    logStructured({
      source: "jobs",
      event: "jobs.alert.sent",
      message: "Sent regenerate queues failure notification.",
      data: {
        job: payload.jobName,
        webhookStatus: response.status,
      },
    });
  } catch (error) {
    logStructured({
      source: "jobs",
      level: "error",
      event: "jobs.alert.error",
      message: "Failed to dispatch job failure notification.",
      data: {
        job: payload.jobName,
      },
      error,
    });
  }
}

function normaliseError(error: unknown): Record<string, unknown> {
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
