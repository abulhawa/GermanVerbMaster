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

export function logError(error: unknown, source: string = DEFAULT_SOURCE): void {
  console.error(formatLogLine(normaliseError(error), source));
}
