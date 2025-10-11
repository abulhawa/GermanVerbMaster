import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveConfigFromEnv, runEnrichment } from "./enrichment/pipeline";

const OUTPUT_FILE = path.resolve(
  process.cwd(),
  "data",
  "generated",
  "non-canonical-enrichment.json",
);

async function main() {
  const baseConfig = resolveConfigFromEnv({
    mode: "non-canonical",
    onlyIncomplete: false,
    apply: false,
    emitReport: false,
  });

  const result = await runEnrichment(baseConfig);

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    limit: baseConfig.limit,
    count: result.words.length,
    words: result.words.map((entry) => ({
      id: entry.id,
      lemma: entry.lemma,
      pos: entry.pos,
      translation: entry.translation?.value,
      englishHints: entry.englishHints ?? [],
      synonyms: entry.synonyms,
      exampleDe: entry.example?.exampleDe,
      exampleEn: entry.example?.exampleEn,
      sources: entry.sources,
      errors: entry.errors,
    })),
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote enrichment data for ${payload.count} words to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("Failed to complete enrichment:", error);
  process.exitCode = 1;
});
