import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("db/index module", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("re-exports the db client module", async () => {
    type ClientModule = typeof import("@db/client");

    const mockedExports: ClientModule = {
      createPool: vi.fn(),
      getPool: vi.fn(),
      createDb: vi.fn(),
      getDb: vi.fn(),
      db: Symbol("db") as unknown as ClientModule["db"],
    };

    vi.doMock("@db/client", () => mockedExports);

    const module = await import("@db");

    expect(module.createPool).toBe(mockedExports.createPool);
    expect(module.getPool).toBe(mockedExports.getPool);
    expect(module.createDb).toBe(mockedExports.createDb);
    expect(module.getDb).toBe(mockedExports.getDb);
    expect(module.db).toBe(mockedExports.db);
  });
});
