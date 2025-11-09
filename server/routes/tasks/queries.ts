import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  getPool,
  lexemes,
  practiceHistory,
  practiceLog,
  taskSpecs,
} from "@db";
import type { LexemePos, TaskType } from "@shared";
import { UNSPECIFIED_CEFR_LEVEL, normaliseString } from "../shared.js";
import { combineFilters } from "./schemas.js";

export const RECENT_ATTEMPT_WINDOW_MS = 1000 * 60 * 60 * 6;

type RawTaskRow = Record<string, any>;

type TaskRow = {
  taskId: string;
  taskType: string;
  renderer: string;
  pos: string;
  prompt: unknown;
  solution: unknown;
  lexemeId: string;
  lexemeLemma: string | null;
  lexemeMetadata: Record<string, unknown> | null;
};

export type MinimalTaskRow = {
  taskId: string;
  taskType: string | undefined;
  pos: string | undefined;
  renderer: string | undefined;
  lexemeId: string | undefined;
  frequencyRank: number | null | undefined;
};

function getRowValue<T>(row: RawTaskRow, ...keys: string[]): T | undefined {
  const candidates: string[] = [];

  for (const key of keys) {
    candidates.push(key);

    if (!key.includes("_")) {
      const snakeCase = key
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase();
      if (snakeCase !== key) {
        candidates.push(snakeCase);
      }
    } else {
      const camelCase = key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
      if (camelCase !== key) {
        candidates.push(camelCase);
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate in row && row[candidate] !== undefined) {
      return row[candidate] as T;
    }
  }

  return undefined;
}

export function mapTaskRow(row: RawTaskRow): TaskRow {
  return {
    taskId: getRowValue<string>(row, "taskId", "id")!,
    taskType: getRowValue<string>(row, "taskType", "task_type")!,
    renderer: getRowValue<string>(row, "renderer")!,
    pos: getRowValue<string>(row, "pos")!,
    prompt: getRowValue<unknown>(row, "prompt"),
    solution: getRowValue<unknown>(row, "solution"),
    lexemeId: getRowValue<string>(row, "lexemeId", "lexeme_id")!,
    lexemeLemma:
      getRowValue<string | null>(row, "lexemeLemma", "lexeme_lemma", "lemma") ?? null,
    lexemeMetadata:
      getRowValue<Record<string, unknown> | null>(
        row,
        "lexemeMetadata",
        "lexeme_metadata",
        "metadata",
      ) ?? null,
  };
}

export function mapMinimalTaskRow(row: RawTaskRow): MinimalTaskRow {
  return {
    taskId: getRowValue<string>(row, "taskId", "id")!,
    taskType: getRowValue<string | undefined>(row, "taskType", "task_type"),
    pos: getRowValue<string | undefined>(row, "pos"),
    renderer: getRowValue<string | undefined>(row, "renderer"),
    lexemeId: getRowValue<string | undefined>(row, "lexemeId", "lexeme_id"),
    frequencyRank: getRowValue<number | null | undefined>(row, "frequencyRank", "frequency_rank"),
  };
}

export async function executeSelectRaw<T>(
  builder: { toSQL: () => { sql: string; params: unknown[] } },
): Promise<T[]> {
  const compiled = builder.toSQL();
  const result = await getPool().query(compiled.sql, compiled.params);
  return result.rows as T[];
}

function createBaseTaskQuery() {
  return db
    .select({
      taskId: taskSpecs.id,
      taskType: taskSpecs.taskType,
      renderer: taskSpecs.renderer,
      pos: taskSpecs.pos,
      prompt: taskSpecs.prompt,
      solution: taskSpecs.solution,
      lexemeId: taskSpecs.lexemeId,
      lexemeLemma: lexemes.lemma,
      lexemeMetadata: lexemes.metadata,
    })
    .from(taskSpecs)
    .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id));
}

