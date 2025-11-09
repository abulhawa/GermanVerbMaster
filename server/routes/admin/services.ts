import { and, count, eq, sql } from "drizzle-orm";
import { db, words, type Word } from "@db";
import {
  canonicalizeExamples,
  examplesEqual,
  getExampleSentence,
  getExampleTranslation,
  normalizeWordExamples,
} from "@shared";
import { mergeLegacyExampleFields, type WordUpdateInput } from "./schemas.js";

export interface WordListFilters {
  pos?: string | null;
  level?: string | null;
  approvalFilter?: boolean | undefined;
  completeFilter?: boolean | undefined;
  enrichedFilter?: boolean | undefined;
  search?: string | null;
  page: number;
  perPage: number;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface WordListResult {
  data: Array<Omit<Word, "sourcesCsv" | "sourceNotes">>;
  pagination: PaginationMeta;
}

export async function listWords(filters: WordListFilters): Promise<WordListResult> {
  const { pos, level, approvalFilter, completeFilter, enrichedFilter, search, page, perPage } = filters;

  const conditions: any[] = [];
  if (pos) {
    conditions.push(eq(words.pos, pos));
  }
  if (level) {
    conditions.push(eq(words.level, level));
  }
  if (typeof approvalFilter === "boolean") {
    conditions.push(eq(words.approved, approvalFilter));
  }
  if (typeof completeFilter === "boolean") {
    conditions.push(eq(words.complete, completeFilter));
  }
  if (search) {
    const term = `%${search}%`;
    conditions.push(sql`(lower(${words.lemma}) LIKE ${term} OR lower(${words.english}) LIKE ${term})`);
  }
  if (typeof enrichedFilter === "boolean") {
    const enrichedCondition = enrichedFilter
      ? sql.raw('"words"."enrichment_applied_at" IS NOT NULL')
      : sql.raw('"words"."enrichment_applied_at" IS NULL');
    conditions.push(enrichedCondition);
  }

  const baseQuery = conditions.length
    ? db.select().from(words).where(and(...conditions))
    : db.select().from(words);

  const countQuery = conditions.length
    ? db.select({ value: count() }).from(words).where(and(...conditions))
    : db.select({ value: count() }).from(words);

  const countResult = await countQuery;
  const total = countResult[0]?.value ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
  const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
  const offset = (safePage - 1) * perPage;

  const orderedQuery = baseQuery.orderBy(sql`lower(${words.lemma})`, sql`lower(${words.pos})`);
  const rows = await orderedQuery.limit(perPage).offset(offset);

  return {
    data: rows.map(presentWord),
    pagination: {
      page: safePage,
      perPage,
      total,
      totalPages,
    },
  };
}

export async function findWordById(id: number) {
  const word = await db.query.words.findFirst({ where: eq(words.id, id) });
  return word ? presentWord(word) : null;
}

export async function updateWordById(id: number, data: WordUpdateInput) {
  const existing = await db.query.words.findFirst({
    where: eq(words.id, id),
  });

  if (!existing) {
    return null;
  }

  const updates: Record<string, unknown> = {};

  const assign = <K extends keyof WordUpdateInput, C extends keyof Word>(key: K, column: C) => {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
      updates[column] = data[key];
    }
  };

  assign("level", "level");
  assign("english", "english");
  assign("gender", "gender");
  assign("plural", "plural");
  assign("separable", "separable");
  assign("aux", "aux");
  assign("praesensIch", "praesensIch");
  assign("praesensEr", "praesensEr");
  assign("praeteritum", "praeteritum");
  assign("partizipIi", "partizipIi");
  assign("perfekt", "perfekt");
  assign("comparative", "comparative");
  assign("superlative", "superlative");
  assign("translations", "translations");
  assign("posAttributes", "posAttributes");
  assign("enrichmentAppliedAt", "enrichmentAppliedAt");
  assign("enrichmentMethod", "enrichmentMethod");

  const existingExamples = canonicalizeExamples(existing.examples);
  let nextExamples = existingExamples;
  let examplesTouched = false;

  if (Object.prototype.hasOwnProperty.call(data, "examples") && data.examples !== undefined) {
    nextExamples = canonicalizeExamples(data.examples ?? null);
    examplesTouched = true;
  }

