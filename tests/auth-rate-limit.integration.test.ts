import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApp } from "../server/api/app.js";

const registerRoutesMock = vi.hoisted(() => vi.fn());

vi.mock("../server/routes.js", () => ({
  registerRoutes: registerRoutesMock,
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

describe("authentication rate limiting", () => {
  let originalMax: string | undefined;
  let originalWindow: string | undefined;

  beforeEach(() => {
    originalMax = process.env.AUTH_RATE_LIMIT_MAX;
    originalWindow = process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    process.env.AUTH_RATE_LIMIT_MAX = "2";
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = "1000";

    registerRoutesMock.mockImplementation((app: Express) => {
      app.post("/api/auth/sign-in", (_req, res) => {
        res.status(200).json({ ok: true });
      });

      app.post("/api/auth/password/reset", (_req, res) => {
        res.status(200).json({ ok: true });
      });
    });
  });

  afterEach(() => {
    process.env.AUTH_RATE_LIMIT_MAX = originalMax;
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = originalWindow;
    registerRoutesMock.mockReset();
  });

  it("eventually responds with 429 for repeated /api/auth/sign-in attempts", async () => {
    const app = createApiApp({ enableCors: false });
    const server = createServer(app);

    try {
      const { port } = await listen(server);
      const target = `http://127.0.0.1:${port}/api/auth/sign-in`;

      for (let index = 0; index < 2; index += 1) {
        const response = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "user@example.com", password: "secret" }),
        });
        expect(response.status).toBe(200);
        await response.json();
      }

      const limitedResponse = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "secret" }),
      });

      expect(limitedResponse.status).toBe(429);
      expect(await limitedResponse.json()).toEqual({
        error: "Too many authentication attempts. Please try again later.",
      });
    } finally {
      await close(server);
    }
  });

  it("eventually responds with 429 for repeated password reset attempts", async () => {
    const app = createApiApp({ enableCors: false });
    const server = createServer(app);

    try {
      const { port } = await listen(server);
      const target = `http://127.0.0.1:${port}/api/auth/password/reset`;

      for (let index = 0; index < 2; index += 1) {
        const response = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "user@example.com" }),
        });
        expect(response.status).toBe(200);
        await response.json();
      }

      const limitedResponse = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });

      expect(limitedResponse.status).toBe(429);
      expect(await limitedResponse.json()).toEqual({
        error: "Too many authentication attempts. Please try again later.",
      });
    } finally {
      await close(server);
    }
  });
});
