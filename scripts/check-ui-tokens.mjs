import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../client/src/components", import.meta.url);
const allowedExtensions = new Set([".ts", ".tsx", ".css", ".json"]);

const checks = [
  {
    regex: /#[0-9A-Fa-f]{3,6}\b/,
    message: "hardcoded hex color",
  },
  {
    regex: /\b(?:text|bg)-(?:gray|slate|zinc|neutral|stone)-/,
    message: "Tailwind gray palette class",
  },
];

const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!allowedExtensions.has(extname(entry.name))) continue;
    const content = await readFile(fullPath, "utf8");
    for (const check of checks) {
      if (check.regex.test(content)) {
        violations.push({ file: fullPath, message: check.message });
      }
    }
  }
}

const start = fileURLToPath(ROOT);
await walk(start);

if (violations.length > 0) {
  console.error("\nUI token guard failed:\n");
  for (const violation of violations) {
    console.error(`- ${violation.file.replace(process.cwd() + "/", "")}: ${violation.message}`);
  }
  console.error("\nUse design tokens defined in globals.css instead of raw colors.");
  process.exit(1);
}
