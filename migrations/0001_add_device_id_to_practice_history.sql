ALTER TABLE "verb_practice_history" ADD COLUMN IF NOT EXISTS "device_id" text;
UPDATE "verb_practice_history" SET "device_id" = 'legacy-device' WHERE "device_id" IS NULL;
ALTER TABLE "verb_practice_history" ALTER COLUMN "device_id" SET NOT NULL;
