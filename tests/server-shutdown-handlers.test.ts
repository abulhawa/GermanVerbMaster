import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let closeCallback: ((error?: Error | null) => void) | undefined;

  const listenMock = vi.fn(
    (_port: number, _host: string, callback?: () => void) => {
      callback?.();
    },
  );

  const closeMock = vi.fn((callback?: (error?: Error | null) => void) => {
    closeCallback = callback ?? (() => {});
  });

  const endMock = vi.fn<[], Promise<void>>();

  return {
    createServerMock: vi.fn(() => ({
      listen: listenMock,
      close: closeMock,
    })),
    createApiAppMock: vi.fn(() => ({
      set: vi.fn(),
      use: vi.fn(),
    })),
    serveStaticMock: vi.fn(async () => {}),
    setupViteMock: vi.fn(async () => {}),
    getPoolMock: vi.fn(() => ({
      end: endMock,
    })),
    listenMock,
    closeMock,
    endMock,
    invokeCloseCallback(error?: Error | null) {
      closeCallback?.(error ?? null);
    },
    resetMocks() {
      closeCallback = undefined;
    },
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

vi.mock("../server/serve-static.js", () => ({
  serveStatic: mocks.serveStaticMock,
}));

vi.mock("../server/vite.js", () => ({
  setupVite: mocks.setupViteMock,
}));

vi.mock("../db/client.js", () => ({
  getPool: mocks.getPoolMock,
}));

describe("server shutdown handlers", () => {
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  let onSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let logErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await vi.resetModules();
    vi.clearAllMocks();
    mocks.resetMocks();

    signalHandlers.clear();
    onSpy = vi
      .spyOn(process, "on")
      .mockImplementation(((event: NodeJS.Signals, handler: () => void) => {
        signalHandlers.set(event, handler);
        return process;
      }) as unknown as typeof process.on);

    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as unknown as typeof process.exit);

    const logger = await import("../server/logger.js");
    logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});

    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    vi.useRealTimers();
    onSpy.mockRestore();
    exitSpy.mockRestore();
    logSpy.mockRestore();
    logErrorSpy.mockRestore();
    delete process.env.NODE_ENV;
  });

  test("waits for the server and database pool before exiting", async () => {
    let resolvePool: (() => void) | undefined;

    mocks.endMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePool = resolve;
        }),
    );

    await import("../server/index.js");

    const sigtermHandler = signalHandlers.get("SIGTERM");
    expect(sigtermHandler).toBeTypeOf("function");

    sigtermHandler?.();

    expect(mocks.closeMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();

    mocks.invokeCloseCallback();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.endMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();

    resolvePool?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  test("exits with code 1 when graceful shutdown times out", async () => {
    vi.useFakeTimers();

    mocks.endMock.mockImplementation(
      () =>
        new Promise<void>(() => {
          // intentionally never resolve
        }),
    );

    await import("../server/index.js");

    const sigintHandler = signalHandlers.get("SIGINT");
    expect(sigintHandler).toBeTypeOf("function");

    sigintHandler?.();

    expect(mocks.closeMock).toHaveBeenCalledTimes(1);
    mocks.invokeCloseCallback();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logErrorSpy).toHaveBeenCalledWith(expect.any(Error), "server-shutdown");

    vi.useRealTimers();
  });
});
