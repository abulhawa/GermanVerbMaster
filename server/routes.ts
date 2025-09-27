import type { Express, NextFunction, Request } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import {
  verbPracticeHistory,
  verbAnalytics,
  verbs,
  integrationPartners,
  integrationUsage,
  type IntegrationPartner,
} from "@db/schema";
import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import type { Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import type { GermanVerb } from "@shared";

const practiceModeSchema = z.enum(['präteritum', 'partizipII', 'auxiliary', 'english']);
const levelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

const adminVerbSchema = z.object({
  infinitive: z.string().trim().min(1).max(100),
  english: z.string().trim().min(1).max(200),
  präteritum: z.string().trim().min(1).max(200),
  partizipII: z.string().trim().min(1).max(200),
  auxiliary: z.enum(['haben', 'sein']),
  level: levelSchema,
  präteritumExample: z.string().trim().min(1).max(500),
  partizipIIExample: z.string().trim().min(1).max(500),
  source: z.object({
    name: z.string().trim().min(1).max(100),
    levelReference: z.string().trim().min(1).max(200),
  }),
  pattern: z
    .object({
      type: z.string().trim().min(1).max(100),
      group: z.string().trim().min(1).max(100).optional(),
    })
    .nullable()
    .optional(),
});

declare global {
  namespace Express {
    interface Request {
      partner?: IntegrationPartner;
      partnerRequestId?: string;
    }
  }
}

const PARTNER_KEY_HEADER = 'x-partner-key';
const PARTNER_DRILL_LIMIT = 100;

function normalizeStringParam(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return undefined;
}

async function authenticatePartner(req: Request, res: Response, next: NextFunction) {
  const apiKey = normalizeStringParam(req.headers[PARTNER_KEY_HEADER]) ?? normalizeStringParam((req as any).query?.apiKey);

  if (!apiKey) {
    return sendError(res, 401, 'Missing partner API key', 'MISSING_PARTNER_KEY');
  }

  try {
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    const partner = await db.query.integrationPartners.findFirst({
      where: eq(integrationPartners.apiKeyHash, apiKeyHash),
    });

    if (!partner) {
      return sendError(res, 401, 'Invalid partner API key', 'INVALID_PARTNER_KEY');
    }

    let allowedOrigins: string[] | null = null;
    if (Array.isArray(partner.allowedOrigins)) {
      allowedOrigins = partner.allowedOrigins.filter((origin): origin is string => typeof origin === 'string');
    } else if (typeof partner.allowedOrigins === 'string') {
      try {
        const parsed = JSON.parse(partner.allowedOrigins);
        if (Array.isArray(parsed)) {
          allowedOrigins = parsed.filter((origin): origin is string => typeof origin === 'string');
        }
      } catch (error) {
        console.warn('Unable to parse allowedOrigins JSON for partner', partner.id, error);
      }
    }

    const requestOrigin = normalizeStringParam(req.headers.origin ?? req.query.origin ?? req.query.embedOrigin);

    if (allowedOrigins && allowedOrigins.length > 0 && requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      return sendError(res, 403, 'Origin is not allowed for this partner', 'PARTNER_ORIGIN_BLOCKED');
    }

    const requestId = randomUUID();
    req.partner = partner;
    req.partnerRequestId = requestId;
    res.setHeader('X-Partner-Request', requestId);

    const startedAt = Date.now();
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    res.on('finish', () => {
      db.insert(integrationUsage)
        .values({
          partnerId: partner.id,
          endpoint: req.originalUrl.split('?')[0] ?? req.path,
          method: req.method,
          statusCode: res.statusCode,
          requestId,
          responseTimeMs: Date.now() - startedAt,
          userAgent: userAgent ?? undefined,
        })
        .catch((error) => {
          console.error('Failed to log partner usage', error);
        });
    });

    return next();
  } catch (error) {
    console.error('Partner authentication failed:', error);
    return sendError(res, 500, 'Partner authentication failed', 'PARTNER_AUTH_FAILED');
  }
}

const recordPracticeSchema = z.object({
  verb: z.string().trim().min(1).max(100),
  mode: practiceModeSchema,
  result: z.enum(['correct', 'incorrect']),
  attemptedAnswer: z.string().trim().min(1).max(200),
  timeSpent: z.number().int().min(0).max(1000 * 60 * 15),
  level: levelSchema,
  deviceId: z.string().trim().min(6).max(64),
  queuedAt: z.string().datetime({ offset: true }).optional(),
});

const practiceHistoryLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.body && typeof req.body.deviceId === 'string') {
      return req.body.deviceId;
    }
    return req.ip ?? 'global';
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many practice submissions', code: 'RATE_LIMITED' });
  },
});

