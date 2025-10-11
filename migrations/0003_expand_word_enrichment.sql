CREATE TYPE enrichment_method AS ENUM ('bulk', 'manual_api', 'manual_entry', 'preexisting');

ALTER TABLE words
  ADD COLUMN translations jsonb,
  ADD COLUMN examples jsonb,
  ADD COLUMN enrichment_applied_at timestamptz,
  ADD COLUMN enrichment_method enrichment_method;
