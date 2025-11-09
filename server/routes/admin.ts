import { Router } from "express";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, words, type Word } from "@db";
import { runRegenerateQueuesJob } from "../jobs/regenerate-queues.js";
import {
  canonicalizeExamples,
  examplesEqual,
  getExampleSentence,
  getExampleTranslation,
  normalizeWordExamples,
  type WordExample,
} from "@shared";
import { requireAdminAccess } from "./middleware.js";
import {
  getSessionUserId,
  isRecord,
  normaliseString,
  normaliseStringOrNull,
  sendError,
} from "./shared.js";

const optionalText = (max: number) =>
  z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      }
      return value;
    }, z.union([z.string().max(max), z.null()]))
    .optional();

const trimmedString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return value;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }, z.string().min(1).max(max));

const optionalBoolean = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "y", "ja", "only"].includes(normalized)) return true;
      if (["0", "false", "no", "n", "nein", "non"].includes(normalized)) return false;
    }
    return value;
  }, z.boolean())
  .optional();

const optionalNullableBoolean = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return null;
      if (["1", "true", "yes", "y", "ja"].includes(normalized)) return true;
      if (["0", "false", "no", "n", "nein"].includes(normalized)) return false;
    }
    return value;
  }, z.union([z.boolean(), z.null()]))
  .optional();

const optionalAuxiliary = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return null;
      if (["haben", "sein"].includes(normalized)) {
        return normalized;
      }
      if (normalized.replace(/\s+/g, "") === "haben/sein") {
        return "haben / sein";
      }
    }
    return value;
  }, z.union([z.enum(["haben", "sein", "haben / sein"]), z.null()]))
  .optional();

const optionalAux = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return null;
      if (normalized === "haben" || normalized === "sein") return normalized;
      if (normalized.replace(/\s+/g, "") === "haben/sein") return "haben / sein";
    }
    return value;
  }, z.union([z.literal("haben"), z.literal("sein"), z.literal("haben / sein"), z.null()]))
  .optional();

const optionalConfidence = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, z.union([z.number(), z.null()]))
  .optional();

const translationRecordSchema = z.object({
  value: z.string().min(1).max(400),
  source: optionalText(200),
  language: optionalText(50),
  confidence: optionalConfidence,
});

const exampleTranslationsSchema = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!isRecord(value)) return null;
    const cleaned = Object.entries(value).reduce<Record<string, string>>((acc, [rawLanguage, rawValue]) => {
      if (typeof rawValue !== "string") {
        return acc;
      }
      const language = rawLanguage.trim().toLowerCase();
      const translation = rawValue.trim();
      if (!language || !translation || language.length > 20 || translation.length > 800) {
        return acc;
      }
      acc[language] = translation;
      return acc;
    }, {});
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  }, z.union([z.record(z.string().min(1).max(20), z.string().min(1).max(800)), z.null()]))
  .optional();

const exampleRecordSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || !isRecord(value)) {
      return value;
    }
    const record = value as Record<string, unknown>;
    const sentence = record.sentence ?? record.exampleDe;
    const source = record.source;
    let translations = record.translations;
    if (!translations && typeof record.exampleEn === "string") {
      translations = { en: record.exampleEn };
    }
    return {
      sentence,
      translations,
      source,
    };
  },
  z
    .object({
      sentence: optionalText(800),
      translations: exampleTranslationsSchema,
      source: optionalText(200),
    })
    .strict());

const optionalTimestamp = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (value instanceof Date) {
      return value;
    }
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }, z.union([z.date(), z.null()]))
  .optional();

const enrichmentMethodSchema = z.enum(["bulk", "manual_api", "manual_entry", "preexisting"]);

const optionalLevel = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return trimmed.toUpperCase();
    }
    return value;
  }, z.union([z.string().max(10), z.null()]))
  .optional();

const prepositionAttributesSchema = z
  .object({
    cases: z.array(trimmedString(60)).optional(),
    notes: z.array(trimmedString(200)).optional(),
  })
  .strict()
  .partial();

const posAttributesSchema = z
  .object({
    pos: optionalText(20),
    preposition: prepositionAttributesSchema.nullable().optional(),
    tags: z.array(trimmedString(100)).optional(),
    notes: z.array(trimmedString(200)).optional(),
  })
  .strict()
  .partial();

const wordUpdateSchema = z
  .object({
    level: optionalLevel,
    english: optionalText(200),
    exampleDe: optionalText(500),
    exampleEn: optionalText(500),
    gender: optionalText(20),
    plural: optionalText(200),
    separable: optionalNullableBoolean,
    aux: optionalAux,
    praesensIch: optionalText(100),
    praesensEr: optionalText(100),
    praeteritum: optionalText(100),
    partizipIi: optionalText(100),
    perfekt: optionalText(150),
    comparative: optionalText(100),
    superlative: optionalText(100),
    approved: optionalBoolean,
    translations: translationRecordSchema.array().nullable().optional(),
    examples: exampleRecordSchema.array().nullable().optional(),
    posAttributes: posAttributesSchema.nullable().optional(),
    enrichmentAppliedAt: optionalTimestamp,
    enrichmentMethod: enrichmentMethodSchema.nullable().optional(),
  })
  .strict();

