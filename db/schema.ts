import type { AdaptiveQueueItem, GermanVerb, PracticeResult } from "@shared";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

export const lexemes = sqliteTable(
  "lexemes",
  {
    id: text("id").primaryKey(),
    lemma: text("lemma").notNull(),
    language: text("language").notNull().default("de"),
    pos: text("pos").notNull(),
    gender: text("gender"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    frequencyRank: integer("frequency_rank"),
    sourceIds: text("source_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    lemmaPosIndex: uniqueIndex("lexemes_lemma_pos_idx").on(table.lemma, table.pos),
  }),
);

export const inflections = sqliteTable(
  "inflections",
  {
    id: text("id").primaryKey(),
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    form: text("form").notNull(),
    features: text("features", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    audioAsset: text("audio_asset"),
    sourceRevision: text("source_revision"),
    checksum: text("checksum"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    lexemeFormFeaturesIndex: uniqueIndex("inflections_lexeme_form_features_idx").on(
      table.lexemeId,
      table.form,
      table.features,
    ),
  }),
);

export const taskSpecs = sqliteTable(
  "task_specs",
  {
    id: text("id").primaryKey(),
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    pos: text("pos").notNull(),
    taskType: text("task_type").notNull(),
    renderer: text("renderer").notNull(),
    prompt: text("prompt", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    solution: text("solution", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    hints: text("hints", { mode: "json" }).$type<unknown[]>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    revision: integer("revision").notNull().default(1),
    sourcePack: text("source_pack"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    lexemeTypeRevisionIndex: uniqueIndex("task_specs_lexeme_type_revision_idx").on(
      table.lexemeId,
      table.taskType,
      table.revision,
    ),
    posIndex: index("task_specs_pos_idx").on(table.pos),
  }),
);

export const schedulingState = sqliteTable(
  "scheduling_state",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    deviceId: text("device_id").notNull(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskSpecs.id, { onDelete: "cascade" }),
    leitnerBox: integer("leitner_box").notNull().default(1),
    totalAttempts: integer("total_attempts").notNull().default(0),
    correctAttempts: integer("correct_attempts").notNull().default(0),
    averageResponseMs: integer("average_response_ms").notNull().default(0),
    accuracyWeight: real("accuracy_weight").notNull().default(0),
    latencyWeight: real("latency_weight").notNull().default(0),
    stabilityWeight: real("stability_weight").notNull().default(0),
    priorityScore: real("priority_score").notNull().default(0),
    dueAt: integer("due_at", { mode: "timestamp" }),
    lastResult: text("last_result", { enum: practiceResult }).notNull().default("correct"),
    lastPracticedAt: integer("last_practiced_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    deviceTaskIndex: uniqueIndex("scheduling_state_device_task_idx").on(
      table.deviceId,
      table.taskId,
    ),
    taskIndex: index("scheduling_state_task_idx").on(table.taskId),
    userIndex: index("scheduling_state_user_idx").on(table.userId),
  }),
);

export const contentPacks = sqliteTable(
  "content_packs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    language: text("language").notNull().default("de"),
    posScope: text("pos_scope").notNull(),
    license: text("license").notNull(),
    licenseNotes: text("license_notes"),
    version: integer("version").notNull().default(1),
    checksum: text("checksum"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    slugIndex: uniqueIndex("content_packs_slug_unique").on(table.slug),
  }),
);

export const packLexemeMap = sqliteTable(
  "pack_lexeme_map",
  {
    packId: text("pack_id")
      .notNull()
      .references(() => contentPacks.id, { onDelete: "cascade" }),
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    primaryTaskId: text("primary_task_id").references(() => taskSpecs.id),
    position: integer("position"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.packId, table.lexemeId], name: "pack_lexeme_map_pack_id_lexeme_id_pk" }),
    lexemeIndex: index("pack_lexeme_map_lexeme_idx").on(table.lexemeId),
  }),
);

