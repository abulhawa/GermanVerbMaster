import { z } from "zod";
import { canonicalizeExamples, type WordExample } from "@shared";
import { isRecord } from "../shared.js";

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
    }, z.union([z.string().min(1).max(max), z.null()]))
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

export const translationRecordSchema = z.object({
  value: z.string().min(1).max(400),
  source: optionalText(200),
  language: optionalText(50),
  confidence: optionalConfidence,
});

export const exampleTranslationsSchema = z
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

export const exampleRecordSchema = z
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

export const enrichmentMethodSchema = z.enum(["bulk", "manual_api", "manual_entry", "preexisting"]);

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

export const wordUpdateSchema = z
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

export type WordUpdateInput = z.infer<typeof wordUpdateSchema>;

export function parseTriState(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "all") return undefined;
  if (["1", "true", "yes", "y", "ja", "only"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "nein", "non"].includes(normalized)) return false;
  return undefined;
}

export function parseLimitParam(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parsePageParam(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function mergeLegacyExampleFields(
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

export function parseWordId(rawId: string | undefined): number | null {
  if (!rawId) {
    return null;
  }
  const id = Number.parseInt(rawId, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}
