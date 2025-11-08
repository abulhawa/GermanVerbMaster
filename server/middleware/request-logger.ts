import type { NextFunction, Request, RequestHandler, Response } from "express";

import { log } from "../logger.js";
import { isRequestPayloadLoggingEnabled } from "../config.js";

export interface RequestLoggerOptions {
  /**
   * Override the payload logging behaviour. Primarily exposed for tests.
   */
  logPayloads?: boolean;
}

function resolvePayloadLoggingOverride(override: boolean | undefined): boolean {
  if (override !== undefined) {
    return override;
  }

  return isRequestPayloadLoggingEnabled();
}

function formatDuration(start: number): number {
  return Date.now() - start;
}

function buildLogLine(
  req: Request,
  res: Response,
  duration: number,
  capturedResponse: unknown | undefined,
  shouldLogPayload: boolean,
): string {
  const method = req.method ?? "UNKNOWN";
  const route = req.originalUrl ?? req.url ?? req.path ?? "";
  const status = res.statusCode ?? 0;

  let logLine = `${method} ${route} ${status} in ${duration}ms`;

  if (shouldLogPayload && capturedResponse !== undefined) {
    try {
      logLine += ` :: ${JSON.stringify(capturedResponse)}`;
    } catch {
      logLine += " :: [unserializable payload]";
    }
  }

  return logLine;
}

export function createRequestLogger(options: RequestLoggerOptions = {}): RequestHandler {
  return function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const shouldLogPayload = resolvePayloadLoggingOverride(options.logPayloads);
    const isApiRoute = req.originalUrl?.startsWith("/api") ?? req.path?.startsWith("/api") ?? false;

    if (!isApiRoute) {
      return next();
    }

    const start = Date.now();

    let capturedResponse: unknown;
    let originalJson: Response["json"] | undefined;

    if (shouldLogPayload) {
      originalJson = res.json;
      res.json = function proxiedJson(body: unknown): Response {
        capturedResponse = body;
        return originalJson!.call(this, body);
      };
    }

    res.on("finish", () => {
      const duration = formatDuration(start);
      const logLine = buildLogLine(req, res, duration, capturedResponse, shouldLogPayload);
      log(logLine);
    });

    next();
  };
}

export const requestLogger = createRequestLogger();
