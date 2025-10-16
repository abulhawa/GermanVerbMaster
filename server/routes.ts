import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { db } from "@db";
import {
  words,
  enrichmentProviderSnapshots,
  type Word,
} from "@db";
import { z } from "zod";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  canonicalizeExamples,
  examplesEqual,
  getExampleSentence,
  getExampleTranslation,
  normalizeWordExample,
  normalizeWordExamples,
} from "@shared";
import type { WordExample, WordTranslation } from "@shared";
import type {
  BulkEnrichmentResponse,
  EnrichmentPatch,
  WordEnrichmentHistory,
  WordEnrichmentPreview,
} from "@shared/enrichment";
import {
  buildProviderSnapshotFromRecord,
  computeWordEnrichment,
  resolveConfigFromEnv as resolveEnrichmentConfigFromEnv,
  runEnrichment,
  toEnrichmentPatch,
  type PipelineConfig,
} from "../scripts/enrichment/pipeline.js";
import { persistProviderSnapshotToFile } from "../scripts/enrichment/storage.js";
import { exportWordById, getExportStatus, runBulkExport } from "./export-sync.js";
import { authRouter, getSessionFromRequest } from "./auth/index.js";
import type { AuthSession } from "./auth/index.js";

const attachAuthSessionMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const session = await getSessionFromRequest(req, res);
    req.authSession = session;
    next();
  } catch (error) {
    next(error);
  }
};

function getSessionUser(session: AuthSession | null | undefined): Record<string, unknown> | null {
  if (!session?.user || typeof session.user !== "object") {
    return null;
  }
  return session.user as Record<string, unknown>;
}

