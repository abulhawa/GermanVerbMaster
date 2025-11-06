import { readFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { getDb, getPool } from "@db/client";
import { words } from "@db/schema";
import type { WordExample } from "@shared/types";
import { normalizeWordExamples } from "@shared/examples";

import { parse } from "csv-parse/sync";

type CsvRow = {
  id: string;
  lemma: string;
  pos: string;
  example_de: string;
  example_en: string;
  "new example": string;
  "new example translation": string;
};

async function loadCsvRows(filePath: string): Promise<CsvRow[]> {
  const buffer = await readFile(filePath);
  const text = buffer.toString("utf8");
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
  }) as CsvRow[];
  return records;
}

function upsertExample(
  existing: WordExample[] | null | undefined,
  germanSentence: string,
  englishTranslation: string,
): WordExample[] {
  const normalized = normalizeWordExamples(existing) ?? [];
  const sentenceKey = germanSentence.trim().toLowerCase();
  let target = normalized.find((entry) => entry.sentence?.trim().toLowerCase() === sentenceKey);
  if (!target) {
    target = { sentence: germanSentence.trim(), translations: null };
    normalized.push(target);
  } else if (!target.sentence && germanSentence.trim().length) {
    target.sentence = germanSentence.trim();
  }

  const translations = { ...(target.translations ?? {}) };
  translations.en = englishTranslation.trim();
  target.translations = translations;

  return normalized;
}

async function main(): Promise<void> {
  const csvPath = path.resolve("notebooks", "fix_examples.csv");
  const rows = await loadCsvRows(csvPath);
  if (!rows.length) {
    console.log("No rows found in fix_examples.csv");
    return;
  }

  const db = getDb();
  const pool = getPool();

  let updated = 0;
  const failures: Array<{ id: number; reason: string }> = [];

  try {
    for (const row of rows) {
      const wordId = Number(row.id);
      if (!Number.isFinite(wordId)) {
        failures.push({ id: NaN, reason: `Invalid word id: ${row.id}` });
        continue;
      }

      const [record] = await db.select().from(words).where(eq(words.id, wordId)).limit(1);
      if (!record) {
        failures.push({ id: wordId, reason: "Word not found" });
        continue;
      }

      const newExampleDe = (row.example_de ?? "").trim();
      const newExampleEn = (row.example_en ?? "").trim();
      const newGermanExample = (row["new example"] ?? "").trim();
      const newEnglishTranslation = (row["new example translation"] ?? "").trim();

      const updatedExamples = newGermanExample.length && newEnglishTranslation.length
        ? upsertExample(record.examples as WordExample[] | null | undefined, newGermanExample, newEnglishTranslation)
        : (record.examples as WordExample[] | null | undefined) ?? [];

      await db
        .update(words)
        .set({
          exampleDe: newExampleDe || null,
          exampleEn: newExampleEn || null,
          examples: updatedExamples.length ? updatedExamples : null,
          updatedAt: new Date(),
        })
        .where(eq(words.id, wordId));

      updated += 1;
    }
  } finally {
    await pool.end();
  }

  console.log(`Updated ${updated} words from fix_examples.csv`);
  if (failures.length) {
    console.warn("Failures:");
    for (const failure of failures) {
      console.warn(` - id=${failure.id}: ${failure.reason}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Failed to apply example fixes", error);
  process.exitCode = 1;
});