export type TaskListQueryOptions = {
  filters: SQL[];
  taskTypes: TaskType[];
  normalisedPos: LexemePos | null;
  requestedLevels: string[];
  sessionUserId: string | null;
  deviceId: string | null | undefined;
  recencyThreshold: Date;
};

function buildOrderedTaskQuery(
  options: TaskListQueryOptions & { typeOverride?: TaskType[] },
) {
  const { filters, taskTypes, normalisedPos, requestedLevels, sessionUserId, deviceId } = options;
  const hasIdentity = Boolean(sessionUserId || deviceId);
  const activeTaskTypes = options.typeOverride ?? taskTypes;
  const combinedFilters = [...filters];

  if (activeTaskTypes.length === 1) {
    combinedFilters.push(eq(taskSpecs.taskType, activeTaskTypes[0]!));
  } else if (activeTaskTypes.length > 1) {
    combinedFilters.push(inArray(taskSpecs.taskType, activeTaskTypes));
  }

  const baseQuery = createBaseTaskQuery();
  const taskQuery = combinedFilters.length ? baseQuery.where(and(...combinedFilters)) : baseQuery;

  if (!hasIdentity) {
    return taskQuery.orderBy(desc(taskSpecs.updatedAt), asc(taskSpecs.id));
  }

  const identityExpressions: SQL[] = [];
  if (sessionUserId) {
    identityExpressions.push(eq(practiceHistory.userId, sessionUserId));
  }
  if (deviceId) {
    identityExpressions.push(eq(practiceHistory.deviceId, deviceId));
  }

  let identityFilter: SQL | null = null;
  if (identityExpressions.length === 1) {
    identityFilter = identityExpressions[0]!;
  } else if (identityExpressions.length > 1) {
    const combinedIdentity = or(...(identityExpressions as [SQL, SQL, ...SQL[]]));
    identityFilter = combinedIdentity ?? null;
  }

  const historyFilters: SQL[] = [];
  if (identityFilter) {
    historyFilters.push(identityFilter);
  }
  if (normalisedPos) {
    historyFilters.push(eq(practiceHistory.pos, normalisedPos));
  }
  if (activeTaskTypes.length === 1) {
    historyFilters.push(eq(practiceHistory.taskType, activeTaskTypes[0]!));
  } else if (activeTaskTypes.length > 1) {
    historyFilters.push(inArray(practiceHistory.taskType, activeTaskTypes));
  }

  const historyWhere = combineFilters(historyFilters);

  let queryWithHistory = taskQuery;
  const historyOrder: SQL[] = [];

  if (historyWhere) {
    const attemptHistory = db
      .select({
        taskId: practiceHistory.taskId,
        lastPracticedAt: sql<Date | null>`max(${practiceHistory.submittedAt})`.as(
          "last_practiced_at",
        ),
      })
      .from(practiceHistory)
      .where(historyWhere)
      .groupBy(practiceHistory.taskId)
      .as("practice_history_summary");

    queryWithHistory = queryWithHistory.leftJoin(
      attemptHistory,
      eq(taskSpecs.id, attemptHistory.taskId),
    );
    historyOrder.push(asc(attemptHistory.lastPracticedAt));
  }

  const identityLogExpressions: SQL[] = [];
  if (sessionUserId) {
    identityLogExpressions.push(eq(practiceLog.userId, sessionUserId));
  }
  if (deviceId) {
    identityLogExpressions.push(eq(practiceLog.deviceId, deviceId));
  }

  let identityLogFilter: SQL | null = null;
  if (identityLogExpressions.length === 1) {
    identityLogFilter = identityLogExpressions[0]!;
  } else if (identityLogExpressions.length > 1) {
    const combinedIdentity = or(...(identityLogExpressions as [SQL, SQL, ...SQL[]]));
    identityLogFilter = combinedIdentity ?? null;
  }

  const recencyFilters: SQL[] = [];
  if (identityLogFilter) {
    recencyFilters.push(identityLogFilter);
    recencyFilters.push(gte(practiceLog.attemptedAt, options.recencyThreshold));
    if (requestedLevels.length) {
      const levelSet = new Set([UNSPECIFIED_CEFR_LEVEL, ...requestedLevels]);
      recencyFilters.push(inArray(practiceLog.cefrLevel, Array.from(levelSet)));
    }
  }

  const recencyWhere = combineFilters(recencyFilters);

  let queryWithRecency = queryWithHistory;
  const recencyOrder: SQL[] = [];

  if (recencyWhere) {
    const recentAttempts = db
      .select({
        taskId: practiceLog.taskId,
        recentAttemptedAt: sql<Date | null>`max(${practiceLog.attemptedAt})`.as(
          "recent_attempted_at",
        ),
      })
      .from(practiceLog)
      .where(recencyWhere)
      .groupBy(practiceLog.taskId)
      .as("recent_attempts");

    queryWithRecency = queryWithRecency.leftJoin(
      recentAttempts,
      eq(taskSpecs.id, recentAttempts.taskId),
    );

    recencyOrder.push(
      asc(sql`case when ${recentAttempts.recentAttemptedAt} is null then 0 else 1 end`),
    );
    recencyOrder.push(asc(recentAttempts.recentAttemptedAt));
  }

  const orderExpressions: SQL[] = [
    ...recencyOrder,
    ...historyOrder,
    desc(taskSpecs.updatedAt),
    asc(taskSpecs.id),
  ];

  return queryWithRecency.orderBy(...orderExpressions);
}

