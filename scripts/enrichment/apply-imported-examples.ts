import { readFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { getDb, getPool } from "@db/client";
import { words } from "@db/schema";
import type { WordExample } from "@shared/types";

import { parse } from "csv-parse/sync";

type CsvRow = {
  id: string;
  lemma?: string;
  pos?: string;
  example_de?: string;
  example_en?: string;
  sentence_de?: string;
  translation_en?: string;
};

async function loadCsvRows(filePath: string): Promise<CsvRow[]> {
  const content = await readFile(filePath, "utf8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
}

function normalise(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildExample(sentence: string, english: string): WordExample {
  const trimmedSentence = sentence.trim();
  const trimmedEnglish = english.trim();
  const translations = trimmedEnglish.length ? { en: trimmedEnglish } : {};
  return {
    sentence: trimmedSentence.length ? trimmedSentence : null,
    translations: Object.keys(translations).length ? translations : null,
  };
}

async function main(): Promise<void> {
  const csvPath = path.resolve("notebooks", "imported_df.csv");
  const rows = await loadCsvRows(csvPath);
  if (!rows.length) {
    console.log("No rows found in imported_df.csv");
    return;
  }

  const db = getDb();
  const pool = getPool();

  let updated = 0;
  const failures: Array<{ id: number; reason: string }> = [];

  try {
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) {
        failures.push({ id: NaN, reason: `Invalid word id: ${row.id}` });
        continue;
      }

      const [record] = await db.select().from(words).where(eq(words.id, id)).limit(1);
      if (!record) {
        failures.push({ id, reason: "Word not found" });
        continue;
      }

      const exampleDe = normalise(row.example_de ?? (record.exampleDe ?? undefined));
      const exampleEn = normalise(row.example_en ?? (record.exampleEn ?? undefined));
      const sentenceDe = normalise(row.sentence_de);
      const translationEn = normalise(row.translation_en);

      const examples: WordExample[] = [];
      if (exampleDe.length || exampleEn.length) {
        examples.push(buildExample(exampleDe, exampleEn));
      }
      if (sentenceDe.length || translationEn.length) {
        examples.push(buildExample(sentenceDe, translationEn));
      }

      await db
        .update(words)
        .set({
          examples: examples.length ? examples : null,
          updatedAt: new Date(),
        })
        .where(eq(words.id, id));

      updated += 1;
    }
  } finally {
    await pool.end();
  }

  console.log(`Updated examples for ${updated} words from imported_df.csv`);
  if (failures.length) {
    console.warn("Failures:");
    for (const failure of failures) {
      console.warn(` - id=${Number.isNaN(failure.id) ? "?" : failure.id}: ${failure.reason}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Failed to apply imported examples", error);
  process.exitCode = 1;
});
