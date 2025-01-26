import { pgTable, text, serial, integer, boolean, timestamp, foreignKey, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
});

export const practiceResultEnum = pgEnum('practice_result', ['correct', 'incorrect']);

export const verbPracticeHistory = pgTable("verb_practice_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  verb: text("verb").notNull(),
  mode: text("mode").notNull(),
  result: practiceResultEnum("result").notNull(),
  attemptedAnswer: text("attempted_answer").notNull(),
  timeSpent: integer("time_spent").notNull(), // in milliseconds
  level: text("level").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const verbAnalytics = pgTable("verb_analytics", {
  id: serial("id").primaryKey(),
  verb: text("verb").notNull(),
  totalAttempts: integer("total_attempts").notNull().default(0),
  correctAttempts: integer("correct_attempts").notNull().default(0),
  averageTimeSpent: integer("average_time_spent").notNull().default(0), // in milliseconds
  lastPracticedAt: timestamp("last_practiced_at"),
  level: text("level").notNull(),
});

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export type VerbPracticeHistory = typeof verbPracticeHistory.$inferSelect;
export type InsertVerbPracticeHistory = typeof verbPracticeHistory.$inferInsert;

export type VerbAnalytics = typeof verbAnalytics.$inferSelect;
export type InsertVerbAnalytics = typeof verbAnalytics.$inferInsert;