export async function fetchTasksForTypes(
  options: TaskListQueryOptions & { limit: number },
): Promise<TaskRow[]> {
  const { taskTypes, limit } = options;
  const rows: TaskRow[] = [];

  if (taskTypes.length > 1) {
    for (const typeKey of taskTypes) {
      const query = buildOrderedTaskQuery({ ...options, typeOverride: [typeKey] }).limit(limit);
      const perTypeRows = await executeSelectRaw<Record<string, unknown>>(query);
      rows.push(...perTypeRows.map((row) => mapTaskRow(row as RawTaskRow)));
    }
  } else {
    const query = buildOrderedTaskQuery(options).limit(limit);
    const perTypeRows = await executeSelectRaw<Record<string, unknown>>(query);
    rows.push(...perTypeRows.map((row) => mapTaskRow(row as RawTaskRow)));
  }

  return rows;
}

export async function fetchTaskRowById(taskId: string): Promise<MinimalTaskRow | null> {
  const rows = await executeSelectRaw<Record<string, unknown>>(
    db
      .select({
        taskId: taskSpecs.id,
        taskType: taskSpecs.taskType,
        pos: taskSpecs.pos,
        renderer: taskSpecs.renderer,
        lexemeId: taskSpecs.lexemeId,
        frequencyRank: lexemes.frequencyRank,
      })
      .from(taskSpecs)
      .innerJoin(lexemes, eq(taskSpecs.lexemeId, lexemes.id))
      .where(eq(taskSpecs.id, taskId))
      .limit(1),
  );

  if (!rows.length) {
    return null;
  }

  return mapMinimalTaskRow(rows[0]! as RawTaskRow);
}

export async function findTaskIdByLexemeAndType(
  lexemeId: string,
  taskType: string,
): Promise<string | null> {
  const rows = await executeSelectRaw<Record<string, unknown>>(
    db
      .select({ taskId: taskSpecs.id })
      .from(taskSpecs)
      .where(and(eq(taskSpecs.lexemeId, lexemeId), eq(taskSpecs.taskType, taskType)))
      .limit(1),
  );

  if (!rows.length) {
    return null;
  }

  const fallbackId = getRowValue<string | null>(rows[0]! as RawTaskRow, "taskId", "id");
  return normaliseString(fallbackId) ?? null;
}

export type { TaskRow };
