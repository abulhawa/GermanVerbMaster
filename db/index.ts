import Database from "better-sqlite3";
import type { Database as SQLiteDatabase } from "better-sqlite3";
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

initializeSchema(sqlite);

export const db = drizzle(sqlite, { schema });

function initializeSchema(connection: SQLiteDatabase) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "username" TEXT NOT NULL,
      "password" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "words" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "lemma" TEXT NOT NULL,
      "pos" TEXT NOT NULL,
      "level" TEXT,
      "english" TEXT,
      "example_de" TEXT,
      "example_en" TEXT,
      "gender" TEXT,
      "plural" TEXT,
      "separable" INTEGER,
      "aux" TEXT,
      "praesens_ich" TEXT,
      "praesens_er" TEXT,
      "praeteritum" TEXT,
      "partizip_ii" TEXT,
      "perfekt" TEXT,
      "comparative" TEXT,
      "superlative" TEXT,
      "canonical" INTEGER NOT NULL DEFAULT 0,
      "complete" INTEGER NOT NULL DEFAULT 0,
      "sources_csv" TEXT,
      "source_notes" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS "verbs" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "infinitive" TEXT NOT NULL,
      "english" TEXT NOT NULL,
      "praeteritum" TEXT NOT NULL,
      "partizipII" TEXT NOT NULL,
      "auxiliary" TEXT NOT NULL,
      "level" TEXT NOT NULL,
      "praeteritumExample" TEXT NOT NULL,
      "partizipIIExample" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "pattern" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS "verb_practice_history" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "user_id" INTEGER,
      "verb" TEXT NOT NULL,
      "mode" TEXT NOT NULL,
      "result" TEXT NOT NULL,
      "attempted_answer" TEXT NOT NULL,
      "time_spent" INTEGER NOT NULL,
      "level" TEXT NOT NULL,
      "device_id" TEXT NOT NULL,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
    );

    CREATE TABLE IF NOT EXISTS "verb_analytics" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "verb" TEXT NOT NULL,
      "total_attempts" INTEGER NOT NULL DEFAULT 0,
      "correct_attempts" INTEGER NOT NULL DEFAULT 0,
      "average_time_spent" INTEGER NOT NULL DEFAULT 0,
      "last_practiced_at" INTEGER,
      "level" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "verb_scheduling_state" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "user_id" INTEGER,
      "device_id" TEXT NOT NULL,
      "verb" TEXT NOT NULL,
      "level" TEXT NOT NULL,
      "leitner_box" INTEGER NOT NULL DEFAULT 1,
      "total_attempts" INTEGER NOT NULL DEFAULT 0,
      "correct_attempts" INTEGER NOT NULL DEFAULT 0,
      "average_response_ms" INTEGER NOT NULL DEFAULT 0,
      "accuracy_weight" REAL NOT NULL DEFAULT 0,
      "latency_weight" REAL NOT NULL DEFAULT 0,
      "stability_weight" REAL NOT NULL DEFAULT 0,
      "priority_score" REAL NOT NULL DEFAULT 0,
      "due_at" INTEGER,
      "last_result" TEXT NOT NULL DEFAULT 'correct',
      "last_practiced_at" INTEGER,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
    );

    CREATE TABLE IF NOT EXISTS "verb_review_queues" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "user_id" INTEGER,
      "device_id" TEXT NOT NULL,
      "version" TEXT NOT NULL,
      "generated_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "valid_until" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "generation_duration_ms" INTEGER NOT NULL DEFAULT 0,
      "item_count" INTEGER NOT NULL DEFAULT 0,
      "items" TEXT NOT NULL,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
    );

    CREATE TABLE IF NOT EXISTS "integration_partners" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "api_key_hash" TEXT NOT NULL,
      "contact_email" TEXT,
      "allowed_origins" TEXT,
      "scopes" TEXT NOT NULL DEFAULT '[]',
      "notes" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS "integration_usage" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "partner_id" INTEGER NOT NULL,
      "endpoint" TEXT NOT NULL,
      "method" TEXT NOT NULL,
      "status_code" INTEGER NOT NULL,
      "request_id" TEXT NOT NULL,
      "response_time_ms" INTEGER NOT NULL DEFAULT 0,
      "user_agent" TEXT,
      "requested_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("partner_id") REFERENCES "integration_partners"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "lexemes" (
      "id" TEXT PRIMARY KEY,
      "lemma" TEXT NOT NULL,
      "language" TEXT NOT NULL DEFAULT 'de',
      "pos" TEXT NOT NULL,
      "gender" TEXT,
      "metadata" TEXT NOT NULL DEFAULT '{}',
      "frequency_rank" INTEGER,
      "source_ids" TEXT NOT NULL DEFAULT '[]',
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS "inflections" (
      "id" TEXT PRIMARY KEY,
      "lexeme_id" TEXT NOT NULL,
      "form" TEXT NOT NULL,
      "features" TEXT NOT NULL,
      "audio_asset" TEXT,
      "source_revision" TEXT,
      "checksum" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("lexeme_id") REFERENCES "lexemes"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "task_specs" (
      "id" TEXT PRIMARY KEY,
      "lexeme_id" TEXT NOT NULL,
      "pos" TEXT NOT NULL,
      "task_type" TEXT NOT NULL,
      "renderer" TEXT NOT NULL,
      "prompt" TEXT NOT NULL,
      "solution" TEXT NOT NULL,
      "hints" TEXT,
      "metadata" TEXT,
      "revision" INTEGER NOT NULL DEFAULT 1,
      "source_pack" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("lexeme_id") REFERENCES "lexemes"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "scheduling_state" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "user_id" INTEGER,
      "device_id" TEXT NOT NULL,
      "task_id" TEXT NOT NULL,
      "leitner_box" INTEGER NOT NULL DEFAULT 1,
      "total_attempts" INTEGER NOT NULL DEFAULT 0,
      "correct_attempts" INTEGER NOT NULL DEFAULT 0,
      "average_response_ms" INTEGER NOT NULL DEFAULT 0,
      "accuracy_weight" REAL NOT NULL DEFAULT 0,
      "latency_weight" REAL NOT NULL DEFAULT 0,
      "stability_weight" REAL NOT NULL DEFAULT 0,
      "priority_score" REAL NOT NULL DEFAULT 0,
      "due_at" INTEGER,
      "last_result" TEXT NOT NULL DEFAULT 'correct',
      "last_practiced_at" INTEGER,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id"),
      FOREIGN KEY ("task_id") REFERENCES "task_specs"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "content_packs" (
      "id" TEXT PRIMARY KEY,
      "slug" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "language" TEXT NOT NULL DEFAULT 'de',
      "pos_scope" TEXT NOT NULL,
      "license" TEXT NOT NULL,
      "license_notes" TEXT,
      "version" INTEGER NOT NULL DEFAULT 1,
      "checksum" TEXT,
      "metadata" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS "pack_lexeme_map" (
      "pack_id" TEXT NOT NULL,
      "lexeme_id" TEXT NOT NULL,
      "primary_task_id" TEXT,
      "position" INTEGER,
      "notes" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "updated_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      PRIMARY KEY ("pack_id", "lexeme_id"),
      FOREIGN KEY ("pack_id") REFERENCES "content_packs"("id") ON DELETE CASCADE,
      FOREIGN KEY ("lexeme_id") REFERENCES "lexemes"("id") ON DELETE CASCADE,
      FOREIGN KEY ("primary_task_id") REFERENCES "task_specs"("id")
    );

    CREATE TABLE IF NOT EXISTS "telemetry_priorities" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "task_id" TEXT NOT NULL,
      "sampled_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      "priority_score" REAL NOT NULL,
      "accuracy_weight" REAL NOT NULL DEFAULT 0,
      "latency_weight" REAL NOT NULL DEFAULT 0,
      "stability_weight" REAL NOT NULL DEFAULT 0,
      "frequency_rank" INTEGER,
      "metadata" TEXT,
      "created_at" INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY ("task_id") REFERENCES "task_specs"("id") ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username");
    CREATE UNIQUE INDEX IF NOT EXISTS "words_lemma_pos_idx" ON "words" ("lemma", "pos");
    CREATE UNIQUE INDEX IF NOT EXISTS "verbs_infinitive_idx" ON "verbs" ("infinitive");
    CREATE INDEX IF NOT EXISTS "verb_practice_history_user_idx" ON "verb_practice_history" ("user_id");
    CREATE INDEX IF NOT EXISTS "verb_analytics_verb_idx" ON "verb_analytics" ("verb");
    CREATE UNIQUE INDEX IF NOT EXISTS "verb_srs_device_verb_idx" ON "verb_scheduling_state" ("device_id", "verb");
    CREATE UNIQUE INDEX IF NOT EXISTS "verb_queue_device_idx" ON "verb_review_queues" ("device_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "integration_partners_api_key_idx" ON "integration_partners" ("api_key_hash");
    CREATE UNIQUE INDEX IF NOT EXISTS "lexemes_lemma_pos_idx" ON "lexemes" ("lemma", "pos");
    CREATE UNIQUE INDEX IF NOT EXISTS "inflections_lexeme_form_features_idx"
      ON "inflections" ("lexeme_id", "form", "features");
    CREATE UNIQUE INDEX IF NOT EXISTS "task_specs_lexeme_type_revision_idx"
      ON "task_specs" ("lexeme_id", "task_type", "revision");
    CREATE INDEX IF NOT EXISTS "task_specs_pos_idx" ON "task_specs" ("pos");
    CREATE UNIQUE INDEX IF NOT EXISTS "scheduling_state_device_task_idx"
      ON "scheduling_state" ("device_id", "task_id");
    CREATE INDEX IF NOT EXISTS "scheduling_state_task_idx" ON "scheduling_state" ("task_id");
    CREATE INDEX IF NOT EXISTS "scheduling_state_user_idx" ON "scheduling_state" ("user_id");
    CREATE INDEX IF NOT EXISTS "pack_lexeme_map_lexeme_idx" ON "pack_lexeme_map" ("lexeme_id");
    CREATE INDEX IF NOT EXISTS "telemetry_priorities_task_idx" ON "telemetry_priorities" ("task_id");
    CREATE INDEX IF NOT EXISTS "telemetry_priorities_sampled_idx" ON "telemetry_priorities" ("sampled_at");
  `);

  const practiceHistoryColumns = connection
    .prepare("PRAGMA table_info('verb_practice_history');")
    .all() as Array<{ name?: string }>;

  if (!practiceHistoryColumns.some(column => column?.name === "device_id")) {
    connection.exec(
      "ALTER TABLE \"verb_practice_history\" ADD COLUMN \"device_id\" TEXT NOT NULL DEFAULT 'legacy-device';"
    );
  }
}
