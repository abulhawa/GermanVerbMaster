import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@db/schema";

const defaultDatabasePath = join(process.cwd(), "db", "data.sqlite");
const databaseFile = process.env.DATABASE_FILE ?? defaultDatabasePath;

mkdirSync(dirname(databaseFile), { recursive: true });

const sqlite = new Database(databaseFile);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

initializeSchema();

export const db = drizzle(sqlite, { schema });

function initializeSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "username" text NOT NULL UNIQUE,
      "password" text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "words" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "lemma" text NOT NULL,
      "pos" text NOT NULL,
      "level" text,
      "english" text,
      "example_de" text,
      "example_en" text,
      "gender" text,
      "plural" text,
      "separable" integer,
      "aux" text,
      "praesens_ich" text,
      "praesens_er" text,
      "praeteritum" text,
      "partizip_ii" text,
      "perfekt" text,
      "comparative" text,
      "superlative" text,
      "canonical" integer NOT NULL DEFAULT 0,
      "complete" integer NOT NULL DEFAULT 0,
      "sources_csv" text,
      "source_notes" text,
      "created_at" integer NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" integer NOT NULL DEFAULT (unixepoch('now')),
      CONSTRAINT "words_lemma_pos_unique" UNIQUE("lemma", "pos")
    );

    CREATE TABLE IF NOT EXISTS "verbs" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "infinitive" text NOT NULL UNIQUE,
      "english" text NOT NULL,
      "präteritum" text NOT NULL,
      "partizipII" text NOT NULL,
      "auxiliary" text NOT NULL,
      "level" text NOT NULL,
      "präteritumExample" text NOT NULL,
      "partizipIIExample" text NOT NULL,
      "source" text NOT NULL,
      "pattern" text,
      "created_at" integer NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" integer NOT NULL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS "verb_practice_history" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "user_id" integer,
      "verb" text NOT NULL,
      "mode" text NOT NULL,
      "result" text NOT NULL,
      "attempted_answer" text NOT NULL,
      "time_spent" integer NOT NULL,
      "level" text NOT NULL,
      "device_id" text NOT NULL,
      "created_at" integer NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
    );

    CREATE TABLE IF NOT EXISTS "verb_analytics" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "verb" text NOT NULL,
      "total_attempts" integer NOT NULL DEFAULT 0,
      "correct_attempts" integer NOT NULL DEFAULT 0,
      "average_time_spent" integer NOT NULL DEFAULT 0,
      "last_practiced_at" integer,
      "level" text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "verb_scheduling_state" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "user_id" integer,
      "device_id" text NOT NULL,
      "verb" text NOT NULL,
      "level" text NOT NULL,
      "leitner_box" integer NOT NULL DEFAULT 1,
      "total_attempts" integer NOT NULL DEFAULT 0,
      "correct_attempts" integer NOT NULL DEFAULT 0,
      "average_response_ms" integer NOT NULL DEFAULT 0,
      "accuracy_weight" real NOT NULL DEFAULT 0,
      "latency_weight" real NOT NULL DEFAULT 0,
      "stability_weight" real NOT NULL DEFAULT 0,
      "priority_score" real NOT NULL DEFAULT 0,
      "due_at" integer,
      "last_result" text NOT NULL DEFAULT 'correct',
      "last_practiced_at" integer,
      "created_at" integer NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" integer NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
    );

    CREATE TABLE IF NOT EXISTS "verb_review_queues" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "user_id" integer,
      "device_id" text NOT NULL,
      "version" text NOT NULL,
      "generated_at" integer NOT NULL DEFAULT (unixepoch('now')),
      "valid_until" integer NOT NULL DEFAULT (unixepoch('now')),
      "generation_duration_ms" integer NOT NULL DEFAULT 0,
      "item_count" integer NOT NULL DEFAULT 0,
      "items" text NOT NULL,
      "created_at" integer NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" integer NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
    );

    CREATE TABLE IF NOT EXISTS "integration_partners" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "name" text NOT NULL,
      "api_key_hash" text NOT NULL UNIQUE,
      "contact_email" text,
      "allowed_origins" text,
      "scopes" text NOT NULL DEFAULT '[]',
      "notes" text,
      "created_at" integer NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" integer NOT NULL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS "integration_usage" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "partner_id" integer NOT NULL,
      "endpoint" text NOT NULL,
      "method" text NOT NULL,
      "status_code" integer NOT NULL,
      "request_id" text NOT NULL,
      "response_time_ms" integer NOT NULL DEFAULT 0,
      "user_agent" text,
      "requested_at" integer NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("partner_id") REFERENCES "integration_partners"("id") ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username");
    CREATE UNIQUE INDEX IF NOT EXISTS "words_lemma_pos_idx" ON "words" ("lemma", "pos");
    CREATE UNIQUE INDEX IF NOT EXISTS "verbs_infinitive_idx" ON "verbs" ("infinitive");
    CREATE INDEX IF NOT EXISTS "verb_practice_history_user_idx" ON "verb_practice_history" ("user_id");
    CREATE INDEX IF NOT EXISTS "verb_analytics_verb_idx" ON "verb_analytics" ("verb");
    CREATE UNIQUE INDEX IF NOT EXISTS "integration_partners_api_key_idx" ON "integration_partners" ("api_key_hash");
    CREATE UNIQUE INDEX IF NOT EXISTS "verb_srs_device_verb_idx" ON "verb_scheduling_state" ("device_id", "verb");
    CREATE UNIQUE INDEX IF NOT EXISTS "verb_queue_device_idx" ON "verb_review_queues" ("device_id");
  `);

  const practiceHistoryColumns = sqlite
    .prepare(`PRAGMA table_info('verb_practice_history');`)
    .all() as Array<{ name?: string }>;
  const hasDeviceId = practiceHistoryColumns.some(column => column?.name === "device_id");

  if (!hasDeviceId) {
    sqlite.exec(
      `ALTER TABLE "verb_practice_history" ADD COLUMN "device_id" text NOT NULL DEFAULT 'legacy-device';`
    );
  }
}
