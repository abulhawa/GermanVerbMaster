ALTER TABLE enrichment_provider_snapshots
  ADD COLUMN IF NOT EXISTS noun_forms JSONB,
  ADD COLUMN IF NOT EXISTS adjective_forms JSONB;
