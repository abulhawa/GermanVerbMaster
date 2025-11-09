import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";

import { createApiApp } from "../server/api/app.js";
import * as logger from "../server/logger.js";

vi.mock("../server/routes.js", () => ({
  registerRoutes(app: Express) {
    app.get("/api/ping", (_req, res) => {
      res.json({ ok: true });
    });
  },
}));

async function listen(server: ReturnType<typeof createServer>): Promise<AddressInfo> {
  return await new Promise<AddressInfo>((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine server address"));
        return;
      }
      resolve(address);
    });
    server.on("error", reject);
  });
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

describe("request logger integration", () => {
  it("logs API requests exactly once", async () => {
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    const app = createApiApp({ enableCors: false });
    const server = createServer(app);
    try {
      const { port } = await listen(server);

      const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(logSpy).toHaveBeenCalledTimes(1);
      const [logLine] = logSpy.mock.calls[0] ?? [];
      expect(logLine).toContain("GET /api/ping 200");
    } finally {
      logSpy.mockRestore();
      await close(server);
    }
  });
});

