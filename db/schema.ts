import type { AdaptiveQueueItem, GermanVerb, PracticeResult } from "@shared";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const practiceResult = ["correct", "incorrect"] as const satisfies ReadonlyArray<PracticeResult>;
const practiceResultEnum = pgEnum("practice_result", practiceResult);

export const integrationPartners = pgTable("integration_partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  contactEmail: text("contact_email"),
  allowedOrigins: jsonb("allowed_origins").$type<string[] | null>(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({ columns: [table.key, table.windowStart], name: "rate_limit_counters_key_window_start_pk" }),
    expiresIndex: index("rate_limit_counters_expires_idx").on(table.expiresAt),
  }),
);

export const integrationUsage = pgTable("integration_usage", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id")
    .notNull()
    .references(() => integrationPartners.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  requestId: text("request_id").notNull(),
  responseTimeMs: integer("response_time_ms").notNull().default(0),
  userAgent: text("user_agent"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const words = pgTable(
  "words",
  {
    id: serial("id").primaryKey(),
    lemma: text("lemma").notNull(),
    pos: text("pos").notNull(),
    level: text("level"),
    english: text("english"),
    exampleDe: text("example_de"),
    exampleEn: text("example_en"),
    gender: text("gender"),
    plural: text("plural"),
    separable: boolean("separable"),
    aux: text("aux"),
    praesensIch: text("praesens_ich"),
    praesensEr: text("praesens_er"),
    praeteritum: text("praeteritum"),
    partizipIi: text("partizip_ii"),
    perfekt: text("perfekt"),
    comparative: text("comparative"),
    superlative: text("superlative"),
    canonical: boolean("canonical").default(false).notNull(),
    complete: boolean("complete").default(false).notNull(),
    sourcesCsv: text("sources_csv"),
    sourceNotes: text("source_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lemmaPosIndex: uniqueIndex("words_lemma_pos_idx").on(table.lemma, table.pos),
  }),
);

export const lexemes = pgTable(
  "lexemes",
  {
    id: text("id").primaryKey(),
    lemma: text("lemma").notNull(),
    language: text("language").notNull().default("de"),
    pos: text("pos").notNull(),
    gender: text("gender"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    frequencyRank: integer("frequency_rank"),
    sourceIds: jsonb("source_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lemmaPosIndex: uniqueIndex("lexemes_lemma_pos_idx").on(table.lemma, table.pos),
  }),
);

export const inflections = pgTable(
  "inflections",
  {
    id: text("id").primaryKey(),
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    form: text("form").notNull(),
    features: jsonb("features")
      .$type<Record<string, unknown>>()
      .notNull(),
    audioAsset: text("audio_asset"),
    sourceRevision: text("source_revision"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lexemeFormFeaturesIndex: uniqueIndex("inflections_lexeme_form_features_idx").on(
      table.lexemeId,
      table.form,
      table.features,
    ),
  }),
);

export const taskSpecs = pgTable(
  "task_specs",
  {
    id: text("id").primaryKey(),
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    pos: text("pos").notNull(),
    taskType: text("task_type").notNull(),
    renderer: text("renderer").notNull(),
    prompt: jsonb("prompt").$type<Record<string, unknown>>().notNull(),
    solution: jsonb("solution").$type<Record<string, unknown>>().notNull(),
    hints: jsonb("hints").$type<unknown[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    revision: integer("revision").notNull().default(1),
    sourcePack: text("source_pack"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const schedulingState = pgTable(
  "scheduling_state",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    deviceId: text("device_id").notNull(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskSpecs.id, { onDelete: "cascade" }),
    leitnerBox: integer("leitner_box").notNull().default(1),
    totalAttempts: integer("total_attempts").notNull().default(0),
    correctAttempts: integer("correct_attempts").notNull().default(0),
    averageResponseMs: integer("average_response_ms").notNull().default(0),
    accuracyWeight: doublePrecision("accuracy_weight").notNull().default(0),
    latencyWeight: doublePrecision("latency_weight").notNull().default(0),
    stabilityWeight: doublePrecision("stability_weight").notNull().default(0),
    priorityScore: doublePrecision("priority_score").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    lastResult: practiceResultEnum("last_result").notNull().default("correct"),
    lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const contentPacks = pgTable(
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
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIndex: uniqueIndex("content_packs_slug_unique").on(table.slug),
  }),
);

export const packLexemeMap = pgTable(
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.packId, table.lexemeId], name: "pack_lexeme_map_pack_id_lexeme_id_pk" }),
    lexemeIndex: index("pack_lexeme_map_lexeme_idx").on(table.lexemeId),
  }),
);

export const telemetryPriorities = pgTable(
  "telemetry_priorities",
  {
    id: serial("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskSpecs.id, { onDelete: "cascade" }),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).defaultNow().notNull(),
    priorityScore: doublePrecision("priority_score").notNull(),
    accuracyWeight: doublePrecision("accuracy_weight").notNull().default(0),
    latencyWeight: doublePrecision("latency_weight").notNull().default(0),
    stabilityWeight: doublePrecision("stability_weight").notNull().default(0),
    frequencyRank: integer("frequency_rank"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    taskIndex: index("telemetry_priorities_task_idx").on(table.taskId),
    sampledIndex: index("telemetry_priorities_sampled_idx").on(table.sampledAt),
  }),
);

export const practiceHistory = pgTable(
  "practice_history",
  {
    id: serial("id").primaryKey(),
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
    result: practiceResultEnum("result").notNull(),
    responseMs: integer("response_ms").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    cefrLevel: text("cefr_level"),
    packId: text("pack_id"),
    hintsUsed: boolean("hints_used").notNull().default(false),
    featureFlags: jsonb("feature_flags").$type<
      Record<string, { enabled: boolean; stage?: string; defaultValue?: boolean }>
    >(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    taskIndex: index("practice_history_task_idx").on(table.taskId),
    posIndex: index("practice_history_pos_idx").on(table.pos),
    submittedIndex: index("practice_history_submitted_idx").on(table.submittedAt),
    deviceIndex: index("practice_history_device_idx").on(table.deviceId),
    packIndex: index("practice_history_pack_idx").on(table.packId),
  }),
);

export const verbs = pgTable(
  "verbs",
  {
    id: serial("id").primaryKey(),
    infinitive: text("infinitive").notNull(),
    english: text("english").notNull(),
    praeteritum: text("präteritum").notNull(),
    partizipIi: text("partizipII").notNull(),
    auxiliary: text("auxiliary").notNull(),
    level: text("level").notNull(),
    praeteritumExample: text("präteritumExample").notNull(),
    partizipIiExample: text("partizipIIExample").notNull(),
    source: jsonb("source").$type<GermanVerb["source"]>().notNull(),
    pattern: jsonb("pattern").$type<GermanVerb["pattern"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    infinitiveIndex: uniqueIndex("verbs_infinitive_idx").on(table.infinitive),
  }),
);

export const verbPracticeHistory = pgTable("verb_practice_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  verb: text("verb").notNull(),
  mode: text("mode").notNull(),
  result: practiceResultEnum("result").notNull(),
  attemptedAnswer: text("attempted_answer").notNull(),
  timeSpent: integer("time_spent").notNull(),
  level: text("level").notNull(),
  deviceId: text("device_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verbAnalytics = pgTable("verb_analytics", {
  id: serial("id").primaryKey(),
  verb: text("verb").notNull(),
  totalAttempts: integer("total_attempts").notNull().default(0),
  correctAttempts: integer("correct_attempts").notNull().default(0),
  averageTimeSpent: integer("average_time_spent").notNull().default(0),
  lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
  level: text("level").notNull(),
});

export const verbSchedulingState = pgTable(
  "verb_scheduling_state",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    deviceId: text("device_id").notNull(),
    verb: text("verb").notNull(),
    level: text("level").notNull(),
    leitnerBox: integer("leitner_box").notNull().default(1),
    totalAttempts: integer("total_attempts").notNull().default(0),
    correctAttempts: integer("correct_attempts").notNull().default(0),
    averageResponseMs: integer("average_response_ms").notNull().default(0),
    accuracyWeight: doublePrecision("accuracy_weight").notNull().default(0),
    latencyWeight: doublePrecision("latency_weight").notNull().default(0),
    stabilityWeight: doublePrecision("stability_weight").notNull().default(0),
    priorityScore: doublePrecision("priority_score").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    lastResult: practiceResultEnum("last_result").notNull().default("correct"),
    lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    deviceVerbIndex: uniqueIndex("verb_srs_device_verb_idx").on(table.deviceId, table.verb),
  }),
);

export const verbReviewQueues = pgTable(
  "verb_review_queues",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    deviceId: text("device_id").notNull(),
    version: text("version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }).defaultNow().notNull(),
    generationDurationMs: integer("generation_duration_ms").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    items: jsonb("items").$type<AdaptiveQueueItem[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
