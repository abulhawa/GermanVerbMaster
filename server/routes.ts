import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { db, getPool } from "@db";
import { words, taskSpecs, lexemes, practiceHistory, type Word } from "@db";
import { z } from "zod";
import { and, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
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
  limit: z.coerce.number().int().min(1).max(100).default(25),
  deviceId: z
    .string()
    .trim()
    .min(6)
    .max(64)
    .optional(),
  level: levelSchema.optional(),
});

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

const KNOWN_LEXEME_POS = new Set<LexemePos>([
  "verb",
  "noun",
  "adjective",
  "adverb",
  "pronoun",
  "determiner",
  "preposition",
  "conjunction",
  "numeral",
  "particle",
  "interjection",
]);

function asLexemePos(value: string | null | undefined): LexemePos | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return KNOWN_LEXEME_POS.has(normalized as LexemePos) ? (normalized as LexemePos) : null;
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
      const { pos, taskType, limit, deviceId, level } = parsed.data;
      const filters: Array<ReturnType<typeof eq>> = [];
      let normalisedPos: LexemePos | null = null;

      res.setHeader("Cache-Control", "no-store");

      if (pos) {
        normalisedPos = normaliseTaskPosFilter(pos);
        if (!normalisedPos) {
          return res.status(400).json({
            error: `Unsupported part-of-speech filter: ${pos}`,
            code: "INVALID_POS_FILTER",
          });
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
        })
        .from(taskSpecs)
        .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id));

      const filteredQuery = filters.length ? baseQuery.where(and(...filters)) : baseQuery;

      const fallbackFetchLimit = limit;

      const fallbackQuery = filteredQuery.orderBy(desc(taskSpecs.updatedAt)).limit(fallbackFetchLimit);
      const fallbackRowsRaw = await executeSelectRaw<Record<string, unknown>>(fallbackQuery);
      const fallbackRows = fallbackRowsRaw.map((row) => mapTaskRow(row as Record<string, any>));

      const rows = fallbackRows.slice(0, limit);

      const payload: Array<{
        taskId: string;
        taskType: string;
        renderer: string;
        pos: string;
        prompt: Record<string, unknown>;
        solution?: unknown;
        queueCap: number;
        lexeme: { id: string; lemma: string; metadata: Record<string, unknown> | null };
      }> = [];

      for (const row of rows) {
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
        });
      }

      res.json({ tasks: payload });
    } catch (error) {
      next(error);
    }
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
    res.setHeader("Cache-Control", "no-store");

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

    const registryEntry = getTaskRegistryEntry(taskRow.taskType as TaskType);

    const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : undefined;
    const answeredAt = payload.answeredAt ? new Date(payload.answeredAt) : undefined;
    const queuedAt = payload.queuedAt ? new Date(payload.queuedAt) : undefined;
    const responseMs = payload.responseMs ?? payload.timeSpentMs ?? 0;

    try {
      const queueCap = registryEntry.queueCap;

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
        metadata: {
          submittedResponse: payload.submittedResponse ?? payload.answer ?? null,
          expectedResponse: payload.expectedResponse ?? null,
          promptSummary: typeof payload.promptSummary === "string" ? payload.promptSummary : null,
          queueCap,
          frequencyRank: taskRow.frequencyRank ?? null,
          legacyVerb: payload.legacyVerb ?? null,
        },
      });

      res.json({
        status: "recorded",
        taskId: resolvedTaskId,
        deviceId: payload.deviceId,
        queueCap,
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

}
