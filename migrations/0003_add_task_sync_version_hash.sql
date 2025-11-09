ALTER TABLE task_sync_state
  ADD COLUMN IF NOT EXISTS version_hash text;