function sendError(res: Response, status: number, message: string, code?: string) {
  if (code) {
    return res.status(status).json({ error: message, code });
  }
  return res.status(status).json({ error: message });
}

function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.ADMIN_API_TOKEN;

  if (!expectedToken) {
    return sendError(res, 500, 'Admin API not configured', 'ADMIN_AUTH_DISABLED');
  }

  const providedToken = normalizeStringParam(req.headers['x-admin-token']);

  if (!providedToken || providedToken !== expectedToken) {
    return sendError(res, 401, 'Invalid admin token', 'ADMIN_AUTH_FAILED');
  }

  return next();
}

export function registerRoutes(app: Express): Server {
  // Get all verbs or filter by level
  app.get("/api/verbs", async (req, res) => {
    try {
      const level = req.query.level as string;
      const pattern = req.query.pattern as string;

      const conditions = [] as any[];
      if (level) {
        conditions.push(eq(verbs.level, level));
      }
      if (pattern) {
        conditions.push(sql`json_extract(${verbs.pattern}, '$.group') = ${pattern}`);
      }

      const verbsList = await (
        conditions.length
          ? db.select().from(verbs).where(and(...conditions))
          : db.select().from(verbs)
      );
      res.json(verbsList);
    } catch (error) {
      console.error('Error fetching verbs:', error);
      sendError(res, 500, 'Failed to fetch verbs', 'VERBS_FETCH_FAILED');
    }
  });

  app.post("/api/admin/verbs", requireAdminToken, async (req, res) => {
    try {
      const parsed = adminVerbSchema.safeParse(req.body satisfies Partial<GermanVerb>);

      if (!parsed.success) {
        return sendError(res, 400, 'Invalid verb payload', 'INVALID_VERB_INPUT');
      }

      const payload = parsed.data;

      const existingVerb = await db.query.verbs.findFirst({
        where: eq(verbs.infinitive, payload.infinitive),
      });

      if (existingVerb) {
        return sendError(res, 409, 'Verb already exists', 'VERB_EXISTS');
      }

      await db.insert(verbs).values({
        ...payload,
        pattern: payload.pattern ?? null,
      });

      const createdVerb = await db.query.verbs.findFirst({
        where: eq(verbs.infinitive, payload.infinitive),
      });

      if (!createdVerb) {
        return sendError(res, 500, 'Failed to create verb', 'VERB_CREATE_FAILED');
      }

      return res.status(201).json(createdVerb);
    } catch (error) {
      console.error('Error creating verb:', error);
      return sendError(res, 500, 'Failed to create verb', 'VERB_CREATE_FAILED');
    }
  });

  // Get a single verb by infinitive
  app.get("/api/verbs/:infinitive", async (req, res) => {
    try {
      const verb = await db.query.verbs.findFirst({
        where: eq(verbs.infinitive, req.params.infinitive)
      });

      if (!verb) {
        return sendError(res, 404, 'Verb not found', 'VERB_NOT_FOUND');
      }

      res.json(verb);
    } catch (error) {
      console.error('Error fetching verb:', error);
      sendError(res, 500, 'Failed to fetch verb', 'VERB_FETCH_FAILED');
    }
  });

  // Record a practice attempt
  app.post("/api/practice-history", practiceHistoryLimiter, async (req, res) => {
    try {
      const parsed = recordPracticeSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid practice data', 'INVALID_INPUT');
      }
      const { queuedAt: _queuedAt, ...data } = parsed.data;

      // Record the practice attempt
      await db.insert(verbPracticeHistory).values({
        ...data,
        userId: (req as any).user?.id,
      });

      // Update analytics
      const analytics = await db.query.verbAnalytics.findFirst({
        where: eq(verbAnalytics.verb, data.verb)
      });

      if (analytics) {
        await db
          .update(verbAnalytics)
          .set({
            totalAttempts: sql`${verbAnalytics.totalAttempts} + 1`,
            correctAttempts: data.result === 'correct' 
              ? sql`${verbAnalytics.correctAttempts} + 1` 
              : verbAnalytics.correctAttempts,
            averageTimeSpent: sql`(${verbAnalytics.averageTimeSpent} * ${verbAnalytics.totalAttempts} + ${data.timeSpent}) / (${verbAnalytics.totalAttempts} + 1)`,
            lastPracticedAt: new Date()
          })
          .where(eq(verbAnalytics.verb, data.verb));
      } else {
        await db.insert(verbAnalytics).values({
          verb: data.verb,
          totalAttempts: 1,
          correctAttempts: data.result === 'correct' ? 1 : 0,
          averageTimeSpent: data.timeSpent,
          lastPracticedAt: new Date(),
          level: data.level
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error recording practice:', error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Invalid practice data', 'INVALID_INPUT');
      }
      sendError(res, 500, 'Failed to record practice attempt', 'PRACTICE_SAVE_FAILED');
    }
  });

  // Get practice history
  app.get("/api/practice-history", async (req, res) => {
    try {
      const history = await db.query.verbPracticeHistory.findMany({
        where: (req as any).user?.id
          ? eq(verbPracticeHistory.userId, (req as any).user.id)
          : undefined,
        orderBy: [desc(verbPracticeHistory.createdAt)],
        limit: 100 // Limit to recent 100 attempts
      });

      res.json(history);
    } catch (error) {
      console.error('Error fetching practice history:', error);
      sendError(res, 500, 'Failed to fetch practice history', 'HISTORY_FETCH_FAILED');
    }
  });

  // Get analytics data
  app.get("/api/analytics", async (req, res) => {
    try {
      const analytics = await db.query.verbAnalytics.findMany({
        orderBy: [desc(verbAnalytics.lastPracticedAt)]
      });

      res.json(analytics);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      sendError(res, 500, 'Failed to fetch analytics', 'ANALYTICS_FETCH_FAILED');
    }
  });

  // Partner-facing drills endpoint
  app.get("/api/partner/drills", authenticatePartner, async (req, res) => {
    try {
      const partner = req.partner!;
      const limitParam = normalizeStringParam(req.query.limit);
      const level = normalizeStringParam(req.query.level);
      const patternGroup = normalizeStringParam(req.query.patternGroup ?? req.query.pattern);

      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 20;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, PARTNER_DRILL_LIMIT)
        : 20;

      const conditions = [] as any[];
      if (level) {
        conditions.push(eq(verbs.level, level));
      }
      if (patternGroup) {
        conditions.push(sql`json_extract(${verbs.pattern}, '$.group') = ${patternGroup}`);
      }

      const baseQuery = db.select().from(verbs);
      const verbsQuery = conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery;

      const verbsList = await verbsQuery.orderBy(desc(verbs.updatedAt)).limit(limit);

      const drills = verbsList.map((verb) => ({
        infinitive: verb.infinitive,
        english: verb.english,
        auxiliary: verb.auxiliary,
        level: verb.level,
        patternGroup: verb.pattern && typeof verb.pattern === 'object' ? (verb.pattern as any)?.group ?? null : null,
        prompts: {
          praeteritum: {
            question: `Was ist die Präteritum-Form von “${verb.infinitive}”?`,
            answer: verb.präteritum,
            example: verb.präteritumExample,
          },
          partizipII: {
            question: `Was ist das Partizip II von “${verb.infinitive}”?`,
            answer: verb.partizipII,
            example: verb.partizipIIExample,
          },
          auxiliary: {
            question: `Welches Hilfsverb wird mit “${verb.infinitive}” verwendet?`,
            answer: verb.auxiliary,
          },
          english: {
            question: `What is the English meaning of “${verb.infinitive}”?`,
            answer: verb.english,
          },
        },
        source: verb.source,
        updatedAt: verb.updatedAt,
      }));

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        partner: {
          id: partner.id,
          name: partner.name,
          contactEmail: partner.contactEmail ?? null,
        },
        filters: {
          level: level ?? null,
          patternGroup: patternGroup ?? null,
          limit,
        },
        count: drills.length,
        generatedAt: new Date().toISOString(),
        drills,
      });
    } catch (error) {
      console.error('Error fetching partner drills:', error);
      sendError(res, 500, 'Failed to fetch partner drills', 'PARTNER_DRILLS_FAILED');
    }
  });

  // Partner usage summary
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
          const key = row.endpoint ?? 'unknown';
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
      console.error('Error building partner usage summary:', error);
      sendError(res, 500, 'Failed to build partner usage summary', 'PARTNER_USAGE_FAILED');
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}