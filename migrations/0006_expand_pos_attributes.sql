ALTER TABLE words
  ADD COLUMN IF NOT EXISTS pos_attributes JSONB;

ALTER TABLE "enrichment"."enrichment_provider_snapshots"
  ADD COLUMN IF NOT EXISTS preposition_attributes JSONB;
