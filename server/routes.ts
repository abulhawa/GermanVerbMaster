import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { db } from "@db";
import {
  verbPracticeHistory,
  verbAnalytics,
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
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { GermanVerb, PracticeResult } from "@shared";
import type { LexemePos, TaskType } from "@shared";
import { srsEngine } from "./srs/index.js";
import { getTaskRegistryEntry, taskRegistry } from "./tasks/registry.js";
import { processTaskSubmission } from "./tasks/scheduler.js";
import { runVerbQueueShadowComparison } from "./tasks/shadow-mode.js";
import { isLexemeSchemaEnabled } from "./config.js";
import { enforceRateLimit, hashKey } from "./api/rate-limit.js";
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
  SupabaseStorageNotConfiguredError,
  syncEnrichmentDirectoryToSupabase,
  persistProviderSnapshotToFile,
} from "../scripts/enrichment/storage.js";
import { writeWordsBackupToDisk } from "../scripts/enrichment/backup.js";
import type {
  BulkEnrichmentResponse,
  EnrichmentPatch,
  WordEnrichmentPreview,
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

const practiceModeSchema = z.enum(["präteritum", "partizipII", "auxiliary", "english"]);
const levelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

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

const exampleRecordSchema = z.object({
  exampleDe: optionalText(800),
  exampleEn: optionalText(800),
  source: optionalText(200),
});

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
    canonical: optionalBoolean,
    sourcesCsv: optionalText(500),
    sourceNotes: optionalText(500),
    translations: translationRecordSchema.array().nullable().optional(),
    examples: exampleRecordSchema.array().nullable().optional(),
    posAttributes: posAttributesSchema.nullable().optional(),
    enrichmentAppliedAt: optionalTimestamp,
    enrichmentMethod: enrichmentMethodSchema.nullable().optional(),
  })
  .strict();

const enrichmentModeSchema = z.enum(["non-canonical", "canonical", "all"]);

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
    sourcesCsv: optionalText(800),
    complete: optionalBoolean,
    praeteritum: optionalText(200),
    partizipIi: optionalText(200),
    perfekt: optionalText(200),
    aux: optionalAuxiliary,
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

