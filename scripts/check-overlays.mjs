import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const overlayBasePath = "client/src/ui/overlay.ts";
const overlayFiles = [
  "client/src/components/ui/dropdown-menu.tsx",
  "client/src/components/ui/popover.tsx",
  "client/src/components/ui/select.tsx",
  "client/src/components/ui/dialog.tsx",
  "client/src/components/ui/drawer.tsx",
  "client/src/components/ui/tooltip.tsx",
];
const popperFiles = new Set([
  "client/src/components/ui/dropdown-menu.tsx",
  "client/src/components/ui/popover.tsx",
  "client/src/components/ui/select.tsx",
  "client/src/components/ui/tooltip.tsx",
]);

const requiredBaseTokens = [
  "z-50",
  "border border-border",
  "bg-[hsl(var(--card))]",
  "bg-white",
  "dark:bg-slate-950",
  "text-fg",
  "shadow-md",
  "outline-none",
];

const violations = [];

async function ensureOverlayBase() {
  const content = await readFile(join(rootDir, overlayBasePath), "utf8");
  for (const token of requiredBaseTokens) {
    if (!content.includes(token)) {
      violations.push(
        `${overlayBasePath} is missing required class \\"${token}\\" in overlayBase`
      );
    }
  }
}

async function ensureOverlayFiles() {
  for (const file of overlayFiles) {
    const content = await readFile(join(rootDir, file), "utf8");

    if (!content.includes("overlayClassName") && !content.includes("overlayBase")) {
      violations.push(`${file} does not reuse the shared overlay styles`);
    }

    if (/\bbg-transparent\b/.test(content)) {
      violations.push(`${file} should not set bg-transparent on overlay content`);
    }

    if (popperFiles.has(file)) {
      if (!/avoidCollisions/.test(content)) {
        violations.push(`${file} must enable avoidCollisions on overlay content`);
      }
      if (!/collisionPadding=\{8\}/.test(content)) {
        violations.push(`${file} must set collisionPadding={8}`);
      }
    }
  }
}

await Promise.all([ensureOverlayBase(), ensureOverlayFiles()]);

if (violations.length > 0) {
  console.error("\nOverlay guardrails failed:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error("\nRun the overlay normalization codemod or update overlayBase.");
  process.exit(1);
}
