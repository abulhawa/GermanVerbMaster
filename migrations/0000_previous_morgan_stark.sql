DO $$
BEGIN
    CREATE TYPE "public"."enrichment_method" AS ENUM('bulk', 'manual_api', 'manual_entry', 'preexisting');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    CREATE TYPE "public"."user_role" AS ENUM('standard', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    CREATE TYPE "public"."practice_result" AS ENUM('correct', 'incorrect');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"scope" text,
	"password" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_verifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inflections" (
	"id" text PRIMARY KEY NOT NULL,
	"lexeme_id" text NOT NULL,
	"form" text NOT NULL,
	"features" jsonb NOT NULL,
	"audio_asset" text,
	"source_revision" text,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lexemes" (
	"id" text PRIMARY KEY NOT NULL,
	"lemma" text NOT NULL,
	"language" text DEFAULT 'de' NOT NULL,
	"pos" text NOT NULL,
	"gender" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"frequency_rank" integer,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"lexeme_id" text NOT NULL,
	"pos" text NOT NULL,
	"task_type" text NOT NULL,
	"renderer" text NOT NULL,
	"device_id" text NOT NULL,
	"user_id" text,
	"result" "practice_result" NOT NULL,
	"response_ms" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"queued_at" timestamp with time zone,
	"cefr_level" text,
	"hints_used" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_specs" (
	"id" text PRIMARY KEY NOT NULL,
	"lexeme_id" text NOT NULL,
	"pos" text NOT NULL,
	"task_type" text NOT NULL,
	"renderer" text NOT NULL,
	"prompt" jsonb NOT NULL,
	"solution" jsonb NOT NULL,
	"hints" jsonb,
	"metadata" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "words" (
	"id" serial PRIMARY KEY NOT NULL,
	"lemma" text NOT NULL,
	"pos" text NOT NULL,
	"level" text,
	"english" text,
	"example_de" text,
	"example_en" text,
	"gender" text,
	"plural" text,
	"separable" boolean,
	"aux" text,
	"praesens_ich" text,
	"praesens_er" text,
	"praeteritum" text,
	"partizip_ii" text,
	"perfekt" text,
	"comparative" text,
	"superlative" text,
	"approved" boolean DEFAULT false NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"sources_csv" text,
	"source_notes" text,
	"export_uid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"exported_at" timestamp with time zone,
	"translations" jsonb,
	"examples" jsonb,
	"pos_attributes" jsonb,
	"enrichment_applied_at" timestamp with time zone,
	"enrichment_method" "enrichment_method",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "inflections" ADD CONSTRAINT "inflections_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_task_id_task_specs_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_specs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "task_specs" ADD CONSTRAINT "task_specs_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_accounts_provider_account_idx" ON "auth_accounts" USING btree ("provider_id","account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_token_idx" ON "auth_sessions" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_users_email_idx" ON "auth_users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_verifications_value_idx" ON "auth_verifications" USING btree ("value");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inflections_lexeme_form_features_idx" ON "inflections" USING btree ("lexeme_id","form","features");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lexemes_lemma_pos_idx" ON "lexemes" USING btree ("lemma","pos");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_history_task_idx" ON "practice_history" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_history_pos_idx" ON "practice_history" USING btree ("pos");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_history_submitted_idx" ON "practice_history" USING btree ("submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_history_device_idx" ON "practice_history" USING btree ("device_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_specs_lexeme_type_revision_idx" ON "task_specs" USING btree ("lexeme_id","task_type","revision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_specs_pos_idx" ON "task_specs" USING btree ("pos");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "words_lemma_pos_idx" ON "words" USING btree ("lemma","pos");
