CREATE TABLE IF NOT EXISTS "enrichment_provider_snapshots" (
  "id" serial PRIMARY KEY,
  "word_id" integer NOT NULL REFERENCES "words"("id") ON DELETE CASCADE,
  "lemma" text NOT NULL,
  "pos" text NOT NULL,
  "provider_id" text NOT NULL,
  "provider_label" text,
  "status" text NOT NULL,
  "error" text,
  "trigger" text NOT NULL,
  "mode" text NOT NULL,
  "translations" jsonb,
  "examples" jsonb,
  "synonyms" jsonb,
  "english_hints" jsonb,
  "verb_forms" jsonb,
  "raw_payload" jsonb,
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "enrichment_snapshots_word_provider_idx"
  ON "enrichment_provider_snapshots" ("word_id", "provider_id");

CREATE INDEX IF NOT EXISTS "enrichment_snapshots_provider_collected_idx"
  ON "enrichment_provider_snapshots" ("provider_id", "collected_at");
