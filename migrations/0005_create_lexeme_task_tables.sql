-- Migration: Create lexeme-centric tables for multi-POS support
-- Generated for Parts-of-Speech Expansion Task 5

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS lexemes (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'de',
  pos TEXT NOT NULL,
  gender TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  frequency_rank INTEGER,
  source_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS lexemes_lemma_pos_idx ON lexemes(lemma, pos);

CREATE TABLE IF NOT EXISTS inflections (
  id TEXT PRIMARY KEY,
  lexeme_id TEXT NOT NULL,
  form TEXT NOT NULL,
  features TEXT NOT NULL,
  audio_asset TEXT,
  source_revision TEXT,
  checksum TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (lexeme_id) REFERENCES lexemes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS inflections_lexeme_form_features_idx
  ON inflections(lexeme_id, form, features);

CREATE TABLE IF NOT EXISTS task_specs (
  id TEXT PRIMARY KEY,
  lexeme_id TEXT NOT NULL,
  pos TEXT NOT NULL,
  task_type TEXT NOT NULL,
  renderer TEXT NOT NULL,
  prompt TEXT NOT NULL,
  solution TEXT NOT NULL,
  hints TEXT,
  metadata TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  source_pack TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (lexeme_id) REFERENCES lexemes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS task_specs_lexeme_type_revision_idx
  ON task_specs(lexeme_id, task_type, revision);

CREATE INDEX IF NOT EXISTS task_specs_pos_idx ON task_specs(pos);

CREATE TABLE IF NOT EXISTS scheduling_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  device_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  leitner_box INTEGER NOT NULL DEFAULT 1,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  average_response_ms INTEGER NOT NULL DEFAULT 0,
  accuracy_weight REAL NOT NULL DEFAULT 0,
  latency_weight REAL NOT NULL DEFAULT 0,
  stability_weight REAL NOT NULL DEFAULT 0,
  priority_score REAL NOT NULL DEFAULT 0,
  due_at INTEGER,
  last_result TEXT NOT NULL DEFAULT 'correct',
  last_practiced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES task_specs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduling_state_device_task_idx
  ON scheduling_state(device_id, task_id);

CREATE INDEX IF NOT EXISTS scheduling_state_task_idx ON scheduling_state(task_id);
CREATE INDEX IF NOT EXISTS scheduling_state_user_idx ON scheduling_state(user_id);

CREATE TABLE IF NOT EXISTS content_packs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'de',
  pos_scope TEXT NOT NULL,
  license TEXT NOT NULL,
  license_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  checksum TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);

CREATE TABLE IF NOT EXISTS pack_lexeme_map (
  pack_id TEXT NOT NULL,
  lexeme_id TEXT NOT NULL,
  primary_task_id TEXT,
  position INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  PRIMARY KEY (pack_id, lexeme_id),
  FOREIGN KEY (pack_id) REFERENCES content_packs(id) ON DELETE CASCADE,
  FOREIGN KEY (lexeme_id) REFERENCES lexemes(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_task_id) REFERENCES task_specs(id)
);

CREATE INDEX IF NOT EXISTS pack_lexeme_map_lexeme_idx ON pack_lexeme_map(lexeme_id);

CREATE TABLE IF NOT EXISTS telemetry_priorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  sampled_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  priority_score REAL NOT NULL,
  accuracy_weight REAL NOT NULL DEFAULT 0,
  latency_weight REAL NOT NULL DEFAULT 0,
  stability_weight REAL NOT NULL DEFAULT 0,
  frequency_rank INTEGER,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (task_id) REFERENCES task_specs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS telemetry_priorities_task_idx ON telemetry_priorities(task_id);
CREATE INDEX IF NOT EXISTS telemetry_priorities_sampled_idx ON telemetry_priorities(sampled_at);

COMMIT;
PRAGMA foreign_keys=ON;
