import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { db, getPool } from "@db";
import {
  words,
  integrationPartners,
  integrationUsage,
  taskSpecs,
  lexemes,
  contentPacks,
  packLexemeMap,
  schedulingState,
  practiceHistory,
  enrichmentProviderSnapshots,
  type IntegrationPartner,
  type Word,
} from "@db";
import { z } from "zod";
import { and, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type {
  AnswerHistoryLexemeSnapshot,
  CEFRLevel,
  GermanVerb,
  PracticeResult,
  TaskAnswerHistoryItem,
  WordExample,
  WordTranslation,
} from "@shared";
import {
  getExampleSentence,
  getExampleTranslation,
  canonicalizeExamples,
  examplesEqual,
  normalizeWordExample,
  normalizeWordExamples,
} from "@shared";
import type { LexemePos, TaskType } from "@shared";
import { posPrimarySourceId } from "@shared/source-ids";
import { getTaskRegistryEntry, taskRegistry } from "./tasks/registry.js";
import { processTaskSubmission } from "./tasks/scheduler.js";
import { exportWordById, getExportStatus, runBulkExport } from "./export-sync.js";
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
  SupabaseStorageCleanExportResponse,
  SupabaseStorageCleanResponse,
  SupabaseStorageExportResponse,
  SupabaseStorageListResponse,
} from "@shared/enrichment";
import {
  asLexemePos,
  ensurePosFeatureEnabled,
  formatFeatureFlagHeader,
  getFeatureFlagSnapshot,
  isPosFeatureEnabled,
  notifyPosFeatureBlocked,
  PosFeatureDisabledError,
  summarizeFeatureFlagSnapshot,
} from "./feature-flags.js";
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

function getSessionUserId(session: AuthSession | null | undefined): string | null {
  const user = getSessionUser(session);
  const id = user?.id;
  if (typeof id === "string") {
    const trimmed = id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof id === "number") {
    return Number.isFinite(id) ? String(id) : null;
  }

  return null;
}

function getSessionRole(session: AuthSession | null | undefined): string | null {
  const user = getSessionUser(session);
  const role = user?.role;
  return typeof role === "string" ? role : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

const levelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
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

function normaliseLexemeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const base: Record<string, unknown> = { ...metadata };
  const rawExample = isRecord(base.example) ? base.example : null;

  if (rawExample) {
    const example = normaliseExampleRecord(rawExample);
    if (example) {
      base.example = example;
    } else {
      delete base.example;
    }
  }

  return base;
}

function normaliseStringOrNull(value: unknown): string | null {
  return normaliseString(value) ?? null;
}

function extractPackSlugFromTaskId(taskId: string | null): string | null {
  if (!taskId) {
    return null;
  }

  const trimmed = taskId.trim();
  if (!trimmed) {
    return null;
  }

  const match = /^pack:([a-z0-9-]+):/i.exec(trimmed);
  if (!match) {
    return null;
  }

  return match[1]?.toLowerCase() ?? null;
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
        source: null,
        exampleDe: null,
        exampleEn: null,
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
    primary.exampleDe = sentence ?? null;
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
    primary.exampleEn = englishValue;
  }

  return canonicalizeExamples(canonical);
}

function normaliseTaskPrompt(prompt: unknown): Record<string, unknown> {
  if (!isRecord(prompt)) {
    return {};
  }

  const base: Record<string, unknown> = { ...prompt };
  const rawExample = isRecord(base.example) ? base.example : null;
  if (rawExample) {
    const example = normaliseExampleRecord(rawExample);
    if (example) {
      base.example = example;
    } else {
      delete base.example;
    }
  }

  return base;
}

function normaliseCefrLevel(value: unknown): CEFRLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const upper = value.toUpperCase();
  return LEVEL_ORDER.includes(upper as (typeof LEVEL_ORDER)[number]) ? (upper as CEFRLevel) : undefined;
}

function normaliseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildLexemeSnapshotFromRow(
  row: Pick<PracticeHistoryRow, "lexemeId" | "lexemeLemma" | "pos" | "lexemeMetadata" | "cefrLevel">,
): AnswerHistoryLexemeSnapshot {
  const metadata = normaliseLexemeMetadata(row.lexemeMetadata) ?? {};
  const exampleMeta = isRecord(metadata.example) ? metadata.example : null;
  const level = normaliseCefrLevel(row.cefrLevel ?? metadata.level);
  const english = normaliseString(metadata.english);
  const normalizedExample = exampleMeta
    ? normalizeWordExample({
        sentence: typeof exampleMeta.sentence === "string" ? exampleMeta.sentence : undefined,
        translations: isRecord(exampleMeta.translations)
          ? Object.fromEntries(
              Object.entries(exampleMeta.translations).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
            )
          : undefined,
        exampleDe: typeof exampleMeta.de === "string" ? exampleMeta.de : undefined,
        exampleEn: typeof exampleMeta.en === "string" ? exampleMeta.en : undefined,
      })
    : null;
  const auxiliary = normaliseString(metadata.auxiliary);
  const allowedAuxiliaries = new Set(["haben", "sein", "haben / sein"]);

  return {
    id: row.lexemeId,
    lemma: row.lexemeLemma ?? row.lexemeId,
    pos: row.pos as LexemePos,
    level,
    english: english ?? undefined,
    example:
      normalizedExample && (normalizedExample.sentence || normalizedExample.translations?.en)
        ? {
            de: normalizedExample.sentence ?? undefined,
            en: normalizedExample.translations?.en ?? undefined,
          }
        : undefined,
    auxiliary: auxiliary && allowedAuxiliaries.has(auxiliary) ? (auxiliary as AnswerHistoryLexemeSnapshot["auxiliary"]) : undefined,
  } satisfies AnswerHistoryLexemeSnapshot;
}

type PracticeHistoryRow = {
  id: number;
  taskId: string;
  lexemeId: string;
  pos: string;
  taskType: string;
  renderer: string;
  result: PracticeResult;
  responseMs: number;
  submittedAt: Date;
  answeredAt: Date | null;
  cefrLevel: string | null;
  packId: string | null;
  metadata: Record<string, unknown> | null;
  lexemeLemma: string | null;
  lexemeMetadata: Record<string, unknown> | null;
};

