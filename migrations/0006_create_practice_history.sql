CREATE TABLE IF NOT EXISTS practice_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  lexeme_id TEXT NOT NULL,
  pos TEXT NOT NULL,
  task_type TEXT NOT NULL,
  renderer TEXT NOT NULL,
  device_id TEXT NOT NULL,
  user_id INTEGER,
  result TEXT NOT NULL,
  response_ms INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  answered_at INTEGER,
  queued_at INTEGER,
  cefr_level TEXT,
  pack_id TEXT,
  hints_used INTEGER NOT NULL DEFAULT 0,
  feature_flags TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (task_id) REFERENCES task_specs(id) ON DELETE CASCADE,
  FOREIGN KEY (lexeme_id) REFERENCES lexemes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS practice_history_task_idx ON practice_history(task_id);
CREATE INDEX IF NOT EXISTS practice_history_pos_idx ON practice_history(pos);
CREATE INDEX IF NOT EXISTS practice_history_submitted_idx ON practice_history(submitted_at);
CREATE INDEX IF NOT EXISTS practice_history_device_idx ON practice_history(device_id);
CREATE INDEX IF NOT EXISTS practice_history_pack_idx ON practice_history(pack_id);