function stableDeterministicNoise(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
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

function setLegacyDeprecation(res: Response): void {
  res.setHeader('Deprecation', 'Sun, 01 Oct 2025 00:00:00 GMT');
  res.setHeader('Link', '</api/tasks>; rel="successor-version"; title="GET /api/tasks"');
  res.setHeader('Warning', '299 - "Legacy verb-only endpoint. Use /api/tasks."');
}

function computeWordCompleteness(word: Pick<Word, "pos"> & Partial<Word>): boolean {
  const english = word.english;
  const exampleDe = word.exampleDe;
  const exampleEn = word.exampleEn;
  const examples = word.examples ?? [];
  const hasExamplePair = Boolean(
    exampleDe?.trim() && exampleEn?.trim()
    || examples.some((entry) => entry?.exampleDe?.trim() && entry?.exampleEn?.trim()),
  );
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
  const sourceName = word.sourcesCsv?.split(";")[0]?.trim() || "words_all_sources";
  const levelReference = word.sourceNotes?.split(";")[0]?.trim() || word.level || "N/A";

  return {
    infinitive: word.lemma,
    english,
    präteritum: prateritum,
    partizipII: partizip,
    auxiliary,
    level,
    präteritumExample: word.exampleDe ?? "",
    partizipIIExample: word.exampleEn ?? "",
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

const recordPracticeSchema = z.object({
  verb: z.string().trim().min(1).max(100),
  mode: practiceModeSchema,
  result: z.enum(["correct", "incorrect"]),
  attemptedAnswer: z.string().trim().min(1).max(200),
  timeSpent: z.number().int().min(0).max(1000 * 60 * 15),
  level: levelSchema,
  deviceId: z.string().trim().min(6).max(64),
  queuedAt: z.string().datetime({ offset: true }).optional(),
});

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

  app.get("/api/tasks", async (req, res) => {
    const parsed = taskQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid task query",
        code: "INVALID_TASK_QUERY",
        details: parsed.error.flatten(),
      });
    }

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
        id: taskSpecs.id,
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

    const prioritizedLemmas: string[] = [];
    const canUseAdaptiveQueue =
      Boolean(deviceId)
      && !pack
      && (!pos || pos === "verb")
      && (!taskType || taskType === "conjugate_form")
      && srsEngine.isEnabled();

    if (canUseAdaptiveQueue && deviceId) {
      try {
        let queue = await srsEngine.fetchQueueForDevice(deviceId);
        if (!queue || srsEngine.isQueueStale(queue)) {
          queue = await srsEngine.generateQueueForDevice(deviceId, level ?? null);
        }

        if (queue?.items?.length) {
          const seen = new Set<string>();
          const maxQueueSamples = Math.max(limit * 2, limit + 5);
          for (const item of queue.items) {
            const normalized = item.verb?.trim();
            if (!normalized) {
              continue;
            }
            const key = normalized.toLowerCase();
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            prioritizedLemmas.push(normalized);
            if (prioritizedLemmas.length >= maxQueueSamples) {
              break;
            }
          }
        }
      } catch (error) {
        console.error("Failed to resolve adaptive queue for /api/tasks", {
          deviceId,
          error,
        });
      }
    }

    const fallbackFetchLimit = prioritizedLemmas.length
      ? Math.min(100, Math.max(limit, limit + prioritizedLemmas.length))
      : limit;

    const fallbackRows = await filteredQuery.orderBy(desc(taskSpecs.updatedAt)).limit(fallbackFetchLimit);

    const prioritizedRows = prioritizedLemmas.length
      ? await (
          (filters.length
            ? baseQuery.where(and(...filters, inArray(lexemes.lemma, prioritizedLemmas)))
            : baseQuery.where(inArray(lexemes.lemma, prioritizedLemmas)))
        )
          .orderBy(desc(taskSpecs.updatedAt))
          .limit(Math.min(fallbackFetchLimit, prioritizedLemmas.length * 2))
      : ([] as typeof fallbackRows);

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

        const rows = await db
          .select({
            taskId: schedulingState.taskId,
            priorityScore: schedulingState.priorityScore,
            dueAt: schedulingState.dueAt,
            lastResult: schedulingState.lastResult,
            totalAttempts: schedulingState.totalAttempts,
            correctAttempts: schedulingState.correctAttempts,
          })
          .from(schedulingState)
          .innerJoin(taskSpecs, eq(taskSpecs.id, schedulingState.taskId))
          .where(whereCondition)
          .orderBy(
            desc(sql`coalesce(${schedulingState.priorityScore}, 0)`),
            sql`coalesce(${schedulingState.dueAt}, now())`,
          )
          .limit(Math.min(limit * 3, 150));

        schedulingStateRows = rows as SchedulingStateSnapshot[];
      } catch (error) {
        console.error("Failed to load scheduling state for tasks list", {
          deviceId,
          error,
        });
        schedulingStateRows = [];
      }
    }

    const schedulingStateMap = new Map<string, SchedulingStateSnapshot>();
    const schedulingOrder = new Map<string, number>();
    schedulingStateRows.forEach((row, index) => {
      schedulingStateMap.set(row.taskId, row);
      schedulingOrder.set(row.taskId, index);
    });

    let schedulingRows: typeof fallbackRows = [];
    if (deviceId && schedulingStateRows.length) {
      const schedulingTaskIds = schedulingStateRows.map((row) => row.taskId);
      schedulingRows = await (
        filters.length
          ? baseQuery.where(and(...filters, inArray(taskSpecs.id, schedulingTaskIds)))
          : baseQuery.where(inArray(taskSpecs.id, schedulingTaskIds))
      )
        .orderBy(desc(taskSpecs.updatedAt))
        .limit(Math.min(100, Math.max(limit, schedulingTaskIds.length)));
    }

    const schedulingSorted = schedulingRows.length
      ? [...schedulingRows].sort((a, b) => {
          const indexA = schedulingOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const indexB = schedulingOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          if (indexA !== indexB) {
            return indexA - indexB;
          }
          return 0;
        })
      : [];

    const queueOrder = new Map<string, number>();
    prioritizedLemmas.forEach((lemma, index) => {
      queueOrder.set(lemma.toLowerCase(), index);
    });

    const combinedRows: typeof fallbackRows = [];
    const seenTaskIds = new Set<string>();
    const pushRow = (row: (typeof fallbackRows)[number]) => {
      if (!row || seenTaskIds.has(row.id)) {
        return;
      }
      seenTaskIds.add(row.id);
      combinedRows.push(row);
    };

    if (queueOrder.size) {
      const prioritizedSorted = [...prioritizedRows].sort((a, b) => {
        const indexA = queueOrder.get((a.lexemeLemma ?? "").toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        const indexB = queueOrder.get((b.lexemeLemma ?? "").toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        if (indexA !== indexB) {
          return indexA - indexB;
        }
        return 0;
      });
      prioritizedSorted.forEach(pushRow);
    }

    if (schedulingSorted.length) {
      schedulingSorted.forEach(pushRow);
    }

    fallbackRows.forEach(pushRow);

    let orderedRows = combinedRows;
    if (!queueOrder.size && deviceId) {
      const nowMs = Date.now();
      orderedRows = [...combinedRows]
        .map((row) => ({
          row,
          score: computeFallbackPriorityScore(schedulingStateMap.get(row.id), row.id, nowMs),
        }))
        .sort((a, b) => {
          if (a.score === b.score) {
            return a.row.id.localeCompare(b.row.id);
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

    const payload = allowedRows.map((row) => {
      const registryEntry = getTaskRegistryEntry(row.taskType as TaskType);
      return {
        id: row.id,
        taskType: row.taskType,
        renderer: row.renderer,
        pos: row.pos,
        prompt: row.prompt,
        solution: row.solution,
        queueCap: registryEntry.queueCap,
        lexeme: {
          id: row.lexemeId,
          lemma: row.lexemeLemma,
          metadata: row.lexemeMetadata,
        },
        pack: row.packId
          ? {
              id: row.packId,
              slug: row.packSlug,
              name: row.packName,
            }
          : null,
      };
    });

    res.json({ tasks: payload });
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

    const taskRow = await db
      .select({
        id: taskSpecs.id,
        taskType: taskSpecs.taskType,
        pos: taskSpecs.pos,
        renderer: taskSpecs.renderer,
        lexemeId: taskSpecs.lexemeId,
        frequencyRank: lexemes.frequencyRank,
      })
      .from(taskSpecs)
      .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id))
      .where(eq(taskSpecs.id, payload.taskId))
      .limit(1);

    if (taskRow.length === 0) {
      return sendError(res, 404, "Task not found", "TASK_NOT_FOUND");
    }

    const taskPos = asLexemePos(taskRow[0].pos);
    if (!taskPos) {
      console.error("Task has unsupported part of speech", {
        taskId: payload.taskId,
        pos: taskRow[0].pos,
      });
      return sendError(res, 500, "Task configuration invalid", "TASK_INVALID_POS");
    }

    try {
      ensurePosFeatureEnabled(taskPos, "tasks:submission", snapshot, {
        taskId: payload.taskId,
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

    const registryEntry = getTaskRegistryEntry(taskRow[0].taskType as TaskType);

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
        taskId: payload.taskId,
        taskType: taskRow[0].taskType as TaskType,
        pos: taskPos,
        queueCap: registryEntry.queueCap,
        result: payload.result,
        responseMs,
        submittedAt,
        frequencyRank: taskRow[0].frequencyRank ?? null,
      });

      await db.insert(practiceHistory).values({
        taskId: payload.taskId,
        lexemeId: taskRow[0].lexemeId,
        pos: taskRow[0].pos,
        taskType: taskRow[0].taskType,
        renderer: taskRow[0].renderer,
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
          queueCap: submissionResult.queueCap,
          priorityScore: submissionResult.priorityScore,
          coverageScore: submissionResult.coverageScore,
          leitnerBox: submissionResult.leitnerBox,
          totalAttempts: submissionResult.totalAttempts,
          correctAttempts: submissionResult.correctAttempts,
          frequencyRank: taskRow[0].frequencyRank ?? null,
        },
      });

      res.json({
        status: "recorded",
        taskId: payload.taskId,
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
      const canonicalFilter = parseTriState(req.query.canonical);
      const completeFilter = parseTriState(req.query.complete);
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
      if (typeof canonicalFilter === "boolean") {
        conditions.push(eq(words.canonical, canonicalFilter));
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
        data: rows,
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
      res.json(word);
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
      assign("sourcesCsv", "sourcesCsv");
      assign("sourceNotes", "sourceNotes");
      assign("translations", "translations");
      assign("examples", "examples");
      assign("posAttributes", "posAttributes");
      assign("enrichmentAppliedAt", "enrichmentAppliedAt");
      assign("enrichmentMethod", "enrichmentMethod");

      const canonical = data.canonical ?? existing.canonical;
      const merged: Pick<Word, "pos"> & Partial<Word> = {
        ...existing,
        ...updates,
        canonical,
      };

      const complete = computeWordCompleteness(merged);

      updates.canonical = canonical;
      updates.complete = complete;
      const hasContentUpdates = Object.keys(updates).some((key) =>
        ![
          "canonical",
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

      res.json(refreshed);
    } catch (error) {
      console.error("Error updating word:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, "Invalid word payload", "INVALID_WORD_INPUT");
      }
      sendError(res, 500, "Failed to update word", "WORD_UPDATE_FAILED");
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
      if (Object.prototype.hasOwnProperty.call(patch, "exampleDe") && patch.exampleDe !== undefined) {
        if (patch.exampleDe !== existing.exampleDe) {
          updates.exampleDe = patch.exampleDe;
          appliedFields.push("exampleDe");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "exampleEn") && patch.exampleEn !== undefined) {
        if (patch.exampleEn !== existing.exampleEn) {
          updates.exampleEn = patch.exampleEn;
          appliedFields.push("exampleEn");
          contentApplied = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "sourcesCsv") && patch.sourcesCsv !== undefined) {
        if (patch.sourcesCsv !== existing.sourcesCsv) {
          updates.sourcesCsv = patch.sourcesCsv;
          appliedFields.push("sourcesCsv");
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
      if (Object.prototype.hasOwnProperty.call(patch, "examples") && patch.examples !== undefined) {
        const nextExamples = patch.examples ?? null;
        const existingExamples = existing.examples ?? null;
        if (JSON.stringify(existingExamples) !== JSON.stringify(nextExamples)) {
          updates.examples = nextExamples;
          appliedFields.push("examples");
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
          sourcesCsv: refreshed.sourcesCsv ?? null,
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

  app.post("/api/enrichment/storage/export", requireAdminAccess, async (req, res) => {
    try {
      const backupResult = await writeWordsBackupToDisk();
      const result = await syncEnrichmentDirectoryToSupabase();
      let wordsBackup = backupResult.summary;
      if (wordsBackup) {
        const prefix = result.config.pathPrefix?.replace(/^\/+|\/+$/g, "") ?? null;
        const buildPath = (relative: string) =>
          prefix && prefix.length ? `${prefix}/${relative}` : relative;
        wordsBackup = {
          ...wordsBackup,
          objectPath: buildPath(wordsBackup.relativePath),
          latestObjectPath: buildPath(wordsBackup.latestRelativePath),
        };
      }
      const response: SupabaseStorageExportResponse = {
        bucket: result.config.bucket,
        prefix: result.config.pathPrefix,
        totalFiles: result.totalFiles,
        uploaded: result.uploaded,
        failed: result.failed,
        timestamp: new Date().toISOString(),
        wordsBackup,
      };

      res.setHeader("Cache-Control", "no-store");
      res.json(response);
    } catch (error) {
      if (error instanceof SupabaseStorageNotConfiguredError) {
        return sendError(res, 400, error.message, "SUPABASE_NOT_CONFIGURED");
      }
      console.error("Failed to export enrichment data to Supabase storage", error);
      sendError(res, 500, "Failed to export storage snapshot", "SUPABASE_EXPORT_FAILED");
    }
  });

  app.get("/api/quiz/verbs", async (req, res) => {
    setLegacyDeprecation(res);
    try {
      const level = normalizeStringParam(req.query.level)?.trim();
      const random = parseRandomFlag(req.query.random);
      const limit = parseLimitParam(req.query.limit, 50);

      const conditions: any[] = [
        eq(words.pos, "V"),
        eq(words.canonical, true),
        eq(words.complete, true),
      ];
      if (level) {
        conditions.push(eq(words.level, level));
      }

      const baseQuery = db.select().from(words).where(and(...conditions));
      const orderedQuery = random
        ? baseQuery.orderBy(sql`random()`)
        : baseQuery.orderBy(sql`lower(${words.lemma})`);

      const rows = await orderedQuery.limit(limit);
      const verbs = rows.map(toGermanVerb);
      res.setHeader("Cache-Control", "no-store");
      res.json(verbs);
    } catch (error) {
      console.error("Error fetching quiz verbs:", error);
      sendError(res, 500, "Failed to fetch verbs", "QUIZ_VERBS_FAILED");
    }
  });

  app.post("/api/practice-history", async (req, res) => {
    setLegacyDeprecation(res);
    try {
      const parsed = recordPracticeSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, "Invalid practice data", "INVALID_INPUT");
      }
      const { queuedAt, ...data } = parsed.data;
      const practicedAt = queuedAt ? new Date(queuedAt) : new Date();

      const limiterKey = hashKey(`practice-history:${data.deviceId}`);
      const limitCheck = await enforceRateLimit({
        key: limiterKey,
        limit: 30,
        windowMs: 60_000,
      });

      if (!limitCheck.allowed) {
        return res.status(429).json({ error: "Too many practice submissions", code: "RATE_LIMITED" });
      }

      await db.insert(verbPracticeHistory).values({
        ...data,
        userId: getSessionUserId(req.authSession),
      });

      const analytics = await db.query.verbAnalytics.findFirst({
        where: eq(verbAnalytics.verb, data.verb),
      });

      if (analytics) {
        await db
          .update(verbAnalytics)
          .set({
            totalAttempts: sql`${verbAnalytics.totalAttempts} + 1`,
            correctAttempts:
              data.result === "correct"
                ? sql`${verbAnalytics.correctAttempts} + 1`
                : verbAnalytics.correctAttempts,
            averageTimeSpent: sql`(${verbAnalytics.averageTimeSpent} * ${verbAnalytics.totalAttempts} + ${data.timeSpent}) / (${verbAnalytics.totalAttempts} + 1)`,
            lastPracticedAt: new Date(),
          })
          .where(eq(verbAnalytics.verb, data.verb));
      } else {
        await db.insert(verbAnalytics).values({
          verb: data.verb,
          totalAttempts: 1,
          correctAttempts: data.result === "correct" ? 1 : 0,
          averageTimeSpent: data.timeSpent,
          lastPracticedAt: new Date(),
          level: data.level,
        });
      }

      try {
        await srsEngine.recordPracticeAttempt({
          deviceId: data.deviceId,
          verb: data.verb,
          level: data.level,
          result: data.result,
          timeSpent: data.timeSpent,
          userId: getSessionUserId(req.authSession),
          practicedAt,
        });
      } catch (error) {
        console.error("Failed to update adaptive scheduling state:", error);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error recording practice:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, "Invalid practice data", "INVALID_INPUT");
      }
      sendError(res, 500, "Failed to record practice attempt", "PRACTICE_SAVE_FAILED");
    }
  });

  app.get("/api/practice-history", async (req, res) => {
    setLegacyDeprecation(res);
    try {
      const sessionUserId = getSessionUserId(req.authSession);
      const history = await db.query.verbPracticeHistory.findMany({
        where: sessionUserId ? eq(verbPracticeHistory.userId, sessionUserId) : undefined,
        orderBy: [desc(verbPracticeHistory.createdAt)],
        limit: 100,
      });

      res.json(history);
    } catch (error) {
      console.error("Error fetching practice history:", error);
      sendError(res, 500, "Failed to fetch practice history", "HISTORY_FETCH_FAILED");
    }
  });

  app.get("/api/analytics", async (req, res) => {
    setLegacyDeprecation(res);
    try {
      const analytics = await db.query.verbAnalytics.findMany({
        orderBy: [desc(verbAnalytics.lastPracticedAt)],
      });

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      sendError(res, 500, "Failed to fetch analytics", "ANALYTICS_FETCH_FAILED");
    }
  });

  app.get("/api/review-queue", async (req, res) => {
    setLegacyDeprecation(res);
    try {
      if (!srsEngine.isEnabled()) {
        return sendError(res, 404, "Adaptive review queue is disabled", "FEATURE_DISABLED");
      }

      const deviceId = normalizeStringParam(req.query.deviceId)?.trim();
      if (!deviceId) {
        return sendError(res, 400, "deviceId is required", "INVALID_DEVICE");
      }

      const levelHint = normalizeStringParam(req.query.level)?.trim() ?? null;

      let queue = await srsEngine.fetchQueueForDevice(deviceId);
      if (!queue || srsEngine.isQueueStale(queue)) {
        queue = await srsEngine.generateQueueForDevice(deviceId, levelHint);
      }

      if (!queue) {
        const fallbackGeneratedAt = new Date();
        return res.json({
          deviceId,
          version: "unavailable",
          generatedAt: fallbackGeneratedAt.toISOString(),
          validUntil: new Date(fallbackGeneratedAt.getTime() + 60_000).toISOString(),
          featureEnabled: true,
          items: [],
          metrics: {
            queueLength: 0,
            generationDurationMs: 0,
          },
        });
      }

      if (isLexemeSchemaEnabled()) {
        void runVerbQueueShadowComparison({
          deviceId,
          legacyQueue: {
            deviceId,
            items: queue.items,
          },
          limit: queue.items.length,
        }).catch((error) => {
          console.error("[shadow-mode] Failed to compare verb queues", {
            deviceId,
            error,
          });
        });
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({
        deviceId: queue.deviceId,
        version: queue.version,
        generatedAt: queue.generatedAt?.toISOString() ?? new Date().toISOString(),
        validUntil: queue.validUntil?.toISOString() ?? new Date(Date.now() + 60_000).toISOString(),
        featureEnabled: true,
        items: queue.items,
        metrics: {
          queueLength: queue.itemCount,
          generationDurationMs: queue.generationDurationMs,
        },
      });
    } catch (error) {
      console.error("Error fetching adaptive review queue:", error);
      sendError(res, 500, "Failed to build adaptive review queue", "REVIEW_QUEUE_FAILED");
    }
  });

  app.get("/api/partner/drills", authenticatePartner, async (req, res) => {
    setLegacyDeprecation(res);
    try {
      const partner = req.partner!;
      const limitParam = normalizeStringParam(req.query.limit);
      const level = normalizeStringParam(req.query.level);
      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 20;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, PARTNER_DRILL_LIMIT)
        : 20;

      const conditions: any[] = [eq(words.pos, "V"), eq(words.canonical, true)];
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
            example: word.exampleDe ?? null,
          },
          partizipII: {
            question: `Was ist das Partizip II von “${word.lemma}”?`,
            answer: word.partizipIi ?? "",
            example: word.exampleEn ?? null,
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
        source: word.sourcesCsv ?? null,
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

  app.post("/api/jobs/regenerate-queues", async (_req, res) => {
    try {
      if (!srsEngine.isEnabled()) {
        return res.status(200).json({ status: "disabled" });
      }

      await srsEngine.regenerateQueuesOnce();
      return res.status(202).json({ status: "queued" });
    } catch (error) {
      console.error("Failed to regenerate adaptive review queues:", error);
      return sendError(
        res,
        500,
        "Failed to regenerate adaptive review queues",
        "QUEUE_REGENERATION_FAILED",
      );
    }
  });
}
