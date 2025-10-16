CREATE TYPE "practice_result" AS ENUM ('correct', 'incorrect');
--> statement-breakpoint
CREATE TABLE "content_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"language" text DEFAULT 'de' NOT NULL,
	"pos_scope" text NOT NULL,
	"license" text NOT NULL,
	"license_notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"checksum" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inflections" (
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
CREATE TABLE "lexemes" (
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
CREATE TABLE "pack_lexeme_map" (
	"pack_id" text NOT NULL,
	"lexeme_id" text NOT NULL,
	"primary_task_id" text,
	"position" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_lexeme_map_pack_id_lexeme_id_pk" PRIMARY KEY("pack_id","lexeme_id")
);
--> statement-breakpoint
CREATE TABLE "practice_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"lexeme_id" text NOT NULL,
	"pos" text NOT NULL,
	"task_type" text NOT NULL,
	"renderer" text NOT NULL,
	"device_id" text NOT NULL,
	"user_id" integer,
	"result" "practice_result" NOT NULL,
	"response_ms" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"queued_at" timestamp with time zone,
	"cefr_level" text,
	"pack_id" text,
	"hints_used" boolean DEFAULT false NOT NULL,
	"feature_flags" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"device_id" text NOT NULL,
	"task_id" text NOT NULL,
	"leitner_box" integer DEFAULT 1 NOT NULL,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"correct_attempts" integer DEFAULT 0 NOT NULL,
	"average_response_ms" integer DEFAULT 0 NOT NULL,
	"accuracy_weight" double precision DEFAULT 0 NOT NULL,
	"latency_weight" double precision DEFAULT 0 NOT NULL,
	"stability_weight" double precision DEFAULT 0 NOT NULL,
	"priority_score" double precision DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"last_result" "practice_result" DEFAULT 'correct' NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_specs" (
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
	"source_pack" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry_priorities" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"sampled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"priority_score" double precision NOT NULL,
	"accuracy_weight" double precision DEFAULT 0 NOT NULL,
	"latency_weight" double precision DEFAULT 0 NOT NULL,
	"stability_weight" double precision DEFAULT 0 NOT NULL,
	"frequency_rank" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verb_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"verb" text NOT NULL,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"correct_attempts" integer DEFAULT 0 NOT NULL,
	"average_time_spent" integer DEFAULT 0 NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"level" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verb_practice_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"verb" text NOT NULL,
	"mode" text NOT NULL,
	"result" "practice_result" NOT NULL,
	"attempted_answer" text NOT NULL,
	"time_spent" integer NOT NULL,
	"level" text NOT NULL,
	"device_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verb_review_queues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"device_id" text NOT NULL,
	"version" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone DEFAULT now() NOT NULL,
	"generation_duration_ms" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verb_scheduling_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"device_id" text NOT NULL,
	"verb" text NOT NULL,
	"level" text NOT NULL,
	"leitner_box" integer DEFAULT 1 NOT NULL,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"correct_attempts" integer DEFAULT 0 NOT NULL,
	"average_response_ms" integer DEFAULT 0 NOT NULL,
	"accuracy_weight" double precision DEFAULT 0 NOT NULL,
	"latency_weight" double precision DEFAULT 0 NOT NULL,
	"stability_weight" double precision DEFAULT 0 NOT NULL,
	"priority_score" double precision DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"last_result" "practice_result" DEFAULT 'correct' NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verbs" (
	"id" serial PRIMARY KEY NOT NULL,
	"infinitive" text NOT NULL,
	"english" text NOT NULL,
	"präteritum" text NOT NULL,
	"partizipII" text NOT NULL,
	"auxiliary" text NOT NULL,
	"level" text NOT NULL,
	"präteritumExample" text NOT NULL,
	"partizipIIExample" text NOT NULL,
	"source" jsonb NOT NULL,
	"pattern" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
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
	"canonical" boolean DEFAULT false NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"sources_csv" text,
	"source_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inflections" ADD CONSTRAINT "inflections_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_lexeme_map" ADD CONSTRAINT "pack_lexeme_map_pack_id_content_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."content_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_lexeme_map" ADD CONSTRAINT "pack_lexeme_map_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_lexeme_map" ADD CONSTRAINT "pack_lexeme_map_primary_task_id_task_specs_id_fk" FOREIGN KEY ("primary_task_id") REFERENCES "public"."task_specs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_task_id_task_specs_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_state" ADD CONSTRAINT "scheduling_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_state" ADD CONSTRAINT "scheduling_state_task_id_task_specs_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_specs" ADD CONSTRAINT "task_specs_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_priorities" ADD CONSTRAINT "telemetry_priorities_task_id_task_specs_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verb_practice_history" ADD CONSTRAINT "verb_practice_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verb_review_queues" ADD CONSTRAINT "verb_review_queues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verb_scheduling_state" ADD CONSTRAINT "verb_scheduling_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_packs_slug_unique" ON "content_packs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "inflections_lexeme_form_features_idx" ON "inflections" USING btree ("lexeme_id","form","features");--> statement-breakpoint
CREATE UNIQUE INDEX "lexemes_lemma_pos_idx" ON "lexemes" USING btree ("lemma","pos");--> statement-breakpoint
CREATE INDEX "pack_lexeme_map_lexeme_idx" ON "pack_lexeme_map" USING btree ("lexeme_id");--> statement-breakpoint
CREATE INDEX "practice_history_task_idx" ON "practice_history" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "practice_history_pos_idx" ON "practice_history" USING btree ("pos");--> statement-breakpoint
CREATE INDEX "practice_history_submitted_idx" ON "practice_history" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "practice_history_device_idx" ON "practice_history" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "practice_history_pack_idx" ON "practice_history" USING btree ("pack_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_state_device_task_idx" ON "scheduling_state" USING btree ("device_id","task_id");--> statement-breakpoint
CREATE INDEX "scheduling_state_task_idx" ON "scheduling_state" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "scheduling_state_user_idx" ON "scheduling_state" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_specs_lexeme_type_revision_idx" ON "task_specs" USING btree ("lexeme_id","task_type","revision");--> statement-breakpoint
CREATE INDEX "task_specs_pos_idx" ON "task_specs" USING btree ("pos");--> statement-breakpoint
CREATE INDEX "telemetry_priorities_task_idx" ON "telemetry_priorities" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "telemetry_priorities_sampled_idx" ON "telemetry_priorities" USING btree ("sampled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verb_queue_device_idx" ON "verb_review_queues" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verb_srs_device_verb_idx" ON "verb_scheduling_state" USING btree ("device_id","verb");--> statement-breakpoint
CREATE UNIQUE INDEX "verbs_infinitive_idx" ON "verbs" USING btree ("infinitive");--> statement-breakpoint
CREATE UNIQUE INDEX "words_lemma_pos_idx" ON "words" USING btree ("lemma","pos");