import { and, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { LexemePos, TaskType } from "@shared";
import { taskRegistry } from "../../tasks/registry.js";
import { isRecord, levelSchema, normaliseExampleRecord } from "../shared.js";

const multiStringSchema = z.union([z.string().trim(), z.array(z.string().trim())]);

export const taskQuerySchema = z.object({
  pos: z.string().trim().optional(),
  taskType: z.string().trim().optional(),
  taskTypes: multiStringSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  deviceId: z.string().trim().min(6).max(64).optional(),
  level: z.union([levelSchema, z.array(levelSchema)]).optional(),
  excludeTaskIds: multiStringSchema.optional(),
});

export const submissionSchema = z
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

export function normaliseTaskPosFilter(value: string): LexemePos | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["verb", "verbs", "v"].includes(normalized)) return "verb";
  if (["noun", "nouns", "n"].includes(normalized)) return "noun";
  if (["adjective", "adjectives", "adj"].includes(normalized)) return "adjective";
  return KNOWN_LEXEME_POS.has(normalized as LexemePos)
    ? (normalized as LexemePos)
    : null;
}

export function parseTaskTypeFilter(value: string): TaskType | null {
  const key = value.trim();
  if (!key) return null;
  return key in taskRegistry ? (key as TaskType) : null;
}

export function combineFilters(filters: Array<SQL | null>): SQL | null {
  const active = filters.filter((entry): entry is SQL => Boolean(entry));
  if (!active.length) {
    return null;
  }
  if (active.length === 1) {
    return active[0]!;
  }
  const combined = and(...(active as [SQL, SQL, ...SQL[]]));
  return combined ?? null;
}

export function normaliseTaskPrompt(prompt: unknown): Record<string, unknown> {
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

export function asLexemePos(value: string | null | undefined): LexemePos | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return KNOWN_LEXEME_POS.has(normalized as LexemePos) ? (normalized as LexemePos) : null;
}

