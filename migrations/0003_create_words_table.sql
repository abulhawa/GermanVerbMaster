CREATE TABLE IF NOT EXISTS "words" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "lemma" text NOT NULL,
  "pos" text NOT NULL,
  "level" text,
  "english" text,
  "example_de" text,
  "example_en" text,
  "gender" text,
  "plural" text,
  "separable" integer,
  "aux" text,
  "praesens_ich" text,
  "praesens_er" text,
  "praeteritum" text,
  "partizip_ii" text,
  "perfekt" text,
  "comparative" text,
  "superlative" text,
  "canonical" integer NOT NULL DEFAULT 0,
  "complete" integer NOT NULL DEFAULT 0,
  "sources_csv" text,
  "source_notes" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch('now')),
  "updated_at" integer NOT NULL DEFAULT (unixepoch('now')),
  CONSTRAINT "words_lemma_pos_unique" UNIQUE("lemma", "pos")
);

CREATE UNIQUE INDEX IF NOT EXISTS "words_lemma_pos_idx" ON "words" ("lemma", "pos");
