import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type RewriteConfig = {
  source: string;
  destination: string;
};

type FunctionConfig = {
  runtime?: string;
};

type VercelConfig = {
  buildCommand?: string;
  outputDirectory?: string;
  rewrites?: RewriteConfig[];
  functions?: Record<string, FunctionConfig>;
};

const thisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(thisDir, "..");
const vercelPath = join(repoRoot, "vercel.json");

const vercelConfig = JSON.parse(readFileSync(vercelPath, "utf8")) as VercelConfig;

describe("vercel deployment configuration", () => {
  test("api index re-exports the Vercel handler", async () => {
    vi.resetModules();

    const mockHandler = vi.fn();

    vi.doMock("../server/api/vercel-handler.ts", () => ({ handler: mockHandler }));

    try {
      const apiModule = await import("../api/index.ts");

      expect(apiModule).toHaveProperty("handler");
      expect(apiModule.handler).toBe(mockHandler);
    } finally {
      vi.doUnmock("../server/api/vercel-handler.ts");
      vi.resetModules();
    }
  });

  test("build output is configured for the Vercel adapter", () => {
    expect(vercelConfig.buildCommand).toBe("npm install && npm run build");
    expect(vercelConfig.outputDirectory).toBe("dist/public");
  });

  test("all API traffic is rewritten to the Express bridge", () => {
    const apiRewrite = vercelConfig.rewrites?.find((rewrite) => rewrite.source === "/api/(.*)");

    expect(apiRewrite, "The /api rewrite rule should exist").toBeTruthy();
    expect(apiRewrite?.destination).toBe("/api/index.ts");
  });

  test("serverless functions run on the Node.js 22 runtime", () => {
    const runtime = vercelConfig.functions?.["api/index.ts"]?.runtime;

    expect(runtime).toBe("nodejs22.x");
  });
});
