import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("favicon configuration", () => {
  it("wires a browser tab icon in client/index.html", () => {
    const indexPath = path.resolve(__dirname, "..", "client", "index.html");
    const indexHtml = readFileSync(indexPath, "utf8");

    expect(indexHtml).toContain('rel="icon"');
    expect(indexHtml).toContain('href="/favicon.png"');
  });

  it("ships the favicon asset in public/", () => {
    const faviconPath = path.resolve(__dirname, "..", "client", "public", "favicon.png");

    expect(existsSync(faviconPath)).toBe(true);
    expect(statSync(faviconPath).size).toBeGreaterThan(0);
  });
});
