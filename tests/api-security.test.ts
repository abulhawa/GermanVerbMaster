import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApp } from "../server/api/app.js";

vi.mock("../server/routes.js", () => ({
  registerRoutes(app: Express) {
    app.get("/api/security", (_req, res) => {
      res.cookie("session", "value", {
        httpOnly: true,
        sameSite: "none",
        secure: true,
      });
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

describe("API security middleware", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("applies hardened security headers", async () => {
    const app = createApiApp({ enableCors: false });
    const server = createServer(app);
    try {
      const { port } = await listen(server);

      const response = await fetch(`http://127.0.0.1:${port}/api/security`);

      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=63072000; includeSubDomains; preload",
      );
      expect(response.headers.get("x-frame-options")).toBe("DENY");

      const csp = response.headers.get("content-security-policy");
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    } finally {
      await close(server);
    }
  });

  it("respects secure cookies when requests arrive through a proxy", async () => {
    const app = createApiApp({ enableCors: false });
    const server = createServer(app);
    try {
      const { port } = await listen(server);

      const response = await fetch(`http://127.0.0.1:${port}/api/security`, {
        headers: { "X-Forwarded-Proto": "https" },
      });

      const cookies = (response.headers as unknown as { getSetCookie?: () => string[] | undefined }).getSetCookie?.();
      expect(cookies && cookies.length).toBeGreaterThan(0);
      expect(cookies?.[0]).toContain("Secure");
    } finally {
      await close(server);
    }
  });
});