function toAnswerHistoryItem(row: PracticeHistoryRow): TaskAnswerHistoryItem {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const submittedResponse = metadata.submittedResponse ?? null;
  const expectedResponse = metadata.expectedResponse ?? null;
  const lexemeSnapshot = buildLexemeSnapshotFromRow(row);
  const answeredAt = row.answeredAt ?? row.submittedAt;
  const promptSummary = normaliseString(metadata.promptSummary)
    ?? `${lexemeSnapshot.lemma} – ${row.taskType.replace(/[_-]+/g, " ")}`;
  const attemptedAnswer = normaliseString(submittedResponse);
  const correctAnswer = normaliseString(expectedResponse);
  const cefrLevel = normaliseCefrLevel(row.cefrLevel ?? lexemeSnapshot.level);

  return {
    id: `practice_history:${row.id}`,
    taskId: row.taskId,
    lexemeId: row.lexemeId,
    taskType: row.taskType as TaskType,
    pos: row.pos as LexemePos,
    renderer: row.renderer,
    result: row.result,
    submittedResponse,
    expectedResponse,
    promptSummary,
    answeredAt: answeredAt.toISOString(),
    timeSpentMs: row.responseMs,
    timeSpent: row.responseMs,
    cefrLevel,
    packId: row.packId ?? null,
    mode: undefined,
    attemptedAnswer,
    correctAnswer,
    prompt: promptSummary,
    level: cefrLevel,
    lexeme: lexemeSnapshot,
    verb: undefined,
    legacyVerb: undefined,
  } satisfies TaskAnswerHistoryItem;
}

const taskQuerySchema = z.object({
  pos: z
    .string()
    .trim()
    .optional(),
  taskType: z
    .string()
    .trim()
    .optional(),
  pack: z
    .string()
    .trim()
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  deviceId: z
    .string()
    .trim()
    .min(6)
    .max(64)
    .optional(),
  level: levelSchema.optional(),
});

type SubmissionFeatureFlagSummary = Record<string, { enabled: boolean; stage?: string; defaultValue?: boolean }>;

const practiceHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  result: z.enum(["correct", "incorrect"]).optional(),
  level: levelSchema.optional(),
  deviceId: z
    .string()
    .trim()
    .min(6)
    .max(64)
    .optional(),
});

const clearPracticeHistorySchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(6)
    .max(64)
    .optional(),
});

type TaskRow = {
  taskId: string;
  taskType: string;
  renderer: string;
  pos: string;
  prompt: unknown;
  solution: unknown;
  lexemeId: string;
  lexemeLemma: string | null;
  lexemeMetadata: Record<string, unknown> | null;
  packId: string | null;
  packSlug: string | null;
  packName: string | null;
};

function getRowValue<T>(row: Record<string, any>, ...keys: string[]): T | undefined {
  const candidates: string[] = [];

  for (const key of keys) {
    candidates.push(key);

    if (!key.includes("_")) {
      const snakeCase = key
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase();
      if (snakeCase !== key) {
        candidates.push(snakeCase);
      }
    } else {
      const camelCase = key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
      if (camelCase !== key) {
        candidates.push(camelCase);
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate in row && row[candidate] !== undefined) {
      return row[candidate] as T;
    }
  }

  return undefined;
}

function mapTaskRow(row: Record<string, any>): TaskRow {
  return {
    taskId: getRowValue<string>(row, "taskId", "id")!,
    taskType: getRowValue<string>(row, "taskType", "task_type")!,
    renderer: getRowValue<string>(row, "renderer")!,
    pos: getRowValue<string>(row, "pos")!,
    prompt: getRowValue<unknown>(row, "prompt"),
    solution: getRowValue<unknown>(row, "solution"),
    lexemeId: getRowValue<string>(row, "lexemeId", "lexeme_id")!,
    lexemeLemma:
      getRowValue<string | null>(row, "lexemeLemma", "lexeme_lemma", "lemma") ?? null,
    lexemeMetadata:
      getRowValue<Record<string, unknown> | null>(
        row,
        "lexemeMetadata",
        "lexeme_metadata",
        "metadata",
      ) ?? null,
    packId: getRowValue<string | null>(row, "packId", "pack_id", "id1") ?? null,
    packSlug: getRowValue<string | null>(row, "packSlug", "pack_slug", "slug") ?? null,
    packName: getRowValue<string | null>(row, "packName", "pack_name", "name") ?? null,
  };
}

async function executeSelectRaw<T>(builder: { toSQL: () => { sql: string; params: unknown[] } }): Promise<T[]> {
  const compiled = builder.toSQL();
  const result = await getPool().query(compiled.sql, compiled.params);
  return result.rows as T[];
}

const submissionSchema = z
  .object({
    taskId: z.string().min(1),
    lexemeId: z.string().min(1),
    taskType: z.string().min(1),
    pos: z.string().min(1),
    renderer: z.string().min(1),
    deviceId: z.string().min(1),
    result: z.enum(["correct", "incorrect"]),
    responseMs: z.coerce.number().int().min(0).max(600000).optional(),
    timeSpentMs: z.coerce.number().int().min(0).max(600000).optional(),
    submittedResponse: z.unknown().optional(),
    expectedResponse: z.unknown().optional(),
    answer: z.string().trim().optional(),
    answeredAt: z.string().datetime().optional(),
    submittedAt: z.string().datetime().optional(),
    queuedAt: z.string().datetime().optional(),
    cefrLevel: z.string().trim().min(1).optional(),
    packId: z.string().trim().nullable().optional(),
    promptSummary: z.string().trim().optional(),
    legacyVerb: z
      .object({
        infinitive: z.string().trim().min(1),
        mode: z.string().trim().min(1),
        level: z.string().trim().optional(),
        attemptedAnswer: z.string().trim().optional(),
      })
      .optional(),
    hintsUsed: z.boolean().optional(),
    featureFlags: z
      .record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          stage: z.string().optional(),
          defaultValue: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.responseMs === undefined && value.timeSpentMs === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "responseMs or timeSpentMs is required",
        path: ["responseMs"],
      });
    }
  });

