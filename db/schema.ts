import type { GermanVerb, PracticeResult } from "@shared";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

const practiceResult = ["correct", "incorrect"] as const satisfies ReadonlyArray<PracticeResult>;

export const verbs = sqliteTable("verbs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  infinitive: text("infinitive").notNull().unique(),
  english: text("english").notNull(),
  präteritum: text("präteritum").notNull(),
  partizipII: text("partizipII").notNull(),
  auxiliary: text("auxiliary").notNull(),
  level: text("level").notNull(),
  präteritumExample: text("präteritumExample").notNull(),
  partizipIIExample: text("partizipIIExample").notNull(),
  source: text("source", { mode: "json" }).$type<GermanVerb["source"]>().notNull(),
  pattern: text("pattern", { mode: "json" }).$type<GermanVerb["pattern"] | null>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch('now'))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch('now'))`)
    .notNull(),
});

export const verbPracticeHistory = sqliteTable("verb_practice_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  verb: text("verb").notNull(),
  mode: text("mode").notNull(),
  result: text("result", { enum: practiceResult }).notNull(),
  attemptedAnswer: text("attempted_answer").notNull(),
  timeSpent: integer("time_spent").notNull(), // in milliseconds
  level: text("level").notNull(),
  deviceId: text("device_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch('now'))`)
    .notNull(),
});

export const verbAnalytics = sqliteTable("verb_analytics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  verb: text("verb").notNull(),
  totalAttempts: integer("total_attempts").notNull().default(0),
  correctAttempts: integer("correct_attempts").notNull().default(0),
  averageTimeSpent: integer("average_time_spent").notNull().default(0), // in milliseconds
  lastPracticedAt: integer("last_practiced_at", { mode: "timestamp" }),
  level: text("level").notNull(),
});

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const insertVerbSchema = createInsertSchema(verbs);
export const selectVerbSchema = createSelectSchema(verbs);
export type InsertVerb = typeof verbs.$inferInsert;
export type SelectVerb = typeof verbs.$inferSelect;

export type VerbPracticeHistory = typeof verbPracticeHistory.$inferSelect;
export type InsertVerbPracticeHistory = typeof verbPracticeHistory.$inferInsert;

export type VerbAnalytics = typeof verbAnalytics.$inferSelect;
export type InsertVerbAnalytics = typeof verbAnalytics.$inferInsert;