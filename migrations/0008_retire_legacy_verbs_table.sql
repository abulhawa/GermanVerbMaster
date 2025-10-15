INSERT INTO "words" (
  "lemma",
  "pos",
  "level",
  "english",
  "aux",
  "praeteritum",
  "partizip_ii",
  "approved",
  "complete",
  "sources_csv",
  "source_notes",
  "examples",
  "pos_attributes",
  "created_at",
  "updated_at"
)
SELECT
  "infinitive",
  'V',
  "level",
  "english",
  "auxiliary",
  "präteritum",
  "partizipII",
  true,
  true,
  CASE WHEN "source" ->> 'name' = '' THEN NULL ELSE "source" ->> 'name' END,
  CASE WHEN "source" ->> 'levelReference' = '' THEN NULL ELSE "source" ->> 'levelReference' END,
  NULL,
  NULL,
  "created_at",
  "updated_at"
FROM "verbs"
ON CONFLICT ("lemma", "pos") DO NOTHING;

DROP TABLE IF EXISTS "verbs";
