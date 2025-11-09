import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listenMock = vi.fn(
    (_port: number, _host: string, callback?: () => void) => {
      callback?.();
    },
  );

  return {
    setupViteMock: vi.fn(),
    serveStaticMock: vi.fn(),
    requestLoggerMock: vi.fn(),
    createApiAppMock: vi.fn(() => ({
      set: vi.fn(),
      use: vi.fn(),
    })),
    createServerMock: vi.fn(() => ({
      listen: listenMock,
    })),
    listenMock,
  };
});

vi.mock("http", () => ({
  createServer: mocks.createServerMock,
  default: {
    createServer: mocks.createServerMock,
  },
}));

vi.mock("../server/api/app.js", () => ({
  createApiApp: mocks.createApiAppMock,
}));

vi.mock("../server/middleware/request-logger.js", () => ({
  requestLogger: mocks.requestLoggerMock,
}));

vi.mock("../server/serve-static.js", () => ({
  serveStatic: mocks.serveStaticMock,
}));

vi.mock("../server/vite.js", () => ({
  setupVite: mocks.setupViteMock,
}));

describe("server startup error handling", () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
    delete process.env.PORT;
  });

  test("logs errors from setupVite rejections and exits the process", async () => {
    await vi.resetModules();
    vi.clearAllMocks();
    const logger = await import("../server/logger.js");
    mocks.setupViteMock.mockReset();
    mocks.serveStaticMock.mockReset();
    mocks.requestLoggerMock.mockReset();
    mocks.createApiAppMock.mockImplementation(() => ({
      set: vi.fn(),
      use: vi.fn(),
    }));

    process.env.NODE_ENV = "development";
    const error = new Error("setup failure");
    mocks.setupViteMock.mockRejectedValueOnce(error);

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as unknown as typeof process.exit);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});

    await import("../server/index.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logErrorSpy).toHaveBeenCalledWith(error, "server-startup");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    logErrorSpy.mockRestore();
  });

  test("listens on the port defined by the PORT environment variable", async () => {
    await vi.resetModules();
    vi.clearAllMocks();
    const logger = await import("../server/logger.js");
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

    process.env.NODE_ENV = "production";
    process.env.PORT = "6543";

    await import("../server/index.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.listenMock).toHaveBeenCalledWith(6543, "0.0.0.0", expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("serving on port 6543");

    logSpy.mockRestore();
  });
});