declare global {
  namespace Express {
    interface Request {
      partner?: IntegrationPartner;
      partnerRequestId?: string;
    }
  }
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
      if (LEVEL_ORDER.includes(upper as typeof LEVEL_ORDER[number])) {
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

const PARTNER_KEY_HEADER = "x-partner-key";
const PARTNER_DRILL_LIMIT = 100;

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
  if (!normalized || normalized === "all") return undefined;
  if (["1", "true", "yes", "y", "ja", "only"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "nein", "non"].includes(normalized)) return false;
  return undefined;
}

function parseRandomFlag(value: unknown): boolean {
  if (value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}

function parseLimitParam(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseOffsetParam(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
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

function normaliseTaskPosFilter(value: string): LexemePos | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["verb", "verbs", "v"].includes(normalized)) return "verb";
  if (["noun", "nouns", "n"].includes(normalized)) return "noun";
  if (["adjective", "adjectives", "adj"].includes(normalized)) return "adjective";
  return null;
}

function parseTaskTypeFilter(value: string): TaskType | null {
  const key = value.trim();
  if (!key) return null;
  return key in taskRegistry ? (key as TaskType) : null;
}

interface SchedulingStateSnapshot {
  taskId: string;
  priorityScore: number | null;
  dueAt: Date | null;
  lastResult: PracticeResult | null;
  totalAttempts: number;
  correctAttempts: number;
}

function stableDeterministicNoise(value: string | null | undefined): number {
  const input = typeof value === "string" ? value : value == null ? "" : String(value);

  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function computeFallbackPriorityScore(
  snapshot: SchedulingStateSnapshot | undefined,
  taskId: string,
  nowMs: number,
): number {
  const noise = stableDeterministicNoise(taskId) * 0.05;

  if (!snapshot) {
    return 1.25 + noise;
  }

  const baseScore = typeof snapshot.priorityScore === "number" && Number.isFinite(snapshot.priorityScore)
    ? snapshot.priorityScore
    : 0;

  const totalAttempts = Math.max(snapshot.totalAttempts ?? 0, 0);
  const correctAttempts = Math.max(Math.min(snapshot.correctAttempts ?? 0, totalAttempts), 0);
  const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;
  const accuracyPenalty = (1 - Math.min(Math.max(accuracy, 0), 1)) * 0.5;
  const incorrectBonus = snapshot.lastResult === "incorrect" ? 0.75 : 0;

  let dueBonus = 0.3;
  if (snapshot.dueAt instanceof Date && !Number.isNaN(snapshot.dueAt.getTime())) {
    const diffMs = snapshot.dueAt.getTime() - nowMs;
    if (diffMs <= 0) {
      dueBonus = 0.6;
    } else {
      const hours = diffMs / 3_600_000;
      const urgency = Math.max(0, 1 - Math.min(hours, 72) / 72);
      dueBonus = urgency * 0.4;
    }
  }

  return baseScore + accuracyPenalty + incorrectBonus + dueBonus + noise;
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

function normaliseAuxiliaryValue(aux: string | null | undefined): 'haben' | 'sein' | 'haben / sein' {
  if (!aux) {
    return 'haben';
  }
  const trimmed = aux.trim().toLowerCase();
  if (trimmed === 'sein') {
    return 'sein';
  }
  if (trimmed.replace(/\s+/g, '') === 'haben/sein') {
    return 'haben / sein';
  }
  return 'haben';
}

function toGermanVerb(word: Word): GermanVerb {
  const english = word.english ?? "";
  const prateritum = word.praeteritum ?? "";
  const partizip = word.partizipIi ?? "";
  const auxiliary = normaliseAuxiliaryValue(word.aux);
  const level = LEVEL_ORDER.includes((word.level ?? "A1") as typeof LEVEL_ORDER[number])
    ? (word.level as GermanVerb["level"])
    : "A1";
  const sourceName = posPrimarySourceId(word.pos);
  const levelReference = word.level || "N/A";

  return {
    infinitive: word.lemma,
    english,
    präteritum: prateritum,
    partizipII: partizip,
    auxiliary,
    level,
    präteritumExample: getExampleSentence(word.examples) ?? "",
    partizipIIExample: getExampleTranslation(word.examples, "en") ?? "",
    source: {
      name: sourceName,
      levelReference,
    },
    pattern: null,
  };
}

async function authenticatePartner(req: Request, res: Response, next: NextFunction) {
  const apiKey = normalizeStringParam(req.headers[PARTNER_KEY_HEADER]) ?? normalizeStringParam((req as any).query?.apiKey);

  if (!apiKey) {
    return sendError(res, 401, "Missing partner API key", "MISSING_PARTNER_KEY");
  }

  try {
    const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");
    const partner = await db.query.integrationPartners.findFirst({
      where: eq(integrationPartners.apiKeyHash, apiKeyHash),
    });

    if (!partner) {
      return sendError(res, 401, "Invalid partner API key", "INVALID_PARTNER_KEY");
    }

    let allowedOrigins: string[] | null = null;
    if (Array.isArray(partner.allowedOrigins)) {
      allowedOrigins = partner.allowedOrigins.filter((origin): origin is string => typeof origin === "string");
    } else if (typeof partner.allowedOrigins === "string") {
      try {
        const parsed = JSON.parse(partner.allowedOrigins);
        if (Array.isArray(parsed)) {
          allowedOrigins = parsed.filter((origin): origin is string => typeof origin === "string");
        }
      } catch (error) {
        console.warn("Unable to parse allowedOrigins JSON for partner", partner.id, error);
      }
    }

    const requestOrigin = normalizeStringParam(req.headers.origin ?? req.query.origin ?? req.query.embedOrigin);

    if (allowedOrigins && allowedOrigins.length > 0 && requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      return sendError(res, 403, "Origin is not allowed for this partner", "PARTNER_ORIGIN_BLOCKED");
    }

    const requestId = randomUUID();
    req.partner = partner;
    req.partnerRequestId = requestId;
    res.setHeader("X-Partner-Request", requestId);

    const startedAt = Date.now();
    const userAgentHeader = req.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    res.on("finish", () => {
      db.insert(integrationUsage)
        .values({
          partnerId: partner.id,
          endpoint: req.originalUrl.split("?")[0] ?? req.path,
          method: req.method,
          statusCode: res.statusCode,
          requestId,
          responseTimeMs: Date.now() - startedAt,
          userAgent: userAgent ?? undefined,
        })
        .catch((error) => {
          console.error("Failed to log partner usage", error);
        });
    });

    return next();
  } catch (error) {
    console.error("Partner authentication failed:", error);
    return sendError(res, 500, "Partner authentication failed", "PARTNER_AUTH_FAILED");
  }
}

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
      "ADMIN_API_TOKEN is not configured; admin routes now require an authenticated Better Auth admin session."
    );
    adminAuthWarningLogged = true;
  }

  if (!req.authSession) {
    return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  }

  return res.status(403).json({ error: "Admin privileges required", code: "FORBIDDEN" });
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

  app.get("/api/tasks", async (req, res, next) => {
    const parsed = taskQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid task query",
        code: "INVALID_TASK_QUERY",
        details: parsed.error.flatten(),
      });
    }

    try {
      const { pos, taskType, pack, limit, deviceId, level } = parsed.data;
      const filters: Array<ReturnType<typeof eq>> = [];
      let normalisedPos: LexemePos | null = null;

      const snapshot = getFeatureFlagSnapshot();
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Feature-Flags", formatFeatureFlagHeader(snapshot));

      if (pos) {
        normalisedPos = normaliseTaskPosFilter(pos);
        if (!normalisedPos) {
          return res.status(400).json({
            error: `Unsupported part-of-speech filter: ${pos}`,
            code: "INVALID_POS_FILTER",
          });
        }
        try {
          ensurePosFeatureEnabled(normalisedPos, "tasks:list:filter", snapshot, {
            filter: pos,
          });
        } catch (error) {
          if (error instanceof PosFeatureDisabledError) {
            return res.status(403).json({
              error: error.message,
              code: "POS_FEATURE_DISABLED",
              pos: normalisedPos,
            });
          }
          throw error;
        }
        filters.push(eq(taskSpecs.pos, normalisedPos));
      }

      let resolvedTaskType: TaskType | null = null;
      if (taskType) {
        resolvedTaskType = parseTaskTypeFilter(taskType);
        if (!resolvedTaskType) {
          return res.status(400).json({
            error: `Unsupported task type filter: ${taskType}`,
            code: "INVALID_TASK_TYPE",
          });
        }
        filters.push(eq(taskSpecs.taskType, resolvedTaskType));
      }

      if (pack) {
        filters.push(eq(contentPacks.slug, pack));
      }

      const baseQuery = db
        .select({
          taskId: taskSpecs.id,
          taskType: taskSpecs.taskType,
          renderer: taskSpecs.renderer,
          pos: taskSpecs.pos,
          prompt: taskSpecs.prompt,
          solution: taskSpecs.solution,
          lexemeId: taskSpecs.lexemeId,
          lexemeLemma: lexemes.lemma,
          lexemeMetadata: lexemes.metadata,
          packId: contentPacks.id,
          packSlug: contentPacks.slug,
          packName: contentPacks.name,
        })
        .from(taskSpecs)
        .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id))
        .leftJoin(packLexemeMap, eq(packLexemeMap.primaryTaskId, taskSpecs.id))
        .leftJoin(contentPacks, eq(packLexemeMap.packId, contentPacks.id));

      const filteredQuery = filters.length ? baseQuery.where(and(...filters)) : baseQuery;

      const fallbackFetchLimit = limit;

      const fallbackQuery = filteredQuery.orderBy(desc(taskSpecs.updatedAt)).limit(fallbackFetchLimit);
      const fallbackRowsRaw = await executeSelectRaw<Record<string, unknown>>(fallbackQuery);
      const fallbackRows = fallbackRowsRaw.map((row) => mapTaskRow(row as Record<string, any>));

      let schedulingStateRows: SchedulingStateSnapshot[] = [];
      if (deviceId) {
        try {
          const schedulingFilters = [eq(schedulingState.deviceId, deviceId)];
          if (normalisedPos) {
            schedulingFilters.push(eq(taskSpecs.pos, normalisedPos));
          }
          if (resolvedTaskType) {
            schedulingFilters.push(eq(taskSpecs.taskType, resolvedTaskType));
          }
          const whereCondition = schedulingFilters.length === 1
            ? schedulingFilters[0]!
            : and(...schedulingFilters);

          const schedulingQuery = db
            .select({
              taskId: schedulingState.taskId,
              priorityScore: schedulingState.priorityScore,
              dueAt: schedulingState.dueAt,
              lastResult: schedulingState.lastResult,
              totalAttempts: schedulingState.totalAttempts,
              correctAttempts: schedulingState.correctAttempts,
            })
            .from(schedulingState)
            .innerJoin(taskSpecs, eq(schedulingState.taskId, taskSpecs.id))
            .where(whereCondition);

          const schedulingRowsRaw = await executeSelectRaw<Record<string, unknown>>(schedulingQuery);

          schedulingStateRows = schedulingRowsRaw.map((row) => {
            const priorityScore = getRowValue<number | null>(
              row,
              "priorityScore",
              "priority_score",
            );
            const dueAtRaw = getRowValue<string | Date | null>(row, "dueAt", "due_at") ?? null;
            const dueAt = (() => {
              if (dueAtRaw == null) {
                return null;
              }
              const parsed = dueAtRaw instanceof Date ? dueAtRaw : new Date(dueAtRaw);
              return Number.isNaN(parsed.getTime()) ? null : parsed;
            })();
            return {
              taskId: getRowValue<string>(row, "taskId", "task_id")!,
              priorityScore: priorityScore == null ? null : Number(priorityScore),
              dueAt,
              lastResult: getRowValue<PracticeResult | null>(row, "lastResult", "last_result") ?? null,
              totalAttempts: Number(
                getRowValue<number>(row, "totalAttempts", "total_attempts") ?? 0,
              ),
              correctAttempts: Number(
                getRowValue<number>(row, "correctAttempts", "correct_attempts") ?? 0,
              ),
            } satisfies SchedulingStateSnapshot;
          });
        } catch (error) {
          console.error("Failed to resolve scheduling state for /api/tasks", {
            deviceId,
            error,
          });
        }
      }

      const schedulingStateMap = new Map<string, SchedulingStateSnapshot>();
      for (const row of schedulingStateRows) {
        schedulingStateMap.set(row.taskId, row);
      }

      const schedulingSorted = [...schedulingStateRows]
        .filter((row) => row.dueAt && row.dueAt <= new Date())
        .sort((a, b) => {
          const aPriority = a.priorityScore ?? 0;
          const bPriority = b.priorityScore ?? 0;
          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }
          if (a.dueAt && b.dueAt) {
            return a.dueAt.getTime() - b.dueAt.getTime();
          }
          return 0;
        });

      const combinedRows: typeof fallbackRows = [];
      const seenTaskIds = new Set<string>();
      const taskRowById = new Map<string, TaskRow>();
      const registerRow = (row: TaskRow) => {
        if (!taskRowById.has(row.taskId)) {
          taskRowById.set(row.taskId, row);
        }
      };
      fallbackRows.forEach(registerRow);
      const pushRow = (row: TaskRow | undefined) => {
        if (!row) {
          return;
        }
        if (seenTaskIds.has(row.taskId)) {
          return;
        }
        seenTaskIds.add(row.taskId);
        combinedRows.push(row);
      };

      if (schedulingSorted.length) {
        const missingTaskIds = schedulingSorted
          .map((row) => row.taskId)
          .filter((taskId) => !taskRowById.has(taskId));

        if (missingTaskIds.length) {
          const missingTaskQuery = filters.length
            ? baseQuery.where(and(...filters, inArray(taskSpecs.id, missingTaskIds)))
            : baseQuery.where(inArray(taskSpecs.id, missingTaskIds));

          const schedulingTaskRowsRaw = await executeSelectRaw<Record<string, unknown>>(
            missingTaskQuery,
          );
          for (const rawRow of schedulingTaskRowsRaw) {
            const mapped = mapTaskRow(rawRow as Record<string, any>);
            registerRow(mapped);
          }
        }
      }

      if (schedulingSorted.length) {
        schedulingSorted.forEach((row) => {
          pushRow(taskRowById.get(row.taskId));
        });
      }

      fallbackRows.forEach((row) => {
        pushRow(taskRowById.get(row.taskId));
      });

      let orderedRows = combinedRows;
      if (deviceId) {
        const nowMs = Date.now();
        orderedRows = [...combinedRows]
          .map((row) => ({
            row,
            score: computeFallbackPriorityScore(
              schedulingStateMap.get(row.taskId),
              row.taskId,
              nowMs,
            ),
          }))
          .sort((a, b) => {
            if (a.score === b.score) {
              return a.row.taskId.localeCompare(b.row.taskId);
            }
            return b.score - a.score;
          })
          .map((entry) => entry.row);
      }

      const rows = orderedRows.slice(0, limit);

      const allowedRows: typeof rows = [];
      const blockedCounts = new Map<LexemePos, number>();

      for (const row of rows) {
        const rowPos = asLexemePos(row.pos);
        if (!rowPos) {
          allowedRows.push(row);
          continue;
        }
        if (!isPosFeatureEnabled(rowPos, snapshot)) {
          blockedCounts.set(rowPos, (blockedCounts.get(rowPos) ?? 0) + 1);
          continue;
        }
        allowedRows.push(row);
      }

      if (blockedCounts.size) {
        for (const [blockedPos, count] of blockedCounts) {
          notifyPosFeatureBlocked(blockedPos, "tasks:list:response-filter", snapshot, {
            filteredTasks: count,
            totalFetched: rows.length,
            hasExplicitPosFilter: Boolean(pos),
            taskType: resolvedTaskType,
          });
        }
      }

      const fallbackPackSlugs = new Set<string>();
      for (const row of allowedRows) {
        if (row.packId && row.packSlug && row.packName) {
          continue;
        }

        const normalisedId = normaliseString(row.taskId);
        if (!normalisedId) {
          continue;
        }

        const derivedSlug = extractPackSlugFromTaskId(normalisedId);
        if (derivedSlug) {
          fallbackPackSlugs.add(derivedSlug);
        }
      }

      let fallbackPackMap = new Map<string, { id: string; slug: string; name: string }>();
      if (fallbackPackSlugs.size) {
        const fallbackPackRows = await db
          .select({ id: contentPacks.id, slug: contentPacks.slug, name: contentPacks.name })
          .from(contentPacks)
          .where(inArray(contentPacks.slug, Array.from(fallbackPackSlugs)));

        fallbackPackMap = new Map(
          fallbackPackRows
            .map((record) => {
              const id = normaliseString(record.id);
              const slug = normaliseString(record.slug);
              const name = normaliseString(record.name);

              if (!id || !slug || !name) {
                return null;
              }

              return [slug.toLowerCase(), { id, slug, name }] as const;
            })
            .filter((entry): entry is readonly [string, { id: string; slug: string; name: string }] => Boolean(entry)),
        );
      }

      const payload: Array<{
        taskId: string;
        taskType: string;
        renderer: string;
        pos: string;
        prompt: Record<string, unknown>;
        solution?: unknown;
        queueCap: number;
        lexeme: { id: string; lemma: string; metadata: Record<string, unknown> | null };
        pack: { id: string; slug: string; name: string } | null;
      }> = [];

      for (const row of allowedRows) {
        const taskId = normaliseString(row.taskId);
        const taskTypeValue = normaliseString(row.taskType);
        const rendererValue = normaliseString(row.renderer);
        const posValue = normaliseString(row.pos);
        const lexemeId = normaliseString(row.lexemeId);
        const lexemeLemmaRaw = normaliseStringOrNull(row.lexemeLemma);

        if (!taskId || !taskTypeValue || !posValue || !lexemeId) {
          continue;
        }

        const lexemeLemma = lexemeLemmaRaw ?? lexemeId;
        if (!lexemeLemma) {
          continue;
        }

        let registryEntry: ReturnType<typeof getTaskRegistryEntry> | null = null;
        try {
          registryEntry = getTaskRegistryEntry(taskTypeValue as TaskType);
        } catch (error) {
          console.error("Failed to resolve registry entry for task", { taskType: taskTypeValue, taskId, error });
          throw error;
        }

        const prompt = normaliseTaskPrompt(row.prompt);
        const metadata = normaliseLexemeMetadata(row.lexemeMetadata) ?? null;

        const packMetadata = (() => {
          if (row.packId && row.packSlug && row.packName) {
            const packId = normaliseString(row.packId);
            const packSlug = normaliseString(row.packSlug);
            const packName = normaliseString(row.packName);
            if (packId && packSlug && packName) {
              return { id: packId, slug: packSlug, name: packName };
            }
          }

          const derivedSlug = extractPackSlugFromTaskId(taskId);
          if (!derivedSlug) {
            return null;
          }

          const fallback = fallbackPackMap.get(derivedSlug);
          return fallback ?? null;
        })();

        payload.push({
          taskId,
          taskType: taskTypeValue,
          renderer: rendererValue ?? registryEntry.renderer,
          pos: posValue,
          prompt,
          solution: row.solution ?? undefined,
          queueCap: registryEntry.queueCap,
          lexeme: {
            id: lexemeId,
            lemma: lexemeLemma,
            metadata,
          },
          pack: packMetadata,
        });
      }

      res.json({ tasks: payload });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/feature-flags", (_req, res) => {
    const snapshot = getFeatureFlagSnapshot();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Feature-Flags", formatFeatureFlagHeader(snapshot));

    const responsePayload = Object.fromEntries(
      Object.entries(snapshot.pos).map(([key, state]) => [
        key,
        {
          enabled: state.enabled,
          stage: state.stage,
          flag: state.flag ?? null,
          defaultValue: state.defaultValue,
          description: state.description,
        },
      ]),
    );

    res.json({
      fetchedAt: snapshot.fetchedAt.toISOString(),
      pos: responsePayload,
    });
  });

  app.get("/api/practice/history", async (req, res) => {
    const parsed = practiceHistoryQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid history query",
        code: "INVALID_HISTORY_QUERY",
        details: parsed.error.flatten(),
      });
    }

    const { limit, result, level, deviceId } = parsed.data;
    const sessionUserId = getSessionUserId(req.authSession);

    if (!sessionUserId && !deviceId) {
      return sendError(res, 400, "Device identifier required", "DEVICE_ID_REQUIRED");
    }

    try {
      const attributeFilters: Array<ReturnType<typeof eq>> = [];

      if (result) {
        attributeFilters.push(eq(practiceHistory.result, result));
      }

      if (level) {
        attributeFilters.push(eq(practiceHistory.cefrLevel, level));
      }

      const userFilter = sessionUserId ? eq(practiceHistory.userId, sessionUserId) : null;
      const deviceFilter = deviceId ? eq(practiceHistory.deviceId, deviceId) : null;
      const identityFilter: SQL | null =
        (userFilter && deviceFilter ? or(userFilter, deviceFilter) : userFilter ?? deviceFilter) ?? null;

      const baseQuery = db
        .select({
          id: practiceHistory.id,
          taskId: practiceHistory.taskId,
          lexemeId: practiceHistory.lexemeId,
          pos: practiceHistory.pos,
          taskType: practiceHistory.taskType,
          renderer: practiceHistory.renderer,
          result: practiceHistory.result,
          responseMs: practiceHistory.responseMs,
          submittedAt: practiceHistory.submittedAt,
          answeredAt: practiceHistory.answeredAt,
          cefrLevel: practiceHistory.cefrLevel,
          packId: practiceHistory.packId,
          metadata: practiceHistory.metadata,
          lexemeLemma: lexemes.lemma,
          lexemeMetadata: lexemes.metadata,
        })
        .from(practiceHistory)
        .innerJoin(lexemes, eq(practiceHistory.lexemeId, lexemes.id));

      let combinedFilter: SQL | null = identityFilter;

      if (attributeFilters.length === 1) {
        const singleFilter = attributeFilters[0];
        if (combinedFilter) {
          combinedFilter = and(combinedFilter, singleFilter) ?? combinedFilter;
        } else {
          combinedFilter = singleFilter;
        }
      } else if (attributeFilters.length > 1) {
        const attributesFilter = and(...attributeFilters);
        if (attributesFilter) {
          if (combinedFilter) {
            combinedFilter = and(combinedFilter, attributesFilter) ?? combinedFilter;
          } else {
            combinedFilter = attributesFilter;
          }
        }
      }

      const filteredQuery = combinedFilter ? baseQuery.where(combinedFilter) : baseQuery;

      const rows = await filteredQuery
        .orderBy(desc(practiceHistory.submittedAt), desc(practiceHistory.id))
        .limit(limit);

      const history = rows.map((row) => toAnswerHistoryItem(row as PracticeHistoryRow));
      res.setHeader("Cache-Control", "no-store");
      res.json({ history });
    } catch (error) {
      console.error("Failed to load practice history", error);
      sendError(res, 500, "Failed to load practice history", "PRACTICE_HISTORY_FAILED");
    }
  });

  app.delete("/api/practice/history", async (req, res) => {
    const parsed = clearPracticeHistorySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid clear history payload",
        code: "INVALID_HISTORY_CLEAR",
        details: parsed.error.flatten(),
      });
    }

    const { deviceId } = parsed.data;
    const sessionUserId = getSessionUserId(req.authSession);

    if (!sessionUserId && !deviceId) {
      return sendError(res, 400, "Device identifier required", "DEVICE_ID_REQUIRED");
    }

    const userFilter = sessionUserId ? eq(practiceHistory.userId, sessionUserId) : null;
    const deviceFilter = deviceId ? eq(practiceHistory.deviceId, deviceId) : null;
    const deleteFilter: SQL | null =
      (userFilter && deviceFilter ? or(userFilter, deviceFilter) : userFilter ?? deviceFilter) ?? null;

    if (!deleteFilter) {
      return sendError(res, 400, "No filters provided", "INVALID_HISTORY_CLEAR");
    }

    try {
      await db.delete(practiceHistory).where(deleteFilter);
      res.status(204).send();
    } catch (error) {
      console.error("Failed to clear practice history", error);
      sendError(res, 500, "Failed to clear practice history", "PRACTICE_HISTORY_CLEAR_FAILED");
    }
  });

  app.post("/api/submission", async (req, res) => {
    const parsed = submissionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid submission payload",
        code: "INVALID_SUBMISSION",
        details: parsed.error.flatten(),
      });
    }

    const payload = parsed.data;
    const snapshot = getFeatureFlagSnapshot();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Feature-Flags", formatFeatureFlagHeader(snapshot));

    const selectTaskRowById = async (
      taskId: string,
    ): Promise<
      | null
      | {
          taskId: string;
          taskType: string | undefined;
          pos: string | undefined;
          renderer: string | undefined;
          lexemeId: string | undefined;
          frequencyRank: number | null | undefined;
        }
    > => {
      const rows = await executeSelectRaw<Record<string, unknown>>(
        db
          .select({
            taskId: taskSpecs.id,
            taskType: taskSpecs.taskType,
            pos: taskSpecs.pos,
            renderer: taskSpecs.renderer,
            lexemeId: taskSpecs.lexemeId,
            frequencyRank: lexemes.frequencyRank,
          })
          .from(taskSpecs)
          .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id))
          .where(eq(taskSpecs.id, taskId))
          .limit(1),
      );

      if (!rows.length) {
        return null;
      }

      const raw = rows[0]!;
      return {
        taskId: getRowValue<string>(raw, "taskId", "id")!,
        taskType: getRowValue<string | undefined>(raw, "taskType", "task_type"),
        pos: getRowValue<string | undefined>(raw, "pos"),
        renderer: getRowValue<string | undefined>(raw, "renderer"),
        lexemeId: getRowValue<string | undefined>(raw, "lexemeId", "lexeme_id"),
        frequencyRank: getRowValue<number | null | undefined>(raw, "frequencyRank", "frequency_rank"),
      };
    };

    const resolveTaskIdFromPayload = async (): Promise<string | null> => {
      const packIdCandidate = (() => {
        const explicitPackId = normaliseString(payload.packId);
        if (explicitPackId) {
          return explicitPackId;
        }
        const taskIdCandidate = normaliseString(payload.taskId);
        return taskIdCandidate && taskIdCandidate.startsWith("pack:") ? taskIdCandidate : null;
      })();

      if (packIdCandidate && payload.lexemeId) {
        const fallbackRows = await executeSelectRaw<Record<string, unknown>>(
          db
            .select({ primaryTaskId: packLexemeMap.primaryTaskId })
            .from(packLexemeMap)
            .where(
              and(
                eq(packLexemeMap.packId, packIdCandidate),
                eq(packLexemeMap.lexemeId, payload.lexemeId),
              ),
            )
            .limit(1),
        );

        const fallbackId = fallbackRows.length
          ? getRowValue<string | null>(fallbackRows[0]!, "primaryTaskId", "primary_task_id")
          : null;
        const normalisedFallback = normaliseString(fallbackId);
        if (normalisedFallback) {
          return normalisedFallback;
        }
      }

      if (payload.lexemeId) {
        const fallbackRows = await executeSelectRaw<Record<string, unknown>>(
          db
            .select({ taskId: taskSpecs.id })
            .from(taskSpecs)
            .where(
              and(
                eq(taskSpecs.lexemeId, payload.lexemeId),
                eq(taskSpecs.taskType, payload.taskType),
              ),
            )
            .limit(1),
        );

        if (fallbackRows.length) {
          const fallbackId = getRowValue<string | null>(fallbackRows[0]!, "taskId", "id");
          const normalisedFallback = normaliseString(fallbackId);
          if (normalisedFallback) {
            return normalisedFallback;
          }
        }
      }

      return null;
    };

    let resolvedTaskId = normaliseString(payload.taskId);
    let taskRow = resolvedTaskId ? await selectTaskRowById(resolvedTaskId) : null;

    if (!taskRow) {
      const fallbackTaskId = await resolveTaskIdFromPayload();
      if (fallbackTaskId) {
        resolvedTaskId = fallbackTaskId;
        taskRow = await selectTaskRowById(fallbackTaskId);
      }
    }

    if (!taskRow || !resolvedTaskId) {
      return sendError(res, 404, "Task not found", "TASK_NOT_FOUND");
    }

    if (!taskRow.pos) {
      console.error("Task is missing part of speech", {
        taskId: resolvedTaskId,
      });
      return sendError(res, 500, "Task configuration invalid", "TASK_INVALID_POS");
    }

    const taskPos = asLexemePos(taskRow.pos);
    if (!taskPos) {
      console.error("Task has unsupported part of speech", {
        taskId: resolvedTaskId,
        pos: taskRow.pos,
      });
      return sendError(res, 500, "Task configuration invalid", "TASK_INVALID_POS");
    }

    if (resolvedTaskId !== payload.taskId) {
      console.warn("Resolved submission task identifier", {
        submittedTaskId: payload.taskId,
        resolvedTaskId,
        deviceId: payload.deviceId,
      });
    }

    try {
      ensurePosFeatureEnabled(taskPos, "tasks:submission", snapshot, {
        taskId: resolvedTaskId,
        deviceId: payload.deviceId,
      });
    } catch (error) {
      if (error instanceof PosFeatureDisabledError) {
        return res.status(403).json({
          error: error.message,
          code: "POS_FEATURE_DISABLED",
          pos: taskPos,
        });
      }
      throw error;
    }

    const registryEntry = getTaskRegistryEntry(taskRow.taskType as TaskType);

    const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : undefined;
    const answeredAt = payload.answeredAt ? new Date(payload.answeredAt) : undefined;
    const queuedAt = payload.queuedAt ? new Date(payload.queuedAt) : undefined;
    const responseMs = payload.responseMs ?? payload.timeSpentMs ?? 0;

    const payloadFeatureFlags = payload.featureFlags as SubmissionFeatureFlagSummary | undefined;

    const featureFlagSummary = (() => {
      const serverSummary = summarizeFeatureFlagSnapshot(snapshot);
      if (!payloadFeatureFlags) {
        return serverSummary;
      }
      const merged = { ...serverSummary } as Record<string, { enabled: boolean; stage: string; flag?: string; defaultValue: boolean }>;
      const entries = Object.entries(payloadFeatureFlags) as Array<[
        string,
        SubmissionFeatureFlagSummary[string],
      ]>;
      for (const [key, value] of entries) {
        if (!merged[key]) {
          merged[key] = {
            enabled: value.enabled,
            stage: value.stage ?? "beta",
            defaultValue: value.defaultValue ?? false,
          };
          continue;
        }
        merged[key] = {
          enabled: value.enabled,
          stage: value.stage ?? merged[key]!.stage,
          flag: merged[key]!.flag,
          defaultValue: value.defaultValue ?? merged[key]!.defaultValue,
        };
      }
      return merged;
    })();

    try {
      const submissionResult = await processTaskSubmission({
        deviceId: payload.deviceId,
        taskId: resolvedTaskId,
        taskType: taskRow.taskType as TaskType,
        pos: taskPos,
        queueCap: registryEntry.queueCap,
        result: payload.result,
        responseMs,
        submittedAt,
        frequencyRank: taskRow.frequencyRank ?? null,
      });

      await db.insert(practiceHistory).values({
        taskId: resolvedTaskId,
        lexemeId: taskRow.lexemeId!,
        pos: taskRow.pos!,
        taskType: taskRow.taskType!,
        renderer: taskRow.renderer!,
        deviceId: payload.deviceId,
        userId: getSessionUserId(req.authSession),
        result: payload.result,
        responseMs,
        submittedAt: submittedAt ?? new Date(),
        answeredAt: answeredAt ?? submittedAt ?? null,
        queuedAt: queuedAt ?? null,
        cefrLevel: payload.cefrLevel ?? null,
        packId: payload.packId ?? null,
        hintsUsed: payload.hintsUsed ?? false,
        featureFlags: featureFlagSummary,
        metadata: {
          submittedResponse: payload.submittedResponse ?? payload.answer ?? null,
          expectedResponse: payload.expectedResponse ?? null,
          promptSummary: typeof payload.promptSummary === "string" ? payload.promptSummary : null,
          queueCap: submissionResult.queueCap,
          priorityScore: submissionResult.priorityScore,
          coverageScore: submissionResult.coverageScore,
          leitnerBox: submissionResult.leitnerBox,
          totalAttempts: submissionResult.totalAttempts,
          correctAttempts: submissionResult.correctAttempts,
          frequencyRank: taskRow.frequencyRank ?? null,
          legacyVerb: payload.legacyVerb ?? null,
        },
      });

      res.json({
        status: "recorded",
        taskId: resolvedTaskId,
        deviceId: payload.deviceId,
        leitnerBox: submissionResult.leitnerBox,
        totalAttempts: submissionResult.totalAttempts,
        correctAttempts: submissionResult.correctAttempts,
        averageResponseMs: submissionResult.averageResponseMs,
        dueAt: submissionResult.dueAt.toISOString(),
        priorityScore: submissionResult.priorityScore,
        coverageScore: submissionResult.coverageScore,
        queueCap: submissionResult.queueCap,
      });
    } catch (error) {
      console.error("Failed to process task submission", error);
      sendError(res, 500, "Failed to record submission", "SUBMISSION_FAILED");
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
        conditions.push(
          sql`(lower(${words.lemma}) LIKE ${term} OR lower(${words.english}) LIKE ${term})`
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
          const key = `${(normalized.sentence ?? "").toLowerCase()}::${(normalized.source ?? "").toLowerCase()}`;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, normalized);
            return;
          }
          if (!existing.sentence && normalized.sentence) {
            existing.sentence = normalized.sentence;
          }
          if (normalized.translations) {
            existing.translations = {
              ...(existing.translations ?? {}),
              ...normalized.translations,
            };
          }
          if (!existing.source && normalized.source) {
            existing.source = normalized.source;
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
          const valueCompare = aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
          if (valueCompare !== 0) {
            return valueCompare;
          }
          return (a.source ?? "").localeCompare(b.source ?? "", undefined, { sensitivity: "base" });
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
        return sendError(res, 400, error.message, "SUPABASE_NOT_CONFIGURED");
      }
      console.error("Failed to clean and export enrichment data", error);
      sendError(res, 500, "Failed to clean storage snapshot", "SUPABASE_CLEAN_EXPORT_FAILED");
    }
  });

  app.get("/api/partner/drills", authenticatePartner, async (req, res) => {
    try {
      const partner = req.partner!;
      const limitParam = normalizeStringParam(req.query.limit);
      const level = normalizeStringParam(req.query.level);
      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 20;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, PARTNER_DRILL_LIMIT)
        : 20;

      const conditions: any[] = [eq(words.pos, "V"), eq(words.approved, true)];
      if (level) {
        conditions.push(eq(words.level, level));
      }

      const drillsQuery = db.select().from(words).where(and(...conditions)).orderBy(desc(words.updatedAt)).limit(limit);
      const wordRows = await drillsQuery;

      const drills = wordRows.map((word) => ({
        infinitive: word.lemma,
        english: word.english ?? "",
        auxiliary: normaliseAuxiliaryValue(word.aux),
        level: word.level ?? null,
        patternGroup: null,
        prompts: {
          praeteritum: {
            question: `Was ist die Präteritum-Form von “${word.lemma}”?`,
            answer: word.praeteritum ?? "",
            example: getExampleSentence(word.examples),
          },
          partizipII: {
            question: `Was ist das Partizip II von “${word.lemma}”?`,
            answer: word.partizipIi ?? "",
            example: getExampleTranslation(word.examples, "en"),
          },
          auxiliary: {
            question: `Welches Hilfsverb wird mit “${word.lemma}” verwendet?`,
            answer: normaliseAuxiliaryValue(word.aux),
            example: null,
          },
          english: {
            question: `What is the English meaning of “${word.lemma}”?`,
            answer: word.english ?? "",
          },
        },
        source: posPrimarySourceId(word.pos),
        updatedAt: word.updatedAt,
      }));

      res.setHeader("Cache-Control", "no-store");
      res.json({
        partner: {
          id: partner.id,
          name: partner.name,
          contactEmail: partner.contactEmail ?? null,
        },
        filters: {
          level: level ?? null,
          patternGroup: null,
          limit,
        },
        count: drills.length,
        generatedAt: new Date().toISOString(),
        drills,
      });
    } catch (error) {
      console.error("Error fetching partner drills:", error);
      sendError(res, 500, "Failed to fetch partner drills", "PARTNER_DRILLS_FAILED");
    }
  });

  app.get("/api/partner/usage-summary", authenticatePartner, async (req, res) => {
    try {
      const partner = req.partner!;
      const windowHoursParam = normalizeStringParam(req.query.windowHours ?? req.query.window);
      const windowHours = (() => {
        const parsed = windowHoursParam ? Number.parseInt(windowHoursParam, 10) : 24;
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return 24;
        }
        return Math.min(parsed, 24 * 14);
      })();

      const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
      const usageRows = await db.query.integrationUsage.findMany({
        where: eq(integrationUsage.partnerId, partner.id),
        orderBy: [desc(integrationUsage.requestedAt)],
        limit: 200,
      });

      const filtered = usageRows.filter((row) => {
        if (!row.requestedAt) return true;
        return row.requestedAt.getTime() >= cutoff;
      });

      const totals = filtered.reduce(
        (acc, row) => {
          acc.total += 1;
          if (row.statusCode >= 200 && row.statusCode < 300) {
            acc.success += 1;
          } else if (row.statusCode >= 500) {
            acc.failures += 1;
          }
          acc.responseTimeSum += row.responseTimeMs ?? 0;
          const key = row.endpoint ?? "unknown";
          acc.endpointCounts.set(key, (acc.endpointCounts.get(key) ?? 0) + 1);
          if (!acc.lastRequestAt || (row.requestedAt && row.requestedAt > acc.lastRequestAt)) {
            acc.lastRequestAt = row.requestedAt ?? acc.lastRequestAt;
          }
          return acc;
        },
        {
          total: 0,
          success: 0,
          failures: 0,
          responseTimeSum: 0,
          lastRequestAt: null as Date | null,
          endpointCounts: new Map<string, number>(),
        }
      );

      const averageResponse = totals.total > 0 ? Math.round(totals.responseTimeSum / totals.total) : 0;
      const successRate = totals.total > 0 ? Number(((totals.success / totals.total) * 100).toFixed(2)) : 0;

      const topEndpoints = Array.from(totals.endpointCounts.entries())
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      res.json({
        partner: {
          id: partner.id,
          name: partner.name,
        },
        windowHours,
        totals: {
          totalRequests: totals.total,
          successfulRequests: totals.success,
          failedRequests: totals.failures,
          successRate,
          averageResponseTimeMs: averageResponse,
          lastRequestAt: totals.lastRequestAt ? totals.lastRequestAt.toISOString() : null,
        },
        topEndpoints,
        recentRequests: filtered.slice(0, 25).map((row) => ({
          endpoint: row.endpoint,
          statusCode: row.statusCode,
          requestedAt: row.requestedAt ? row.requestedAt.toISOString() : null,
          responseTimeMs: row.responseTimeMs,
        })),
      });
    } catch (error) {
      console.error("Error building partner usage summary:", error);
      sendError(res, 500, "Failed to build partner usage summary", "PARTNER_USAGE_FAILED");
    }
  });

}
