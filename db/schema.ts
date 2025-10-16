import type { PracticeResult, WordExample, WordPosAttributes, WordTranslation } from "@shared";
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
  uuid,
} from "drizzle-orm/pg-core";

const practiceResult = ["correct", "incorrect"] as const satisfies ReadonlyArray<PracticeResult>;
const practiceResultEnum = pgEnum("practice_result", practiceResult);
export const userRoleEnum = pgEnum("user_role", ["standard", "admin"]);
export const enrichmentMethodEnum = pgEnum("enrichment_method", [
  "bulk",
  "manual_api",
  "manual_entry",
  "preexisting",
]);

export const authUsers = pgTable(
  "auth_users",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRoleEnum("role").notNull().default("standard"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("auth_users_email_idx").on(table.email)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    scope: text("scope"),
    password: text("password"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_idx").on(table.providerId, table.accountId),
    index("auth_accounts_user_id_idx").on(table.userId),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    token: text("token").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_idx").on(table.token),
    index("auth_sessions_user_id_idx").on(table.userId),
  ],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_verifications_identifier_idx").on(table.identifier),
    index("auth_verifications_value_idx").on(table.value),
  ],
);

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
    approved: boolean("approved").default(false).notNull(),
    complete: boolean("complete").default(false).notNull(),
    sourcesCsv: text("sources_csv"),
    sourceNotes: text("source_notes"),
    exportUid: uuid("export_uid").default(sql`gen_random_uuid()`).notNull(),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    translations: jsonb("translations").$type<
      | Array<{
          value: string;
          source?: string | null;
          language?: string | null;
          confidence?: number | null;
        }>
      | null
    >(),
    examples: jsonb("examples").$type<
      | Array<{
          sentence?: string | null;
          translations?: Record<string, string | null | undefined> | null;
          exampleDe?: string | null;
          exampleEn?: string | null;
        }>
      | null
    >(),
    posAttributes: jsonb("pos_attributes").$type<WordPosAttributes | null>(),
    enrichmentAppliedAt: timestamp("enrichment_applied_at", { withTimezone: true }),
    enrichmentMethod: enrichmentMethodEnum("enrichment_method"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("words_lemma_pos_idx").on(table.lemma, table.pos)],
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
  (table) => [uniqueIndex("lexemes_lemma_pos_idx").on(table.lemma, table.pos)],
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
  (table) => [
    uniqueIndex("inflections_lexeme_form_features_idx").on(
      table.lexemeId,
      table.form,
      table.features,
    ),
  ],
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("task_specs_lexeme_type_revision_idx").on(
      table.lexemeId,
      table.taskType,
      table.revision,
    ),
    index("task_specs_pos_idx").on(table.pos),
  ],
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
    userId: text("user_id").references(() => authUsers.id),
    result: practiceResultEnum("result").notNull(),
    responseMs: integer("response_ms").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    cefrLevel: text("cefr_level"),
    hintsUsed: boolean("hints_used").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("practice_history_task_idx").on(table.taskId),
    index("practice_history_pos_idx").on(table.pos),
    index("practice_history_submitted_idx").on(table.submittedAt),
    index("practice_history_device_idx").on(table.deviceId),
  ],
);

export const insertWordSchema = createInsertSchema(words);
export const selectWordSchema = createSelectSchema(words);
export type InsertWord = typeof words.$inferInsert;
export type Word = typeof words.$inferSelect;

export type PracticeHistory = typeof practiceHistory.$inferSelect;
export type InsertPracticeHistory = typeof practiceHistory.$inferInsert;

