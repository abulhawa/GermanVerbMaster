import type { Express, NextFunction, Request, Response } from "express";
import { db } from "@db";
import {
  words,
  enrichmentProviderSnapshots,
  type Word,
} from "@db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  canonicalizeExamples,
  examplesEqual,
  getExampleSentence,
  getExampleTranslation,
  normalizeWordExample,
  normalizeWordExamples,
  type WordExample,
  type WordTranslation,
} from "@shared";
import {
  computeWordEnrichment,
  resolveConfigFromEnv as resolveEnrichmentConfigFromEnv,
  runEnrichment,
  toEnrichmentPatch,
  buildProviderSnapshotFromRecord,
  type PipelineConfig,
} from "../scripts/enrichment/pipeline.js";
import {
  listSupabaseBucketObjects,
  clearSupabaseBucketPrefix,
  SupabaseStorageNotConfiguredError,
  syncEnrichmentDirectoryToSupabase,
  persistProviderSnapshotToFile,
} from "../scripts/enrichment/storage.js";
import { writeWordsBackupToDisk } from "../scripts/enrichment/backup.js";
import type {
  BulkEnrichmentResponse,
  EnrichmentPatch,
  WordEnrichmentHistory,
  WordEnrichmentPreview,
  SupabaseStorageListResponse,
  SupabaseStorageCleanExportResponse,
  SupabaseStorageCleanResponse,
  SupabaseStorageExportResponse,
} from "@shared/enrichment";

type WordInsert = typeof words.$inferInsert;

const enrichmentModeSchema = z.enum(["pending", "approved", "all"]);

const booleanLike = z
  .union([
    z.boolean(),
    z
      .string()
      .transform((value) => value.trim().toLowerCase())
      .transform((value) => {
        if (["true", "1", "yes", "on"].includes(value)) {
          return true;
        }
        if (["false", "0", "no", "off"].includes(value)) {
          return false;
        }
        return value;
      })
      .pipe(z.boolean()),
  ])
  .optional();

const optionalText = z.union([z.string(), z.null()]).optional();

const translationRecordSchema = z
  .object({
    value: z.string(),
    source: optionalText,
    confidence: z.number().nullable().optional(),
    language: optionalText,
  })
  .strict();

const exampleTranslationsSchema = z
  .record(z.string(), z.string())
  .nullable()
  .optional();

const exampleRecordSchema = z
  .object({
    sentence: optionalText,
    exampleDe: optionalText,
    exampleEn: optionalText,
    translations: exampleTranslationsSchema,
    source: optionalText,
  })
  .strict();

