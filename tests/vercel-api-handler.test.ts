import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { setupTestDatabase, type TestDatabaseContext } from "./helpers/pg";

describe("createVercelApiHandler", () => {
  let dbContext: TestDatabaseContext;
  let createVercelApiHandler: typeof import("../api").createVercelApiHandler;

  beforeAll(async () => {
    dbContext = await setupTestDatabase();
    dbContext.mock();
    ({ createVercelApiHandler } = await import("../api"));
  });

  afterAll(async () => {
    await dbContext.cleanup();
  });

  it("serves feature flag metadata without external dependencies", async () => {
    const handler = createVercelApiHandler({ enableCors: false });

    const server = createServer((req, res) => {
      handler(req as any, res as any).catch((error) => {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : String(error));
      });
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address() as AddressInfo | null;
      if (!address) {
        throw new Error("Expected server to have an address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/api/feature-flags`);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-feature-flags")).toMatch(/pos:verb=/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15000);
});