function getSessionRole(session: AuthSession | null | undefined): string | null {
  const user = getSessionUser(session);
  const role = user?.role;
  return typeof role === "string" ? role : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

type Level = (typeof LEVEL_ORDER)[number];

type Nullable<T> = T | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function normaliseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normaliseStringOrNull(value: unknown): string | null {
  return normaliseString(value) ?? null;
}

function normaliseExampleRecord(example: unknown):
  | {
      de: string | null;
      en: string | null;
    }
  | undefined {
  if (!isRecord(example)) {
    return undefined;
  }

  const de = normaliseString(example.de);
  const english = normaliseString(example.en);

  if (!de && !english) {
    return undefined;
  }

  return {
    de: de ?? null,
    en: english ?? null,
  };
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
    sentence: Nullable<string>;
    englishProvided: boolean;
    english: Nullable<string>;
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

function normalizeStringParam(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const [first] = value;
    return normalizeStringParam(first);
  }
  return undefined;
}

function parseTriState(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeStringParam(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (["1", "true", "yes", "y", "ja", "only"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "nein", "non"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseLimitParam(value: unknown, fallback: number): number {
  const normalized = normalizeStringParam(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parsePageParam(value: unknown, fallback: number): number {
  const parsed = parseLimitParam(value, fallback);
  return Math.max(1, parsed);
}

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
      const upper = trimmed.toUpperCase();
      if (LEVEL_ORDER.includes(upper as Level)) {
        return upper;
      }
      return trimmed;
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

const exportBulkSchema = z
  .object({
    pos: trimmedString(10).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  })
  .partial();

const enrichmentModeSchema = z.enum(["pending", "approved", "all"]);

const enrichmentRunSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    mode: enrichmentModeSchema.optional(),
    onlyIncomplete: optionalBoolean,
    enableAi: optionalBoolean,
    allowOverwrite: optionalBoolean,
    collectSynonyms: optionalBoolean,
    collectExamples: optionalBoolean,
    collectTranslations: optionalBoolean,
    collectWiktextract: optionalBoolean,
    posFilters: z.array(z.string().min(1).max(20)).max(20).optional(),
  })
  .partial();

const enrichmentPreviewSchema = z
  .object({
    enableAi: optionalBoolean,
    allowOverwrite: optionalBoolean,
    collectSynonyms: optionalBoolean,
    collectExamples: optionalBoolean,
    collectTranslations: optionalBoolean,
    collectWiktextract: optionalBoolean,
  })
  .partial();

const enrichmentPatchSchema = z
  .object({
    english: optionalText(400),
    exampleDe: optionalText(800),
    exampleEn: optionalText(800),
    complete: optionalBoolean,
    praeteritum: optionalText(200),
    partizipIi: optionalText(200),
    perfekt: optionalText(200),
    aux: optionalAuxiliary,
    gender: optionalText(20),
    plural: optionalText(200),
    comparative: optionalText(200),
    superlative: optionalText(200),
    translations: translationRecordSchema.array().nullable().optional(),
    examples: exampleRecordSchema.array().nullable().optional(),
    posAttributes: posAttributesSchema.nullable().optional(),
    enrichmentAppliedAt: optionalTimestamp,
    enrichmentMethod: enrichmentMethodSchema.nullable().optional(),
  })
  .partial();

const enrichmentApplySchema = z
  .object({
    patch: enrichmentPatchSchema,
  })
  .strict();

function sendError(res: Response, status: number, message: string, code?: string) {
  if (code) {
    return res.status(status).json({ error: message, code });
  }
  return res.status(status).json({ error: message });
}

let adminAuthWarningLogged = false;

function requireAdminAccess(req: Request, res: Response, next: NextFunction) {
  const sessionRole = getSessionRole(req.authSession);
  if (sessionRole === "admin") {
    return next();
  }

  const expectedToken = process.env.ADMIN_API_TOKEN?.trim();
  if (expectedToken) {
    const providedToken = normalizeStringParam(req.headers["x-admin-token"])?.trim();
    if (providedToken === expectedToken) {
      return next();
    }

    return sendError(res, 401, "Invalid admin token", "ADMIN_AUTH_FAILED");
  }

  if (!adminAuthWarningLogged) {
    console.warn(
      "ADMIN_API_TOKEN is not configured; admin routes now require an authenticated Better Auth admin session.",
    );
    adminAuthWarningLogged = true;
  }

  if (!req.authSession) {
    return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  }

  return res.status(403).json({ error: "Admin privileges required", code: "FORBIDDEN" });
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

export function registerRoutes(app: Express): void {
  app.use("/api/auth", authRouter);
  app.use("/api", attachAuthSessionMiddleware);

  app.get("/api/me", async (req, res, next) => {
    try {
      const authSession = req.authSession ?? undefined;
      const activeSession = authSession?.session ?? null;
      const user = authSession?.user ?? null;

      if (!authSession || !activeSession || !user) {
        return res.status(401).json({
          error: "Not authenticated",
          code: "UNAUTHENTICATED",
        });
      }

      const resolvedRole = getSessionRole(authSession) ?? "standard";

      res.setHeader("Cache-Control", "no-store");

      const activeSessionRecord = activeSession as Record<string, any>;
      const userRecord = user as Record<string, any>;

      return res.json({
        session: {
          id: activeSessionRecord.id,
          expiresAt: activeSessionRecord.expiresAt
            ? toIsoString(activeSessionRecord.expiresAt)
            : null,
        },
        user: {
          id: userRecord.id,
          name: userRecord.name,
          email: userRecord.email,
          image: userRecord.image ?? null,
          emailVerified: Boolean(userRecord.emailVerified),
          role: resolvedRole,
          createdAt: userRecord.createdAt ? toIsoString(userRecord.createdAt) : null,
          updatedAt: userRecord.updatedAt ? toIsoString(userRecord.updatedAt) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

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

      const whereClause = conditions.length ? and(...conditions) : undefined;

      const baseQuery = whereClause ? db.select().from(words).where(whereClause) : db.select().from(words);
      const countQuery = whereClause
        ? db.select({ value: count() }).from(words).where(whereClause)
        : db.select({ value: count() }).from(words);

      const countResult = await countQuery;
      const total = countResult[0]?.value ?? 0;
      const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
      const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
      const offset = (safePage - 1) * perPage;

      const rows = await baseQuery
        .orderBy(sql`lower(${words.lemma})`, sql`lower(${words.pos})`)
        .limit(perPage)
        .offset(offset);

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

  app.patch("/api/words/:id", requireAdminAccess, async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const parsed = wordUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid word payload", "INVALID_WORD_INPUT");
      }

      const existing = await db.query.words.findFirst({ where: eq(words.id, id) });
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
      assign("exampleDe", "exampleDe");
      assign("exampleEn", "exampleEn");
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

  app.get("/api/admin/export/status", requireAdminAccess, async (_req, res) => {
    try {
      const summary = await getExportStatus();
      res.setHeader("Cache-Control", "no-store");
      res.json({
        generatedAt: new Date().toISOString(),
        ...summary,
      });
    } catch (error) {
      console.error("Failed to load export status", error);
      sendError(res, 500, "Failed to load export status", "EXPORT_STATUS_FAILED");
    }
  });

  app.post("/api/admin/export/bulk", requireAdminAccess, async (req, res) => {
    const parsed = exportBulkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, "Invalid bulk export request", "INVALID_EXPORT_REQUEST");
    }

    const { pos, limit = 250 } = parsed.data;

    try {
      const result = await runBulkExport({ pos: pos ?? null, limit, localDir: undefined });
      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      console.error("Failed to run bulk export", error);
      sendError(res, 500, "Failed to run bulk export", "EXPORT_BULK_FAILED");
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
      if (Object.prototype.hasOwnProperty.call(patch, "gender") && patch.gender !== undefined) {
        if (patch.gender !== existing.gender) {
          updates.gender = patch.gender;
          appliedFields.push("gender");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "plural") && patch.plural !== undefined) {
        if (patch.plural !== existing.plural) {
          updates.plural = patch.plural;
          appliedFields.push("plural");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "praeteritum") && patch.praeteritum !== undefined) {
        if (patch.praeteritum !== existing.praeteritum) {
          updates.praeteritum = patch.praeteritum;
          appliedFields.push("praeteritum");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "partizipIi") && patch.partizipIi !== undefined) {
        if (patch.partizipIi !== existing.partizipIi) {
          updates.partizipIi = patch.partizipIi;
          appliedFields.push("partizipIi");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "comparative") && patch.comparative !== undefined) {
        if (patch.comparative !== existing.comparative) {
          updates.comparative = patch.comparative;
          appliedFields.push("comparative");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "superlative") && patch.superlative !== undefined) {
        if (patch.superlative !== existing.superlative) {
          updates.superlative = patch.superlative;
          appliedFields.push("superlative");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "perfekt") && patch.perfekt !== undefined) {
        if (patch.perfekt !== existing.perfekt) {
          updates.perfekt = patch.perfekt;
          appliedFields.push("perfekt");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "aux") && patch.aux !== undefined) {
        if (patch.aux !== existing.aux) {
          updates.aux = patch.aux;
          appliedFields.push("aux");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "translations") && patch.translations !== undefined) {
        const nextTranslations = patch.translations ?? null;
        const existingTranslations = existing.translations ?? null;
        if (JSON.stringify(existingTranslations) !== JSON.stringify(nextTranslations)) {
          updates.translations = nextTranslations;
          appliedFields.push("translations");
          contentApplied = true;
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(patch, "posAttributes")
        && patch.posAttributes !== undefined
      ) {
        const nextPosAttributes = patch.posAttributes ?? null;
        const existingPosAttributes = existing.posAttributes ?? null;
        if (JSON.stringify(existingPosAttributes) !== JSON.stringify(nextPosAttributes)) {
          updates.posAttributes = nextPosAttributes;
          appliedFields.push("posAttributes");
          contentApplied = true;
        }
      }

      const merged: Word = {
        ...existing,
        ...updates,
      };

      const nextComplete = computeWordCompleteness(merged);
      if (nextComplete !== existing.complete) {
        updates.complete = nextComplete;
        appliedFields.push("complete");
      }

      if (!contentApplied) {
        return sendError(res, 400, "No enrichment updates to apply", "ENRICHMENT_NO_CHANGES");
      }

      if (Object.prototype.hasOwnProperty.call(patch, "enrichmentAppliedAt") && patch.enrichmentAppliedAt !== undefined) {
        if (patch.enrichmentAppliedAt !== existing.enrichmentAppliedAt) {
          updates.enrichmentAppliedAt = patch.enrichmentAppliedAt;
          appliedFields.push("enrichmentAppliedAt");
        }
      } else {
        updates.enrichmentAppliedAt = new Date();
        appliedFields.push("enrichmentAppliedAt");
      }

      if (Object.prototype.hasOwnProperty.call(patch, "enrichmentMethod") && patch.enrichmentMethod !== undefined) {
        if (patch.enrichmentMethod !== existing.enrichmentMethod) {
          updates.enrichmentMethod = patch.enrichmentMethod;
          appliedFields.push("enrichmentMethod");
        }
      } else {
        updates.enrichmentMethod = "manual_api";
        appliedFields.push("enrichmentMethod");
      }

      updates.updatedAt = sql`now()`;

      await db.update(words).set(updates).where(eq(words.id, id));

      const refreshed = await db.query.words.findFirst({ where: eq(words.id, id) });
      if (!refreshed) {
        return sendError(res, 500, "Failed to apply enrichment", "ENRICHMENT_APPLY_FAILED");
      }

      const manualPayload = {
        source: "manual_apply",
        method: (updates.enrichmentMethod as string | undefined) ?? refreshed.enrichmentMethod ?? "manual_api",
        appliedAt: refreshed.enrichmentAppliedAt ? toIsoString(refreshed.enrichmentAppliedAt) : new Date().toISOString(),
        appliedFields,
        patch,
        word: {
          id: refreshed.id,
          lemma: refreshed.lemma,
          pos: refreshed.pos,
          english: refreshed.english ?? null,
          exampleDe: refreshed.exampleDe ?? null,
          exampleEn: refreshed.exampleEn ?? null,
          translations: refreshed.translations ?? null,
          examples: refreshed.examples ?? null,
          gender: refreshed.gender ?? null,
          plural: refreshed.plural ?? null,
          praeteritum: refreshed.praeteritum ?? null,
          partizipIi: refreshed.partizipIi ?? null,
          perfekt: refreshed.perfekt ?? null,
          aux: refreshed.aux ?? null,
          comparative: refreshed.comparative ?? null,
          superlative: refreshed.superlative ?? null,
          posAttributes: refreshed.posAttributes ?? null,
          enrichmentAppliedAt: refreshed.enrichmentAppliedAt
            ? toIsoString(refreshed.enrichmentAppliedAt)
            : null,
          enrichmentMethod: refreshed.enrichmentMethod ?? null,
        },
      };

      const [manualSnapshotRecord] = await db
        .insert(enrichmentProviderSnapshots)
        .values({
          wordId: refreshed.id,
          lemma: refreshed.lemma,
          pos: refreshed.pos,
          providerId: "manual",
          providerLabel: "Manual Apply",
          status: "success",
          trigger: "apply",
          mode: "all",
          translations: refreshed.translations ?? null,
          examples: refreshed.examples ?? null,
          synonyms: null,
          englishHints: null,
          verbForms: null,
          nounForms: null,
          adjectiveForms: null,
          prepositionAttributes: null,
          rawPayload: manualPayload,
        })
        .returning();

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

  app.post("/api/admin/words/:id/save-to-files", requireAdminAccess, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
    }

    try {
      const result = await exportWordById(id);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        status: "exported",
        wordId: id,
        wroteLocal: result.wroteLocal,
        payload: result.payload,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }
      console.error("Failed to export word", error);
      sendError(res, 500, "Failed to export word", "EXPORT_WORD_FAILED");
    }
  });
}
