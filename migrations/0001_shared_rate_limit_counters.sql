CREATE TABLE "rate_limit_counters" (
  "key" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "hits" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rate_limit_counters_key_window_start_pk" PRIMARY KEY ("key", "window_start")
);
--> statement-breakpoint
CREATE INDEX "rate_limit_counters_expires_idx" ON "rate_limit_counters" ("expires_at");
