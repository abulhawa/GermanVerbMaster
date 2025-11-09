import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Router } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiApp } from "../server/api/app.js";

const queryMock = vi.fn();
const mockPool = { query: queryMock };
const getPoolMock = vi.fn(() => mockPool);

vi.mock("../db/client.js", () => ({
  getPool: getPoolMock,
}));

function createEmptyRouter(): ReturnType<typeof Router> {
  const router = Router();
  router.use((_req, _res, next) => {
    next();
  });
  return router;
}

vi.mock("../server/routes/auth.js", () => ({
  createAuthRouter: createEmptyRouter,
}));

vi.mock("../server/routes/tasks.js", () => ({
  createTaskRouter: createEmptyRouter,
}));

vi.mock("../server/routes/practice-history.js", () => ({
  createPracticeHistoryRouter: createEmptyRouter,
}));

vi.mock("../server/routes/admin.js", () => ({
  createAdminRouter: createEmptyRouter,
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

afterEach(() => {
  queryMock.mockReset();
  getPoolMock.mockReset();
  getPoolMock.mockReturnValue(mockPool);
});

describe("health endpoints", () => {
  it("responds with 200 OK for /healthz", async () => {
    const app = createApiApp({ enableCors: false });
    const server = createServer(app);

    try {
      const { port } = await listen(server);

      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
      expect(getPoolMock).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });

  it("responds with 200 OK for /readyz when the database is reachable", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApiApp({ enableCors: false });
    const server = createServer(app);

    try {
      const { port } = await listen(server);

      const response = await fetch(`http://127.0.0.1:${port}/readyz`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ready" });
      expect(queryMock).toHaveBeenCalledWith("select 1");
    } finally {
      await close(server);
    }
  });

  it("propagates database errors from /readyz", async () => {
    const error = new Error("database offline");
    queryMock.mockRejectedValueOnce(error);

    const app = createApiApp({ enableCors: false });
    const server = createServer(app);

    try {
      const { port } = await listen(server);

      const response = await fetch(`http://127.0.0.1:${port}/readyz`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Database not ready" });
    } finally {
      await close(server);
    }
  });
});

