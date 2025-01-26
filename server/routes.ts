import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { verbPracticeHistory, verbAnalytics, verbs } from "@db/schema";
import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";

const recordPracticeSchema = z.object({
  verb: z.string(),
  mode: z.string(),
  result: z.enum(['correct', 'incorrect']),
  attemptedAnswer: z.string(),
  timeSpent: z.number(),
  level: z.string()
});

export function registerRoutes(app: Express): Server {
  // Get all verbs or filter by level
  app.get("/api/verbs", async (req, res) => {
    try {
      const level = req.query.level as string;
      const pattern = req.query.pattern as string;

      let query = db.select().from(verbs);

      if (level) {
        query = query.where(eq(verbs.level, level));
      }

      if (pattern) {
        query = query.where(sql`verbs.pattern->>'group' = ${pattern}`);
      }

      const verbsList = await query;
      res.json(verbsList);
    } catch (error) {
      console.error('Error fetching verbs:', error);
      res.status(500).json({ error: 'Failed to fetch verbs' });
    }
  });

  // Get a single verb by infinitive
  app.get("/api/verbs/:infinitive", async (req, res) => {
    try {
      const verb = await db.query.verbs.findFirst({
        where: eq(verbs.infinitive, req.params.infinitive)
      });

      if (!verb) {
        return res.status(404).json({ error: 'Verb not found' });
      }

      res.json(verb);
    } catch (error) {
      console.error('Error fetching verb:', error);
      res.status(500).json({ error: 'Failed to fetch verb' });
    }
  });

  // Record a practice attempt
  app.post("/api/practice-history", async (req, res) => {
    try {
      const data = recordPracticeSchema.parse(req.body);

      // Record the practice attempt
      await db.insert(verbPracticeHistory).values({
        ...data,
        userId: req.user?.id
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
      res.status(400).json({ error: 'Invalid practice data' });
    }
  });

  // Get practice history
  app.get("/api/practice-history", async (req, res) => {
    try {
      const history = await db.query.verbPracticeHistory.findMany({
        where: req.user?.id ? eq(verbPracticeHistory.userId, req.user.id) : undefined,
        orderBy: [desc(verbPracticeHistory.createdAt)],
        limit: 100 // Limit to recent 100 attempts
      });

      res.json(history);
    } catch (error) {
      console.error('Error fetching practice history:', error);
      res.status(500).json({ error: 'Failed to fetch practice history' });
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
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}