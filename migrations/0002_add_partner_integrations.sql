CREATE TABLE IF NOT EXISTS "integration_partners" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "partner_id" integer NOT NULL,
  "endpoint" text NOT NULL,
  "method" text NOT NULL,
  "status_code" integer NOT NULL,
  "request_id" text NOT NULL,
  "response_time_ms" integer NOT NULL DEFAULT 0,
  "user_agent" text,
  "requested_at" integer NOT NULL DEFAULT (unixepoch('now')),
  CONSTRAINT "integration_usage_partner_id_integration_partners_id_fk"
    FOREIGN KEY ("partner_id") REFERENCES "integration_partners"("id")
    ON UPDATE NO ACTION
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "integration_usage_partner_id_idx"
  ON "integration_usage" ("partner_id");

CREATE INDEX IF NOT EXISTS "integration_usage_requested_at_idx"
  ON "integration_usage" ("requested_at");
