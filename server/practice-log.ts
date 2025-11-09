import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Schema = typeof import("@db/schema");

export interface PracticeLogAttempt {
  taskId: string;
  lexemeId: string;
  pos: string;
  taskType: string;
  deviceId?: string | null;
  userId?: string | null;
  cefrLevel: string;
  attemptedAt: Date;
}

export async function logPracticeAttempt(
  database: NodePgDatabase<Schema>,
  attempt: PracticeLogAttempt,
): Promise<void> {
  const deviceScopeKey = attempt.deviceId ? `device:${attempt.deviceId}` : null;
  const userScopeKey = attempt.userId ? `user:${attempt.userId}` : null;

  await database.execute(
    sql`
      insert into practice_log (
        task_id,
        lexeme_id,
        pos,
        task_type,
        device_id,
        user_id,
        cefr_level,
        attempted_at,
        updated_at
      )
      select
        v.task_id,
        v.lexeme_id,
        v.pos,
        v.task_type,
        v.device_id,
        v.user_id,
        v.cefr_level,
        v.attempted_at,
        now()
      from (
        values
          (
            ${attempt.taskId},
            ${attempt.lexemeId},
            ${attempt.pos},
            ${attempt.taskType},
            ${attempt.deviceId ?? null},
            ${null},
            ${attempt.cefrLevel},
            ${attempt.attemptedAt}::timestamptz,
            ${deviceScopeKey}
          ),
          (
            ${attempt.taskId},
            ${attempt.lexemeId},
            ${attempt.pos},
            ${attempt.taskType},
            ${null},
            ${attempt.userId ?? null},
            ${attempt.cefrLevel},
            ${attempt.attemptedAt}::timestamptz,
            ${userScopeKey}
          )
      ) as v(
        task_id,
        lexeme_id,
        pos,
        task_type,
        device_id,
        user_id,
        cefr_level,
        attempted_at,
        scope_key
      )
      where v.scope_key is not null
      on conflict (
        task_id,
        coalesce('user:' || user_id, 'device:' || device_id),
        cefr_level
      )
      do update set
        lexeme_id = excluded.lexeme_id,
        pos = excluded.pos,
        task_type = excluded.task_type,
        attempted_at = excluded.attempted_at,
        updated_at = now()
    `,
  );
}
