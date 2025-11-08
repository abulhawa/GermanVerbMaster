ALTER TABLE lexemes
  ADD COLUMN revision integer NOT NULL DEFAULT 1;

ALTER TABLE inflections
  ADD COLUMN revision integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS task_sync_state (
  id text PRIMARY KEY,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