const prepositionAttributesSchema = z
  .object({
    cases: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict()
  .partial();

const posAttributesSchema = z
  .object({
    pos: optionalText,
    preposition: prepositionAttributesSchema.nullable().optional(),
    tags: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict()
  .partial();

const enrichmentRunSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    mode: enrichmentModeSchema.optional(),
    onlyIncomplete: booleanLike,
    enableAi: booleanLike,
    allowOverwrite: booleanLike,
    collectSynonyms: booleanLike,
    collectExamples: booleanLike,
    collectTranslations: booleanLike,
    collectWiktextract: booleanLike,
    posFilters: z.array(z.string()).max(20).optional(),
  })
  .partial();

const enrichmentPreviewSchema = z
  .object({
    enableAi: booleanLike,
    allowOverwrite: booleanLike,
    collectSynonyms: booleanLike,
    collectExamples: booleanLike,
    collectTranslations: booleanLike,
    collectWiktextract: booleanLike,
  })
  .partial();

const enrichmentPatchSchema = z
  .object({
    english: optionalText,
    exampleDe: optionalText,
    exampleEn: optionalText,
    complete: booleanLike,
    praeteritum: optionalText,
    partizipIi: optionalText,
    perfekt: optionalText,
    aux: optionalText,
    gender: optionalText,
    plural: optionalText,
    comparative: optionalText,
    superlative: optionalText,
    translations: translationRecordSchema.array().nullable().optional(),
    examples: exampleRecordSchema.array().nullable().optional(),
    posAttributes: posAttributesSchema.nullable().optional(),
    enrichmentAppliedAt: z.union([z.string(), z.date(), z.null()]).optional(),
    enrichmentMethod: optionalText,
  })
  .partial();

const enrichmentApplySchema = z
  .object({
    patch: enrichmentPatchSchema,
  })
  .strict();

function normalizeStringParam(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return undefined;
}

function parseTriState(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return undefined;
  }
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseLimitParam(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function parseOffsetParam(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return fallback;
}

function parsePageParam(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function cloneExample(entry: WordExample): WordExample {
  return {
    ...entry,
    translations: entry.translations ? { ...entry.translations } : null,
  };
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
  const canonical = canonicalizeExamples(examples).map((entry) => cloneExample(entry));

  const ensurePrimary = (): WordExample => {
    if (!canonical[0]) {
      canonical[0] = {
        sentence: null,
        translations: null,
      };
      return canonical[0];
    }

    const current = canonical[0];
    canonical[0] = cloneExample(current);
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

function sendError(res: Response, status: number, message: string, code?: string) {
  if (code) {
    return res.status(status).json({ error: message, code });
  }
  return res.status(status).json({ error: message });
}

let adminAuthWarningLogged = false;

function requireAdminAccess(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.ADMIN_API_TOKEN?.trim();
  if (!expectedToken) {
    if (!adminAuthWarningLogged) {
      console.warn(
        "ADMIN_API_TOKEN is not configured; admin routes are accessible without authentication.",
      );
      adminAuthWarningLogged = true;
    }
    return next();
  }

  const provided = normalizeStringParam(req.headers["x-admin-token"]);
  if (provided && provided.trim() === expectedToken) {
    return next();
  }

  return sendError(res, 401, "Invalid admin token", "ADMIN_AUTH_FAILED");
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

export function registerRoutes(app: Express): void {
  app.get("/api/words", requireAdminAccess, async (req, res) => {
    try {
      const pos = normalizeStringParam(req.query.pos)?.trim();
      const level = normalizeStringParam(req.query.level)?.trim();
      const approvalFilter = parseTriState(req.query.approved);
      const completeFilter = parseTriState(req.query.complete);
      const enrichedFilter = parseTriState(req.query.enriched);
      const search = normalizeStringParam(req.query.search)?.trim().toLowerCase();
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

  app.get("/api/words/:id", requireAdminAccess, async (req, res) => {
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

  app.get("/api/enrichment/words/:id/history", requireAdminAccess, async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const word = await db.query.words.findFirst({ where: eq(words.id, id) });
      if (!word) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      const snapshotRecords = await db
        .select()
        .from(enrichmentProviderSnapshots)
        .where(eq(enrichmentProviderSnapshots.wordId, id))
        .orderBy(desc(enrichmentProviderSnapshots.collectedAt));

      const snapshots = snapshotRecords.map((record) => buildProviderSnapshotFromRecord(record));

      const normalizeString = (value: string | null | undefined): string | null => {
        if (!value) {
          return null;
        }
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      };

      const translations = (() => {
        const map = new Map<string, WordTranslation>();
        const upsert = (entry: WordTranslation | null | undefined) => {
          if (!entry) {
            return;
          }
          const value = normalizeString(entry.value);
          if (!value) {
            return;
          }
          const source = normalizeString(entry.source ?? null);
          const language = normalizeString(entry.language ?? null);
          const confidence =
            typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
              ? entry.confidence
              : null;
          const key = `${value.toLowerCase()}::${(source ?? "").toLowerCase()}::${(language ?? "").toLowerCase()}`;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, {
              value,
              source,
              language,
              confidence,
            });
            return;
          }
          if (language && !existing.language) {
            existing.language = language;
          }
          if (
            typeof confidence === "number"
            && (existing.confidence === null || (typeof existing.confidence === "number" && confidence > existing.confidence))
          ) {
            existing.confidence = confidence;
          }
        };

        for (const entry of word.translations ?? []) {
          upsert(entry);
        }
        for (const snapshot of snapshots) {
          for (const entry of snapshot.translations ?? []) {
            upsert(entry);
          }
        }

        return Array.from(map.values()).sort((a, b) => {
          const valueCompare = a.value.localeCompare(b.value, undefined, { sensitivity: "base" });
          if (valueCompare !== 0) {
            return valueCompare;
          }
          return (a.source ?? "").localeCompare(b.source ?? "", undefined, { sensitivity: "base" });
        });
      })();

      const examples = (() => {
        const map = new Map<string, WordExample>();
        const upsert = (entry: WordExample | null | undefined) => {
          const normalized = normalizeWordExample(entry);
          if (!normalized) {
            return;
          }
          const [canonical] = canonicalizeExamples([normalized]);
          if (!canonical) {
            return;
          }
          const key = JSON.stringify([
            (canonical.sentence ?? canonical.exampleDe ?? "").trim().toLowerCase(),
            Object.entries(canonical.translations ?? {}),
          ]);
          const existing = map.get(key);
          if (!existing) {
            map.set(key, cloneExample(canonical));
            return;
          }
          if (!existing.sentence && canonical.sentence) {
            existing.sentence = canonical.sentence;
          }
          if (canonical.translations) {
            existing.translations = {
              ...(existing.translations ?? {}),
              ...canonical.translations,
            };
          }
        };

        for (const entry of word.examples ?? []) {
          upsert(entry);
        }
        for (const snapshot of snapshots) {
          for (const entry of snapshot.examples ?? []) {
            upsert(entry);
          }
        }

        return Array.from(map.values()).sort((a, b) => {
          const aLabel = a.sentence ?? "";
          const bLabel = b.sentence ?? "";
          return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
        });
      })();

      const history: WordEnrichmentHistory = {
        wordId: word.id,
        lemma: word.lemma,
        pos: word.pos,
        snapshots,
        translations,
        examples,
      };

      res.setHeader("Cache-Control", "no-store");
      res.json(history);
    } catch (error) {
      console.error("Failed to load enrichment history", error);
      sendError(res, 500, "Failed to load enrichment history", "ENRICHMENT_HISTORY_FAILED");
    }
  });

  app.post("/api/enrichment/run", requireAdminAccess, async (req, res) => {
    try {
      const parsed = enrichmentRunSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid enrichment configuration", "INVALID_ENRICHMENT_CONFIG");
      }

      const overrides: Partial<PipelineConfig> = {
        limit: parsed.data.limit,
        mode: parsed.data.mode,
        onlyIncomplete: parsed.data.onlyIncomplete,
        enableAi: parsed.data.enableAi,
        allowOverwrite: parsed.data.allowOverwrite,
        collectSynonyms: parsed.data.collectSynonyms,
        collectExamples: parsed.data.collectExamples,
        collectTranslations: parsed.data.collectTranslations,
        collectWiktextract: parsed.data.collectWiktextract,
        posFilters: parsed.data.posFilters,
        delayMs: 0,
        apply: false,
        dryRun: true,
        emitReport: false,
        backup: false,
      };

      const baseConfig = resolveEnrichmentConfigFromEnv(overrides);
      const config: PipelineConfig = {
        ...baseConfig,
        apply: false,
        dryRun: true,
        emitReport: false,
        backup: false,
        delayMs: 0,
      };

      const result = await runEnrichment(config);
      const response: BulkEnrichmentResponse = {
        scanned: result.scanned,
        updated: result.updated,
        words: result.words.map((word) => ({ ...word, applied: false })),
      };

      res.setHeader("Cache-Control", "no-store");
      res.json(response);
    } catch (error) {
      console.error("Failed to run enrichment pipeline", error);
      sendError(res, 500, "Failed to run enrichment", "ENRICHMENT_FAILED");
    }
  });

  app.post("/api/enrichment/words/:id/preview", requireAdminAccess, async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const parsed = enrichmentPreviewSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid enrichment configuration", "INVALID_ENRICHMENT_CONFIG");
      }

      const existing = await db.query.words.findFirst({ where: eq(words.id, id) });
      if (!existing) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      const overrides: Partial<PipelineConfig> = {
        limit: 1,
        mode: "all",
        onlyIncomplete: false,
        enableAi: parsed.data.enableAi,
        allowOverwrite: parsed.data.allowOverwrite,
        collectSynonyms: parsed.data.collectSynonyms,
        collectExamples: parsed.data.collectExamples,
        collectTranslations: parsed.data.collectTranslations,
        collectWiktextract: parsed.data.collectWiktextract,
        delayMs: 0,
        apply: false,
        dryRun: true,
        emitReport: false,
        backup: false,
      };

      const baseConfig = resolveEnrichmentConfigFromEnv(overrides);
      const config: PipelineConfig = {
        ...baseConfig,
        apply: false,
        dryRun: true,
        emitReport: false,
        backup: false,
        delayMs: 0,
      };

      const openAiKey = config.enableAi ? process.env.OPENAI_API_KEY?.trim() || undefined : undefined;
      const computation = await computeWordEnrichment(existing, config, openAiKey);
      const summary = { ...computation.summary, applied: false };
      const preview: WordEnrichmentPreview = {
        summary,
        patch: toEnrichmentPatch(computation.patch),
        hasUpdates: computation.hasUpdates,
        suggestions: {
          translations: computation.suggestions.translations,
          examples: computation.suggestions.examples,
          synonyms: computation.suggestions.synonyms,
          englishHints: computation.suggestions.englishHints,
          verbForms: computation.suggestions.verbForms,
          nounForms: computation.suggestions.nounForms,
          adjectiveForms: computation.suggestions.adjectiveForms,
          prepositionAttributes: computation.suggestions.prepositionAttributes,
          posLabel: computation.suggestions.posLabel,
          posTags: computation.suggestions.posTags,
          posNotes: computation.suggestions.posNotes,
          providerDiagnostics: computation.suggestions.diagnostics,
          snapshots: computation.suggestions.snapshots,
        },
      };

      res.setHeader("Cache-Control", "no-store");
      res.json(preview);
    } catch (error) {
      console.error("Failed to preview word enrichment", error);
      sendError(res, 500, "Failed to preview enrichment", "ENRICHMENT_PREVIEW_FAILED");
    }
  });

  app.post("/api/enrichment/words/:id/apply", requireAdminAccess, async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const parsed = enrichmentApplySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid enrichment payload", "INVALID_ENRICHMENT_INPUT");
      }

      const existing = await db.query.words.findFirst({ where: eq(words.id, id) });
      if (!existing) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      const patch = parsed.data.patch as EnrichmentPatch;
      const updates: Record<string, unknown> = {};
      const appliedFields: string[] = [];
      let contentApplied = false;

      if (Object.prototype.hasOwnProperty.call(patch, "english") && patch.english !== undefined) {
        if (patch.english !== existing.english) {
          updates.english = patch.english;
          appliedFields.push("english");
          contentApplied = true;
        }
      }

      const existingExamples = canonicalizeExamples(existing.examples);
      let nextExamples = existingExamples;
      let examplesTouched = false;

      if (Object.prototype.hasOwnProperty.call(patch, "examples") && patch.examples !== undefined) {
        nextExamples = canonicalizeExamples(patch.examples ?? null);
        examplesTouched = true;
      }

      const exampleDeProvided = Object.prototype.hasOwnProperty.call(patch, "exampleDe");
      const exampleEnProvided = Object.prototype.hasOwnProperty.call(patch, "exampleEn");

      if (exampleDeProvided || exampleEnProvided) {
        nextExamples = mergeLegacyExampleFields(nextExamples, {
          sentenceProvided: exampleDeProvided,
          sentence: exampleDeProvided ? patch.exampleDe ?? null : undefined,
          englishProvided: exampleEnProvided,
          english: exampleEnProvided ? patch.exampleEn ?? null : undefined,
        });
        examplesTouched = true;
      }

      if (examplesTouched) {
        if (!examplesEqual(nextExamples, existingExamples)) {
          updates.examples = nextExamples.length > 0 ? nextExamples : null;
          appliedFields.push("examples");
          contentApplied = true;
        }
        const primarySentence = getExampleSentence(nextExamples);
        if (primarySentence !== existing.exampleDe) {
          updates.exampleDe = primarySentence ?? null;
          appliedFields.push("exampleDe");
          contentApplied = true;
        }
        const primaryEnglish = getExampleTranslation(nextExamples, "en");
        if (primaryEnglish !== existing.exampleEn) {
          updates.exampleEn = primaryEnglish ?? null;
          appliedFields.push("exampleEn");
          contentApplied = true;
        }
      }

      const fields: Array<keyof EnrichmentPatch & keyof Word> = [
        "praeteritum",
        "partizipIi",
        "perfekt",
        "aux",
        "gender",
        "plural",
        "comparative",
        "superlative",
        "posAttributes",
        "translations",
        "enrichmentAppliedAt",
        "enrichmentMethod",
      ];

      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== undefined) {
          let value = patch[field as keyof EnrichmentPatch];
          if (field === "enrichmentAppliedAt") {
            if (value instanceof Date) {
              updates.enrichmentAppliedAt = value;
            } else if (typeof value === "string" && value.trim()) {
              const parsedDate = new Date(value);
              updates.enrichmentAppliedAt = Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
            } else if (value === null) {
              updates.enrichmentAppliedAt = null;
            } else {
              delete updates.enrichmentAppliedAt;
            }
            if (
              (updates.enrichmentAppliedAt instanceof Date
                && (!existing.enrichmentAppliedAt
                  || existing.enrichmentAppliedAt.getTime() !== updates.enrichmentAppliedAt.getTime()))
              || (updates.enrichmentAppliedAt === null
                && existing.enrichmentAppliedAt !== null
                && existing.enrichmentAppliedAt !== undefined)
            ) {
              appliedFields.push(field);
              contentApplied = true;
            }
            continue;
          }
          if (existing[field] !== value) {
            updates[field] = value;
            appliedFields.push(field);
            contentApplied = true;
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(patch, "complete") && patch.complete !== undefined) {
        if (existing.complete !== patch.complete) {
          updates.complete = patch.complete;
          appliedFields.push("complete");
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.json({ word: presentWord(existing), appliedFields: [] });
      }

      const enrichmentAppliedAt = (() => {
        if (contentApplied) {
          return new Date();
        }
        const pending = updates.enrichmentAppliedAt;
        if (pending instanceof Date || pending === null) {
          return pending;
        }
        if (typeof pending === "string") {
          const parsed = new Date(pending);
          return Number.isNaN(parsed.getTime()) ? existing.enrichmentAppliedAt ?? null : parsed;
        }
        return existing.enrichmentAppliedAt ?? null;
      })();

      const [updated] = await db
        .update(words)
        .set({
          ...(updates as Partial<WordInsert>),
          enrichmentAppliedAt,
          updatedAt: new Date(),
        })
        .where(eq(words.id, id))
        .returning();

      const refreshed = presentWord(updated);

      let manualSnapshotRecord: typeof enrichmentProviderSnapshots.$inferSelect | null = null;
      if (contentApplied) {
        const now = new Date();
        const snapshotInsert = {
          wordId: id,
          lemma: refreshed.lemma,
          pos: refreshed.pos,
          providerId: "manual_entry",
          providerLabel: "Manual entry",
          status: "success" as const,
          trigger: "apply" as const,
          mode: "manual" as const,
          translations: refreshed.translations,
          examples: refreshed.examples,
          collectedAt: now,
          createdAt: now,
        };
        const [snapshot] = await db
          .insert(enrichmentProviderSnapshots)
          .values(snapshotInsert)
          .returning();
        manualSnapshotRecord = snapshot ?? null;
      }

      if (manualSnapshotRecord) {
        const manualSnapshot = buildProviderSnapshotFromRecord(manualSnapshotRecord);
        await persistProviderSnapshotToFile(manualSnapshot);
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({ word: refreshed, appliedFields });
    } catch (error) {
      console.error("Failed to apply enrichment updates", error);
      sendError(res, 500, "Failed to apply enrichment", "ENRICHMENT_APPLY_FAILED");
    }
  });

  app.get("/api/enrichment/storage", requireAdminAccess, async (req, res) => {
    try {
      const limit = Math.min(parseLimitParam(req.query.limit, 50), 200);
      const offset = parseOffsetParam(req.query.offset, 0);
      const rawPath = normalizeStringParam(req.query.path)?.trim();
      const result = await listSupabaseBucketObjects({
        limit,
        offset,
        path: rawPath,
      });

      const response: SupabaseStorageListResponse = {
        available: true,
        bucket: result.config.bucket,
        prefix: result.config.pathPrefix,
        path: result.path,
        items: result.items,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
          nextOffset: result.hasMore ? result.offset + result.items.length : null,
        },
      };

      res.setHeader("Cache-Control", "no-store");
      res.json(response);
    } catch (error) {
      if (error instanceof SupabaseStorageNotConfiguredError) {
        const response: SupabaseStorageListResponse = {
          available: false,
          message: error.message,
        };
        res.setHeader("Cache-Control", "no-store");
        res.json(response);
        return;
      }
      console.error("Failed to list Supabase storage objects", error);
      sendError(res, 500, "Failed to list storage objects", "SUPABASE_LIST_FAILED");
    }
  });

  app.post("/api/enrichment/storage/clean-export", requireAdminAccess, async (req, res) => {
    try {
      const cleanResult = await clearSupabaseBucketPrefix();
      const backupResult = await writeWordsBackupToDisk();
      const latestRelativePath =
        backupResult.summary?.latestRelativePath ?? "words-latest.json";
      const syncResult = await syncEnrichmentDirectoryToSupabase(undefined, {
        includeRelativePaths: [latestRelativePath],
      });

      const prefix = syncResult.config.pathPrefix?.replace(/^\/+|\/+$/g, "") ?? null;
      const buildPath = (relative: string) =>
        prefix && prefix.length ? `${prefix}/${relative}` : relative;

      let wordsBackup = backupResult.summary;
      if (wordsBackup) {
        wordsBackup = {
          ...wordsBackup,
          objectPath: buildPath(latestRelativePath),
          latestObjectPath: buildPath(latestRelativePath),
        };
      }

      const timestamp = new Date().toISOString();

      const cleanResponse: SupabaseStorageCleanResponse = {
        bucket: cleanResult.config.bucket,
        prefix: cleanResult.config.pathPrefix,
        total: cleanResult.total,
        deleted: cleanResult.deleted,
        failed: cleanResult.failed,
        timestamp,
      };

      const exportResponse: SupabaseStorageExportResponse = {
        bucket: syncResult.config.bucket,
        prefix: syncResult.config.pathPrefix,
        totalFiles: syncResult.totalFiles,
        uploaded: syncResult.uploaded,
        failed: syncResult.failed,
        timestamp,
        wordsBackup,
      };

      const response: SupabaseStorageCleanExportResponse = {
        clean: cleanResponse,
        export: exportResponse,
      };

      res.setHeader("Cache-Control", "no-store");
      res.json(response);
    } catch (error) {
      if (error instanceof SupabaseStorageNotConfiguredError) {
        const timestamp = new Date().toISOString();
        const failure: SupabaseStorageCleanResponse["failed"] = [
          { path: "configuration", error: error.message },
        ];
        const response: SupabaseStorageCleanExportResponse = {
          clean: {
            bucket: "",
            prefix: null,
            total: 0,
            deleted: 0,
            failed: failure,
            timestamp,
          },
          export: {
            bucket: "",
            prefix: null,
            totalFiles: 0,
            uploaded: 0,
            failed: failure,
            timestamp,
          },
        };
        res.setHeader("Cache-Control", "no-store");
        res.json(response);
        return;
      }
      console.error("Failed to clean and export Supabase storage", error);
      sendError(res, 500, "Failed to clean Supabase storage", "SUPABASE_CLEAN_FAILED");
    }
  });
}
