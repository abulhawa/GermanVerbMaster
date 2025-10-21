import { eq, inArray, sql } from "drizzle-orm";

import { getDb, getPool } from "@db/client";
import { words } from "@db/schema";
import type { WordExample, WordExampleTranslations } from "@shared/examples";
import { normalizeWordExamples } from "@shared/examples";

type ExampleRow = typeof words.$inferSelect;

type ClassifiedExample = {
  type: "de" | "en" | "other";
  text: string;
};

type ExampleFixPlan = {
  wordId: number;
  lemma: string;
  pos: string | null;
  originalExample: string | null;
  germanSentences: string[];
  englishSentences: string[];
  baseExamples: WordExample[] | null;
};

function isGermanSentence(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.length) return false;

  const lower = trimmed.toLowerCase();
  if (lower.includes(" der ") || lower.includes(" die ") || lower.includes(" das ")) {
    return true;
  }

  // Treat sentences with German umlauts or ß or obvious umlaut digraphs as German.
  if (/[äöüß]/i.test(trimmed)) {
    return true;
  }

  // Quick-and-dirty detection: German verbs often end with "en" in infinitive sentences.
  const words = trimmed.split(/\s+/);
  const lastToken = words[words.length - 1]?.replace(/[.,!?;:"'()]+$/g, "");
  if (lastToken && /en$/i.test(lastToken) && /[a-zäöüß]/i.test(lastToken)) {
    return true;
  }

  return false;
}

function classifyExampleSentences(example: ExampleRow): ClassifiedExample[] {
  const sentences: ClassifiedExample[] = [];

  const existingExamples = normalizeWordExamples(example.examples) ?? [];
  for (const entry of existingExamples) {
    if (!entry?.sentence) continue;
    const type: ClassifiedExample["type"] = isGermanSentence(entry.sentence) ? "de" : "other";
    sentences.push({ type, text: entry.sentence });
    const translations = entry.translations ?? {};
    const english = translations.en;
    if (english && english.trim().length) {
      sentences.push({ type: "en", text: english.trim() });
    }
  }

  const legacyExample = example.exampleEn?.trim();
  if (legacyExample?.length) {
    const type: ClassifiedExample["type"] = isGermanSentence(legacyExample) ? "de" : "en";
    sentences.push({ type, text: legacyExample });
  }

  return sentences;
}

function buildMigratedExamples(plan: ExampleFixPlan): WordExample[] | null {
  const examples = normalizeWordExamples(plan.baseExamples) ?? [];
  const englishSentences = plan.englishSentences;
  const germanSentences = plan.germanSentences;

  const normalisedExamples = examples.slice();

  if (germanSentences.length > 0) {
    for (const german of germanSentences) {
      const existing = normalisedExamples.find((entry) => entry.sentence === german);
      if (!existing) {
        normalisedExamples.push({ sentence: german, translations: null });
      }
    }
  }

  if (englishSentences.length > 0) {
    for (const english of englishSentences) {
      const target = normalisedExamples.find((entry) => entry.sentence && isGermanSentence(entry.sentence));
      if (target) {
        const translations: WordExampleTranslations = {
          ...(target.translations ?? {}),
          en: english,
        };
        target.translations = translations;
      } else {
        normalisedExamples.push({
          sentence: english,
          translations: { en: english },
        });
      }
    }
  }

  const deduped = normalizeWordExamples(normalisedExamples);
  return deduped;
}

async function selectCandidateWords(db = getDb()): Promise<ExampleRow[]> {
  const rows = await db
    .select()
    .from(words)
    .where(
      sql`COALESCE(NULLIF(words."exampleEn", ''), '') <> '' OR jsonb_array_length(COALESCE(words.examples, '[]'::jsonb)) > 0`,
    )
    .orderBy(words.id);

  return rows;
}

async function main(): Promise<void> {
  const db = getDb();
  const pool = getPool();

  const rows = await selectCandidateWords(db);
  const plans: ExampleFixPlan[] = [];

  for (const row of rows) {
    const sentences = classifyExampleSentences(row);

    const germanSentences = sentences.filter((entry) => entry.type === "de").map((entry) => entry.text);
    const englishSentences = sentences.filter((entry) => entry.type === "en").map((entry) => entry.text);

    if (!germanSentences.length) {
      continue;
    }

    const plan: ExampleFixPlan = {
      wordId: row.id,
      lemma: row.lemma,
      pos: row.pos ?? null,
      originalExample: row.exampleEn,
      germanSentences,
      englishSentences,
      baseExamples: normalizeWordExamples(row.examples),
    };

    plans.push(plan);
  }

  if (!plans.length) {
    console.log("No examples required migration.");
    await pool.end();
    return;
  }

  const wordIds = plans.map((plan) => plan.wordId);

  console.log(`Preparing to migrate examples for ${plans.length} words.`);

  const toUpdate: Array<{ plan: ExampleFixPlan; examples: WordExample[] | null }> = [];

  for (const plan of plans) {
    const examples = buildMigratedExamples(plan);
    if (!examples || !examples.length) {
      continue;
    }
    toUpdate.push({ plan, examples });
  }

  console.log(`Applying updates to ${toUpdate.length} words.`);

  for (const { plan, examples } of toUpdate) {
    await db
      .update(words)
      .set({
        examples,
        exampleEn: null,
        updatedAt: new Date(),
      })
      .where(eq(words.id, plan.wordId));
  }

  const { rowsAffected } = await db
    .update(words)
    .set({ exampleEn: null, updatedAt: new Date() })
    .where(inArray(words.id, wordIds));

  console.log(`Cleared exampleEn for ${rowsAffected} words.`);

  await pool.end();
}

main().catch((error) => {
  console.error("Failed to fix example translations", error);
  process.exit(1);
});
