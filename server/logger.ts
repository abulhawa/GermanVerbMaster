const DEFAULT_SOURCE = "express";

function formatTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatLogLine(message: string, source: string): string {
  return `${formatTimestamp()} [${source}] ${message}`;
}

export function log(message: string, source: string = DEFAULT_SOURCE): void {
  console.log(formatLogLine(message, source));
}

function normaliseError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

export interface StructuredLogEntry {
  event: string;
  level?: "info" | "warn" | "error" | "debug";
  source?: string;
  message?: string;
  data?: Record<string, unknown>;
  error?: unknown;
}

export function logStructured(entry: StructuredLogEntry): void {
  const { event, level = "info", source = DEFAULT_SOURCE, message, data, error } = entry;
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    source,
    event,
  };

  if (message) {
    payload.message = message;
  }

  if (data) {
    payload.data = data;
  }

  if (error !== undefined) {
    payload.error = normaliseError(error);
  }

  const serialised = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialised);
    return;
  }

  if (level === "warn") {
    console.warn(serialised);
    return;
  }

  if (level === "debug") {
    console.debug(serialised);
    return;
  }

  console.log(serialised);
}

export function logError(error: unknown, source: string = DEFAULT_SOURCE): void {
  console.error(formatLogLine(normaliseError(error), source));
}