export const telemetryPriorities = sqliteTable(
  "telemetry_priorities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: text("task_id")
      .notNull()
      .references(() => taskSpecs.id, { onDelete: "cascade" }),
    sampledAt: integer("sampled_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    priorityScore: real("priority_score").notNull(),
    accuracyWeight: real("accuracy_weight").notNull().default(0),
    latencyWeight: real("latency_weight").notNull().default(0),
    stabilityWeight: real("stability_weight").notNull().default(0),
    frequencyRank: integer("frequency_rank"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    taskIndex: index("telemetry_priorities_task_idx").on(table.taskId),
    sampledIndex: index("telemetry_priorities_sampled_idx").on(table.sampledAt),
  }),
);

export const practiceHistory = sqliteTable(
  "practice_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: text("task_id")
      .notNull()
      .references(() => taskSpecs.id, { onDelete: "cascade" }),
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    pos: text("pos").notNull(),
    taskType: text("task_type").notNull(),
    renderer: text("renderer").notNull(),
    deviceId: text("device_id").notNull(),
    userId: integer("user_id").references(() => users.id),
    result: text("result", { enum: practiceResult }).notNull(),
    responseMs: integer("response_ms").notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    answeredAt: integer("answered_at", { mode: "timestamp" }),
    queuedAt: integer("queued_at", { mode: "timestamp" }),
    cefrLevel: text("cefr_level"),
    packId: text("pack_id"),
    hintsUsed: integer("hints_used", { mode: "boolean" }).notNull().default(false),
    featureFlags: text("feature_flags", { mode: "json" }).$type<
      Record<string, { enabled: boolean; stage?: string; defaultValue?: boolean }>
    >(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    taskIndex: index("practice_history_task_idx").on(table.taskId),
    posIndex: index("practice_history_pos_idx").on(table.pos),
    submittedIndex: index("practice_history_submitted_idx").on(table.submittedAt),
    deviceIndex: index("practice_history_device_idx").on(table.deviceId),
    packIndex: index("practice_history_pack_idx").on(table.packId),
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

export const verbSchedulingState = sqliteTable(
  "verb_scheduling_state",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    deviceId: text("device_id").notNull(),
    verb: text("verb").notNull(),
    level: text("level").notNull(),
    leitnerBox: integer("leitner_box").notNull().default(1),
    totalAttempts: integer("total_attempts").notNull().default(0),
    correctAttempts: integer("correct_attempts").notNull().default(0),
    averageResponseMs: integer("average_response_ms").notNull().default(0),
    accuracyWeight: real("accuracy_weight").notNull().default(0),
    latencyWeight: real("latency_weight").notNull().default(0),
    stabilityWeight: real("stability_weight").notNull().default(0),
    priorityScore: real("priority_score").notNull().default(0),
    dueAt: integer("due_at", { mode: "timestamp" }),
    lastResult: text("last_result", { enum: practiceResult }).notNull().default("correct"),
    lastPracticedAt: integer("last_practiced_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    deviceVerbIndex: uniqueIndex("verb_srs_device_verb_idx").on(table.deviceId, table.verb),
  }),
);

export const verbReviewQueues = sqliteTable(
  "verb_review_queues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    deviceId: text("device_id").notNull(),
    version: text("version").notNull(),
    generatedAt: integer("generated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    validUntil: integer("valid_until", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    generationDurationMs: integer("generation_duration_ms").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    items: text("items", { mode: "json" }).$type<AdaptiveQueueItem[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch('now'))`)
      .notNull(),
  },
  (table) => ({
    deviceIndex: uniqueIndex("verb_queue_device_idx").on(table.deviceId),
  }),
);

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
export type PracticeHistory = typeof practiceHistory.$inferSelect;
export type InsertPracticeHistory = typeof practiceHistory.$inferInsert;

export type VerbSchedulingState = typeof verbSchedulingState.$inferSelect;
export type InsertVerbSchedulingState = typeof verbSchedulingState.$inferInsert;

export type VerbReviewQueue = typeof verbReviewQueues.$inferSelect;
export type InsertVerbReviewQueue = typeof verbReviewQueues.$inferInsert;

export type IntegrationPartner = typeof integrationPartners.$inferSelect;
export type InsertIntegrationPartner = typeof integrationPartners.$inferInsert;

export type IntegrationUsage = typeof integrationUsage.$inferSelect;
export type InsertIntegrationUsage = typeof integrationUsage.$inferInsert;
