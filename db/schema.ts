import type { GermanVerb, PracticeResult } from "@shared";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const integrationPartners = sqliteTable("integration_partners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  contactEmail: text("contact_email"),
  allowedOrigins: text("allowed_origins", { mode: "json" }).$type<string[] | null>(),
  scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch('now'))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch('now'))`)
    .notNull(),
});

export const integrationUsage = sqliteTable("integration_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partnerId: integer("partner_id")
    .notNull()
    .references(() => integrationPartners.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  requestId: text("request_id").notNull(),
  responseTimeMs: integer("response_time_ms").notNull().default(0),
  userAgent: text("user_agent"),
  requestedAt: integer("requested_at", { mode: "timestamp" })
    .default(sql`(unixepoch('now'))`)
    .notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

const practiceResult = ["correct", "incorrect"] as const satisfies ReadonlyArray<PracticeResult>;

export const words = sqliteTable(
  "words",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lemma: text("lemma").notNull(),
    pos: text("pos").notNull(),
    level: text("level"),
    english: text("english"),
    exampleDe: text("example_de"),
    exampleEn: text("example_en"),
    gender: text("gender"),
    plural: text("plural"),
    separable: integer("separable", { mode: "boolean" }),
    aux: text("aux"),
    praesensIch: text("praesens_ich"),
    praesensEr: text("praesens_er"),
    praeteritum: text("praeteritum"),
    partizipIi: text("partizip_ii"),
    perfekt: text("perfekt"),
    comparative: text("comparative"),
    superlative: text("superlative"),
    canonical: integer("canonical", { mode: "boolean" })
      .default(false)
      .notNull(),
    complete: integer("complete", { mode: "boolean" })
      .default(false)
      .notNull(),
    sourcesCsv: text("sources_csv"),
    sourceNotes: text("source_notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    lemmaPosIndex: uniqueIndex("words_lemma_pos_idx").on(table.lemma, table.pos),
  }),
);

export const verbs = sqliteTable(
  "verbs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    infinitive: text("infinitive").notNull(),
    english: text("english").notNull(),
    praeteritum: text("präteritum").notNull(),
    partizipIi: text("partizipII").notNull(),
    auxiliary: text("auxiliary").notNull(),
    level: text("level").notNull(),
    praeteritumExample: text("präteritumExample").notNull(),
    partizipIiExample: text("partizipIIExample").notNull(),
    source: text("source", { mode: "json" }).$type<GermanVerb["source"]>().notNull(),
    pattern: text("pattern", { mode: "json" }).$type<GermanVerb["pattern"]>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    infinitiveIndex: uniqueIndex("verbs_infinitive_idx").on(table.infinitive),
  }),
);

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

export const insertWordSchema = createInsertSchema(words);
export const selectWordSchema = createSelectSchema(words);
export type InsertWord = typeof words.$inferInsert;
export type Word = typeof words.$inferSelect;

export type InsertVerb = typeof verbs.$inferInsert;
export type Verb = typeof verbs.$inferSelect;

export type VerbPracticeHistory = typeof verbPracticeHistory.$inferSelect;
export type InsertVerbPracticeHistory = typeof verbPracticeHistory.$inferInsert;

export type VerbAnalytics = typeof verbAnalytics.$inferSelect;
export type InsertVerbAnalytics = typeof verbAnalytics.$inferInsert;

export type IntegrationPartner = typeof integrationPartners.$inferSelect;
export type InsertIntegrationPartner = typeof integrationPartners.$inferInsert;

export type IntegrationUsage = typeof integrationUsage.$inferSelect;
export type InsertIntegrationUsage = typeof integrationUsage.$inferInsert;