ALTER TABLE "practice_history" DROP CONSTRAINT IF EXISTS "practice_history_user_id_auth_users_id_fk";
ALTER TABLE "practice_log" DROP CONSTRAINT IF EXISTS "practice_log_user_id_auth_users_id_fk";

CREATE TABLE IF NOT EXISTS "user_practice_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "task_id" text NOT NULL,
  "lexeme_id" text NOT NULL,
  "lemma" text NOT NULL,
  "pos" text NOT NULL,
  "task_type" text NOT NULL,
  "renderer" text NOT NULL,
  "device_id" text NOT NULL,
  "result" "practice_result" NOT NULL,
  "submitted_answer" text NOT NULL,
  "correct_answer" text NOT NULL,
  "response_ms" integer NOT NULL,
  "cefr_level" text,
  "hints_used" boolean DEFAULT false NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_practice_history_user_idx" ON "user_practice_history" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_practice_history_task_idx" ON "user_practice_history" USING btree ("task_id");
CREATE INDEX IF NOT EXISTS "user_practice_history_submitted_idx" ON "user_practice_history" USING btree ("submitted_at");
CREATE INDEX IF NOT EXISTS "user_practice_history_device_idx" ON "user_practice_history" USING btree ("device_id");
