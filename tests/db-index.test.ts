import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("db/index module", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("re-exports the server db client module", async () => {
    type ClientModule = typeof import("../server/db/client.js");

    const mockedExports: ClientModule = {
      createPool: vi.fn(),
      getPool: vi.fn(),
      createDb: vi.fn(),
      getDb: vi.fn(),
      db: Symbol("db") as unknown as ClientModule["db"],
    };

    vi.doMock("../server/db/client.js", () => mockedExports);

    const module = await import("../db/index.ts");

    expect(module.createPool).toBe(mockedExports.createPool);
    expect(module.getPool).toBe(mockedExports.getPool);
    expect(module.createDb).toBe(mockedExports.createDb);
    expect(module.getDb).toBe(mockedExports.getDb);
    expect(module.db).toBe(mockedExports.db);
  });
});
