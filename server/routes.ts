import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { verbPracticeHistory, verbAnalytics, verbs } from "@db/schema";
import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import type { Response } from "express";

const practiceModeSchema = z.enum(['präteritum', 'partizipII', 'auxiliary', 'english']);
const levelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

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
        conditions.push(sql`verbs.pattern->>'group' = ${pattern}`);
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

  const httpServer = createServer(app);
  return httpServer;
}