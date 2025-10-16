ALTER TABLE "practice_history" DROP COLUMN IF EXISTS "pack_id";
DROP INDEX IF EXISTS "practice_history_pack_idx";
ALTER TABLE "task_specs" DROP COLUMN IF EXISTS "source_pack";
