import type { Express, NextFunction, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import {
  verbPracticeHistory,
  verbAnalytics,
  words,
  integrationPartners,
  integrationUsage,
  type IntegrationPartner,
  type Word,
} from "@db/schema";
import { z } from "zod";
import { and, count, desc, eq, sql } from "drizzle-orm";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createHash, randomUUID } from "node:crypto";
import type { GermanVerb } from "@shared";
import { srsEngine } from "./srs";

const practiceModeSchema = z.enum(["präteritum", "partizipII", "auxiliary", "english"]);
const levelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

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
    }
    return value;
  }, z.union([z.literal("haben"), z.literal("sein"), z.null()]))
  .optional();

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

function parsePageParam(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function computeWordCompleteness(word: Pick<Word, "pos"> & Partial<Word>): boolean {
  switch (word.pos) {
    case "V":
      return Boolean(word.praeteritum && word.partizipIi && word.perfekt);
    case "N":
      return Boolean(word.gender && word.plural);
    case "Adj":
      return Boolean(word.comparative && word.superlative);
    default:
      return Boolean(word.english || word.exampleDe);
  }
}

function toGermanVerb(word: Word): GermanVerb {
  const english = word.english ?? "";
  const prateritum = word.praeteritum ?? "";
  const partizip = word.partizipIi ?? "";
  const auxiliary = word.aux === "sein" ? "sein" : "haben";
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

const practiceHistoryLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.body && typeof req.body.deviceId === "string") {
      return req.body.deviceId;
    }
    const ip = typeof req.ip === "string" ? req.ip : undefined;
    return ip ? ipKeyGenerator(ip) : "global";
  },
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many practice submissions", code: "RATE_LIMITED" });
  },
});

function sendError(res: Response, status: number, message: string, code?: string) {
  if (code) {
    return res.status(status).json({ error: message, code });
  }
  return res.status(status).json({ error: message });
}

let adminAuthWarningLogged = false;

function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.ADMIN_API_TOKEN?.trim();

  if (!expectedToken) {
    if (!adminAuthWarningLogged) {
      console.warn(
        "ADMIN_API_TOKEN is not configured; skipping admin authentication. This should only happen in local development."
      );
      adminAuthWarningLogged = true;
    }
    return next();
  }

  const providedToken = normalizeStringParam(req.headers["x-admin-token"])?.trim();

  if (!providedToken || providedToken !== expectedToken) {
    return sendError(res, 401, "Invalid admin token", "ADMIN_AUTH_FAILED");
  }

  return next();
}

export function registerRoutes(app: Express): Server {
  app.get("/api/words", requireAdminToken, async (req, res) => {
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

  app.patch("/api/words/:id", requireAdminToken, async (req, res) => {
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

      const canonical = data.canonical ?? existing.canonical;
      const merged: Pick<Word, "pos"> & Partial<Word> = {
        ...existing,
        ...updates,
        canonical,
      };

      const complete = computeWordCompleteness(merged);

      updates.canonical = canonical;
      updates.complete = complete;
      updates.updatedAt = sql`unixepoch('now')`;

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

  app.get("/api/quiz/verbs", async (req, res) => {
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

  app.post("/api/practice-history", practiceHistoryLimiter, async (req, res) => {
    try {
      const parsed = recordPracticeSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, "Invalid practice data", "INVALID_INPUT");
      }
      const { queuedAt, ...data } = parsed.data;
      const practicedAt = queuedAt ? new Date(queuedAt) : new Date();

      await db.insert(verbPracticeHistory).values({
        ...data,
        userId: (req as any).user?.id,
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
          userId: (req as any).user?.id ?? null,
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
    try {
      const history = await db.query.verbPracticeHistory.findMany({
        where: (req as any).user?.id
          ? eq(verbPracticeHistory.userId, (req as any).user.id)
          : undefined,
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
        auxiliary: word.aux === "sein" ? "sein" : "haben",
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
            answer: word.aux === "sein" ? "sein" : "haben",
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

  const httpServer = createServer(app);
  const regenerator = srsEngine.startQueueRegenerator();
  httpServer.on("close", () => {
    regenerator.stop();
  });
  return httpServer;
}
