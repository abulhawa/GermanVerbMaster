CREATE TABLE IF NOT EXISTS "users" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "username" text NOT NULL UNIQUE,
  "password" text NOT NULL
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

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username");
CREATE UNIQUE INDEX IF NOT EXISTS "verbs_infinitive_idx" ON "verbs" ("infinitive");
CREATE INDEX IF NOT EXISTS "verb_practice_history_user_idx" ON "verb_practice_history" ("user_id");
CREATE INDEX IF NOT EXISTS "verb_analytics_verb_idx" ON "verb_analytics" ("verb");
