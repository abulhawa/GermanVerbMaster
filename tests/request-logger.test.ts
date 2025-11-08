import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { EventEmitter } from "node:events";

import { createRequestLogger } from "../server/middleware/request-logger.js";
import * as config from "../server/config.js";
import * as logger from "../server/logger.js";

class MockResponse extends EventEmitter {
  statusCode = 200;
  json = vi.fn((body: unknown) => {
    this.emit("finish");
    return this as unknown as Response;
  });
}

function createRequest(): Request {
  return {
    method: "POST",
    originalUrl: "/api/test",
    path: "/api/test",
  } as Request;
}

function createResponse(): Response {
  return new MockResponse() as unknown as Response;
}

describe("request logger middleware", () => {
  const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  it("omits payload logging by default", () => {
    const payloadConfigSpy = vi
      .spyOn(config, "isRequestPayloadLoggingEnabled")
      .mockReturnValue(false);

    const requestLogger = createRequestLogger();

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn<Parameters<NextFunction>, void>();

    requestLogger(req, res, next);
    (res.json as unknown as (body: unknown) => void)({ secret: "value" });

    expect(next).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [logLine] = logSpy.mock.calls[0];
    expect(logLine).toContain("POST /api/test 200");
    expect(logLine).not.toContain("secret");

    payloadConfigSpy.mockRestore();
  });

  it("logs payloads when explicitly enabled in configuration", () => {
    const payloadConfigSpy = vi
      .spyOn(config, "isRequestPayloadLoggingEnabled")
      .mockReturnValue(true);

    const requestLogger = createRequestLogger();

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn<Parameters<NextFunction>, void>();

    requestLogger(req, res, next);
    (res.json as unknown as (body: unknown) => void)({ secret: "value" });

    expect(next).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [logLine] = logSpy.mock.calls[0];
    expect(logLine).toContain("POST /api/test 200");
    expect(logLine).toContain("secret");

    payloadConfigSpy.mockRestore();
  });

  it("does not log non-API routes", () => {
    const payloadConfigSpy = vi
      .spyOn(config, "isRequestPayloadLoggingEnabled")
      .mockReturnValue(false);

    const requestLogger = createRequestLogger();

    const req = {
      method: "GET",
      originalUrl: "/health",
      path: "/health",
    } as Request;
    const res = createResponse();
    const next = vi.fn<Parameters<NextFunction>, void>();

    requestLogger(req, res, next);
    (res.json as unknown as (body: unknown) => void)({ ok: true });

    expect(next).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    payloadConfigSpy.mockRestore();
  });
});
