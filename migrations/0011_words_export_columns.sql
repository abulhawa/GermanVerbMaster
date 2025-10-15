ALTER TABLE "words"
  ADD COLUMN "export_uid" uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "exported_at" timestamp with time zone NULL DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "words_export_uid_idx" ON "words" ("export_uid");
CREATE INDEX IF NOT EXISTS "words_pos_exported_at_idx" ON "words" ("pos", "exported_at");

CREATE OR REPLACE VIEW "words_export_queue" AS
SELECT
  w.id,
  w.export_uid,
  w.pos,
  w.updated_at,
  w.exported_at,
  (w.exported_at IS NULL OR w.exported_at < w.updated_at) AS needs_export
FROM "words" AS w;
