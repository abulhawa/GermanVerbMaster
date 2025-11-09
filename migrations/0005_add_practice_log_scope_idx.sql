CREATE UNIQUE INDEX IF NOT EXISTS "practice_log_scope_idx"
  ON "practice_log" (
    "task_id",
    COALESCE('user:' || "user_id", 'device:' || "device_id"),
    "cefr_level"
  );
