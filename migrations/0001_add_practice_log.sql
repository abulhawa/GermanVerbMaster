CREATE TABLE IF NOT EXISTS "practice_log" (
    "id" serial PRIMARY KEY NOT NULL,
    "task_id" text NOT NULL,
    "lexeme_id" text NOT NULL,
    "pos" text NOT NULL,
    "task_type" text NOT NULL,
    "device_id" text,
    "user_id" text,
    "cefr_level" text DEFAULT '__' NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_log"
    ADD CONSTRAINT "practice_log_task_id_task_specs_id_fk"
    FOREIGN KEY ("task_id") REFERENCES "task_specs"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "practice_log"
    ADD CONSTRAINT "practice_log_lexeme_id_lexemes_id_fk"
    FOREIGN KEY ("lexeme_id") REFERENCES "lexemes"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "practice_log"
    ADD CONSTRAINT "practice_log_user_id_auth_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_log_task_idx" ON "practice_log" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_log_pos_idx" ON "practice_log" ("pos");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_log_attempted_idx" ON "practice_log" ("attempted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_log_device_idx" ON "practice_log" ("device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_log_user_idx" ON "practice_log" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "practice_log_user_task_idx"
    ON "practice_log" ("task_id", "user_id", "cefr_level");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "practice_log_device_task_idx"
    ON "practice_log" ("task_id", "device_id", "cefr_level");
