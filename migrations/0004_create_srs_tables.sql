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

CREATE UNIQUE INDEX IF NOT EXISTS "verb_srs_device_verb_idx" ON "verb_scheduling_state" ("device_id", "verb");

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

CREATE UNIQUE INDEX IF NOT EXISTS "verb_queue_device_idx" ON "verb_review_queues" ("device_id");