  const exampleDeProvided = Object.prototype.hasOwnProperty.call(data, "exampleDe");
  const exampleEnProvided = Object.prototype.hasOwnProperty.call(data, "exampleEn");

  if (exampleDeProvided || exampleEnProvided) {
    nextExamples = mergeLegacyExampleFields(nextExamples, {
      sentenceProvided: exampleDeProvided,
      sentence: exampleDeProvided ? data.exampleDe ?? null : undefined,
      englishProvided: exampleEnProvided,
      english: exampleEnProvided ? data.exampleEn ?? null : undefined,
    });
    examplesTouched = true;
  }

  if (examplesTouched) {
    if (!examplesEqual(nextExamples, existingExamples)) {
      updates.examples = nextExamples.length > 0 ? nextExamples : null;
    }
    const primarySentence = getExampleSentence(nextExamples);
    if (primarySentence !== existing.exampleDe) {
      updates.exampleDe = primarySentence ?? null;
    }
    const primaryEnglish = getExampleTranslation(nextExamples, "en");
    if (primaryEnglish !== existing.exampleEn) {
      updates.exampleEn = primaryEnglish ?? null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, "exampleDe") && data.exampleDe !== undefined) {
    updates.exampleDe = data.exampleDe ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(data, "exampleEn") && data.exampleEn !== undefined) {
    updates.exampleEn = data.exampleEn ?? null;
  }

  const approved = data.approved ?? existing.approved;
  const merged: Pick<Word, "pos"> & Partial<Word> = {
    ...existing,
    ...updates,
    approved,
  };

  const complete = computeWordCompleteness(merged);

  updates.approved = approved;
  updates.complete = complete;

  const hasContentUpdates = Object.keys(updates).some((key) =>
    !["approved", "complete", "updatedAt", "enrichmentAppliedAt", "enrichmentMethod"].includes(key),
  );

  if (hasContentUpdates && !Object.prototype.hasOwnProperty.call(updates, "enrichmentAppliedAt")) {
    updates.enrichmentAppliedAt = sql`now()`;
  }
  if (hasContentUpdates && !Object.prototype.hasOwnProperty.call(updates, "enrichmentMethod")) {
    updates.enrichmentMethod = "manual_entry";
  }
  updates.updatedAt = sql`now()`;

  await db.update(words).set(updates).where(eq(words.id, id));

  const refreshed = await db.query.words.findFirst({
    where: eq(words.id, id),
  });

  if (!refreshed) {
    throw new Error("WORD_UPDATE_FAILED");
  }

  return presentWord(refreshed);
}

function computeWordCompleteness(word: Pick<Word, "pos"> & Partial<Word>): boolean {
  const english = word.english;
  const examples = normalizeWordExamples(word.examples) ?? [];
  const hasExamplePair = examples.some((entry) => {
    if (!entry.sentence) {
      return false;
    }
    const translations = entry.translations ?? {};
    return Object.values(translations).some((value) => typeof value === "string" && value.trim().length > 0);
  });
  if (!english || !english.trim()) {
    return false;
  }
  if (!hasExamplePair) {
    return false;
  }
  switch (word.pos) {
    case "V":
      return Boolean(word.praeteritum && word.partizipIi && word.perfekt);
    case "N":
      return Boolean(word.gender && word.plural);
    case "Adj":
      return Boolean(word.comparative && word.superlative);
    default:
      return true;
  }
}

function presentWord(word: Word): Omit<Word, "sourcesCsv" | "sourceNotes"> {
  const { sourcesCsv: _sourcesCsv, sourceNotes: _sourceNotes, ...rest } = word;
  const normalizedExamples = canonicalizeExamples(rest.examples);
  const primarySentence = getExampleSentence(normalizedExamples);
  const primaryEnglish = getExampleTranslation(normalizedExamples, "en");
  return {
    ...rest,
    examples: normalizedExamples.length > 0 ? normalizedExamples : null,
    exampleDe: primarySentence ?? rest.exampleDe ?? null,
    exampleEn: primaryEnglish ?? rest.exampleEn ?? null,
  };
}