function parseTriState(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "all") return undefined;
  if (["1", "true", "yes", "y", "ja", "only"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "nein", "non"].includes(normalized)) return false;
  return undefined;
}

function parseLimitParam(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parsePageParam(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function mergeLegacyExampleFields(
  examples: Array<WordExample | null | undefined> | null | undefined,
  {
    sentenceProvided,
    sentence,
    englishProvided,
    english,
  }: {
    sentenceProvided: boolean;
    sentence: string | null | undefined;
    englishProvided: boolean;
    english: string | null | undefined;
  },
): WordExample[] {
  const canonical = canonicalizeExamples(examples).map((entry) => ({
    ...entry,
    translations: entry.translations ? { ...entry.translations } : null,
  }));

  const ensurePrimary = (): WordExample => {
    if (!canonical[0]) {
      canonical[0] = {
        sentence: null,
        translations: null,
      };
      return canonical[0];
    }

    const current = canonical[0];
    canonical[0] = {
      ...current,
      translations: current.translations ? { ...current.translations } : null,
    };
    return canonical[0];
  };

  if (sentenceProvided) {
    const primary = ensurePrimary();
    primary.sentence = sentence ?? null;
  }

  if (englishProvided) {
    const primary = ensurePrimary();
    const englishValue = english ?? null;
    if (englishValue) {
      primary.translations = { ...(primary.translations ?? {}), en: englishValue };
    } else if (primary.translations) {
      const { en: _removed, ...rest } = primary.translations;
      primary.translations = Object.keys(rest).length > 0 ? rest : null;
    }
  }

  return canonicalizeExamples(canonical);
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

export function createAdminRouter(): Router {
  const router = Router();

  router.post("/jobs/regenerate-queues", requireAdminAccess, async (req, res, next) => {
    try {
      const reason = isRecord(req.body) ? normaliseString(req.body.reason) ?? null : null;
      const triggeredBy = getSessionUserId(req.authSession);

      const result = await runRegenerateQueuesJob({
        triggeredBy,
        reason,
      });

      res.json({
        status: "completed",
        job: "regenerate_queues",
        runId: result.jobRunId,
        startedAt: result.startedAt.toISOString(),
        finishedAt: result.finishedAt.toISOString(),
        durationMs: result.durationMs,
        latestTouchedAt: result.latestTouchedAt ? result.latestTouchedAt.toISOString() : null,
        stats: result.stats,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/words", requireAdminAccess, async (req, res) => {
    try {
      const pos = normaliseStringOrNull(req.query.pos)?.trim();
      const level = normaliseStringOrNull(req.query.level)?.trim();
      const approvalFilter = parseTriState(req.query.approved);
      const completeFilter = parseTriState(req.query.complete);
      const enrichedFilter = parseTriState(req.query.enriched);
      const search = normaliseString(req.query.search)?.trim().toLowerCase();
      const page = parsePageParam(req.query.page, 1);
      const perPage = Math.min(parseLimitParam(req.query.perPage, 50), 200);

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
        conditions.push(
          sql`(lower(${words.lemma}) LIKE ${term} OR lower(${words.english}) LIKE ${term})`,
        );
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

      res.setHeader("Cache-Control", "no-store");
      res.json({
        data: rows.map(presentWord),
        pagination: {
          page: safePage,
          perPage,
          total,
          totalPages,
        },
      });
    } catch (error) {
      console.error("Error fetching words:", error);
      sendError(res, 500, "Failed to fetch words", "WORDS_FETCH_FAILED");
    }
  });

  router.get("/words/:id", requireAdminAccess, async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const word = await db.query.words.findFirst({ where: eq(words.id, id) });
      if (!word) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      res.setHeader("Cache-Control", "no-store");
      res.json(presentWord(word));
    } catch (error) {
      console.error("Error fetching word", error);
      sendError(res, 500, "Failed to fetch word", "WORD_FETCH_FAILED");
    }
  });

  router.patch("/words/:id", requireAdminAccess, async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const parsed = wordUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid word payload", "INVALID_WORD_INPUT");
      }

      const existing = await db.query.words.findFirst({
        where: eq(words.id, id),
      });

      if (!existing) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      const updates: Record<string, unknown> = {};
      const data = parsed.data;

      const assign = <K extends keyof typeof data, C extends keyof Word>(key: K, column: C) => {
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
        ![
          "approved",
          "complete",
          "updatedAt",
          "enrichmentAppliedAt",
          "enrichmentMethod",
        ].includes(key),
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
        return sendError(res, 500, "Failed to update word", "WORD_UPDATE_FAILED");
      }

      res.json(presentWord(refreshed));
    } catch (error) {
      console.error("Error updating word:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, "Invalid word payload", "INVALID_WORD_INPUT");
      }
      sendError(res, 500, "Failed to update word", "WORD_UPDATE_FAILED");
    }
  });

  return router;
}
