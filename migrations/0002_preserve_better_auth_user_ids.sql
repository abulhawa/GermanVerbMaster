DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."user_role" AS ENUM ('standard', 'admin');
  END IF;
END
$$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" "user_role";

ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'standard'::"user_role";

UPDATE "users"
SET "role" = 'standard'::"user_role"
WHERE "role" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "role" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "auth_users" (
  "id" text PRIMARY KEY DEFAULT (
    lpad(to_hex(floor(random() * 4294967296)::bigint), 8, '0') || '-' ||
    lpad(to_hex(floor(random() * 65536)::bigint), 4, '0') || '-' ||
    '4' || substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    substr('89ab', floor(random() * 4)::int + 1, 1) ||
    substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    lpad(to_hex(floor(random() * 281474976710656)::bigint), 12, '0')
  ),
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "role" "user_role" NOT NULL DEFAULT 'standard',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_users_email_idx" ON "auth_users" ("email");

CREATE TABLE IF NOT EXISTS "auth_accounts" (
  "id" text PRIMARY KEY DEFAULT (
    lpad(to_hex(floor(random() * 4294967296)::bigint), 8, '0') || '-' ||
    lpad(to_hex(floor(random() * 65536)::bigint), 4, '0') || '-' ||
    '4' || substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    substr('89ab', floor(random() * 4)::int + 1, 1) ||
    substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    lpad(to_hex(floor(random() * 281474976710656)::bigint), 12, '0')
  ),
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
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_accounts_provider_account_idx" ON "auth_accounts" ("provider_id", "account_id");
CREATE INDEX IF NOT EXISTS "auth_accounts_user_id_idx" ON "auth_accounts" ("user_id");

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" text PRIMARY KEY DEFAULT (
    lpad(to_hex(floor(random() * 4294967296)::bigint), 8, '0') || '-' ||
    lpad(to_hex(floor(random() * 65536)::bigint), 4, '0') || '-' ||
    '4' || substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    substr('89ab', floor(random() * 4)::int + 1, 1) ||
    substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    lpad(to_hex(floor(random() * 281474976710656)::bigint), 12, '0')
  ),
  "token" text NOT NULL,
  "user_id" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_token_idx" ON "auth_sessions" ("token");
CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "auth_verifications" (
  "id" text PRIMARY KEY DEFAULT (
    lpad(to_hex(floor(random() * 4294967296)::bigint), 8, '0') || '-' ||
    lpad(to_hex(floor(random() * 65536)::bigint), 4, '0') || '-' ||
    '4' || substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    substr('89ab', floor(random() * 4)::int + 1, 1) ||
    substr(lpad(to_hex(floor(random() * 65536)::bigint), 4, '0'), 2) || '-' ||
    lpad(to_hex(floor(random() * 281474976710656)::bigint), 12, '0')
  ),
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "auth_verifications_identifier_idx" ON "auth_verifications" ("identifier");
CREATE INDEX IF NOT EXISTS "auth_verifications_value_idx" ON "auth_verifications" ("value");

INSERT INTO "auth_users" ("id", "name", "email", "email_verified", "role", "created_at", "updated_at")
SELECT
  u."id"::text,
  u."username",
  u."username" || '@legacy.local',
  false,
  COALESCE(u."role", 'standard'::"user_role"),
  now(),
  now()
FROM "users" u
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "practice_history" DROP CONSTRAINT IF EXISTS "practice_history_user_id_users_id_fk";
ALTER TABLE "verb_practice_history" DROP CONSTRAINT IF EXISTS "verb_practice_history_user_id_users_id_fk";
ALTER TABLE "verb_review_queues" DROP CONSTRAINT IF EXISTS "verb_review_queues_user_id_users_id_fk";
ALTER TABLE "verb_scheduling_state" DROP CONSTRAINT IF EXISTS "verb_scheduling_state_user_id_users_id_fk";
ALTER TABLE "scheduling_state" DROP CONSTRAINT IF EXISTS "scheduling_state_user_id_users_id_fk";

ALTER TABLE "practice_history" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "verb_practice_history" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "verb_review_queues" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "verb_scheduling_state" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "scheduling_state" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;

ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "verb_practice_history" ADD CONSTRAINT "verb_practice_history_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "verb_review_queues" ADD CONSTRAINT "verb_review_queues_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "verb_scheduling_state" ADD CONSTRAINT "verb_scheduling_state_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "scheduling_state" ADD CONSTRAINT "scheduling_state_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
