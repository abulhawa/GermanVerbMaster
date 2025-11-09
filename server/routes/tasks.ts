import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  getPool,
  lexemes,
  practiceHistory,
  practiceLog,
  taskSpecs,
} from "@db";
import type { LexemePos, TaskType } from "@shared";
import { ensureTaskSpecCacheFresh } from "../cache/task-specs-cache.js";
import { getTaskRegistryEntry, taskRegistry } from "../tasks/registry.js";
import { logPracticeAttempt } from "../practice-log.js";
import {
  UNSPECIFIED_CEFR_LEVEL,
  getSessionUserId,
  isRecord,
  levelSchema,
  normaliseCefrLevel,
  normaliseExampleRecord,
  normaliseLexemeMetadata,
  normaliseString,
  normaliseStringOrNull,
  sendError,
  serialisePracticeLogLevel,
} from "./shared.js";

const RECENT_ATTEMPT_WINDOW_MS = 1000 * 60 * 60 * 6;

const multiStringSchema = z.union([z.string().trim(), z.array(z.string().trim())]);

const taskQuerySchema = z.object({
  pos: z.string().trim().optional(),
  taskType: z.string().trim().optional(),
  taskTypes: multiStringSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  deviceId: z.string().trim().min(6).max(64).optional(),
  level: z.union([levelSchema, z.array(levelSchema)]).optional(),
});

const submissionSchema = z
  .object({
    taskId: z.string().min(1),
    lexemeId: z.string().min(1),
    taskType: z.string().min(1),
    pos: z.string().min(1),
    renderer: z.string().min(1),
    deviceId: z.string().min(1),
    result: z.enum(["correct", "incorrect"]),
    responseMs: z.coerce.number().int().min(0).max(600000).optional(),
    timeSpentMs: z.coerce.number().int().min(0).max(600000).optional(),
    submittedResponse: z.unknown().optional(),
    expectedResponse: z.unknown().optional(),
    answer: z.string().trim().optional(),
    answeredAt: z.string().datetime().optional(),
    submittedAt: z.string().datetime().optional(),
    queuedAt: z.string().datetime().optional(),
    cefrLevel: z.string().trim().min(1).optional(),
    promptSummary: z.string().trim().optional(),
    legacyVerb: z
      .object({
        infinitive: z.string().trim().min(1),
        mode: z.string().trim().min(1),
        level: z.string().trim().optional(),
        attemptedAnswer: z.string().trim().optional(),
      })
      .optional(),
    hintsUsed: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.responseMs === undefined && value.timeSpentMs === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "responseMs or timeSpentMs is required",
        path: ["responseMs"],
      });
    }
  });

const KNOWN_LEXEME_POS = new Set<LexemePos>([
  "verb",
  "noun",
  "adjective",
  "adverb",
  "pronoun",
  "determiner",
  "preposition",
  "conjunction",
  "numeral",
  "particle",
  "interjection",
]);

function normaliseTaskPosFilter(value: string): LexemePos | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["verb", "verbs", "v"].includes(normalized)) return "verb";
  if (["noun", "nouns", "n"].includes(normalized)) return "noun";
  if (["adjective", "adjectives", "adj"].includes(normalized)) return "adjective";
  return null;
}

function parseTaskTypeFilter(value: string): TaskType | null {
  const key = value.trim();
  if (!key) return null;
  return key in taskRegistry ? (key as TaskType) : null;
}

function combineFilters(filters: Array<SQL | null>): SQL | null {
  const active = filters.filter((entry): entry is SQL => Boolean(entry));
  if (!active.length) {
    return null;
  }
  if (active.length === 1) {
    return active[0]!;
  }
  const combined = and(...(active as [SQL, SQL, ...SQL[]]));
  return combined ?? null;
}

function normaliseTaskPrompt(prompt: unknown): Record<string, unknown> {
  if (!isRecord(prompt)) {
    return {};
  }

  const base: Record<string, unknown> = { ...prompt };
  const rawExample = isRecord(base.example) ? base.example : null;
  if (rawExample) {
    const example = normaliseExampleRecord(rawExample);
    if (example) {
      base.example = example;
    } else {
      delete base.example;
    }
  }

  return base;
}

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

function getRowValue<T>(row: Record<string, any>, ...keys: string[]): T | undefined {
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

function mapTaskRow(row: Record<string, any>): TaskRow {
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

async function executeSelectRaw<T>(builder: { toSQL: () => { sql: string; params: unknown[] } }): Promise<T[]> {
  const compiled = builder.toSQL();
  const result = await getPool().query(compiled.sql, compiled.params);
  return result.rows as T[];
}

function asLexemePos(value: string | null | undefined): LexemePos | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return KNOWN_LEXEME_POS.has(normalized as LexemePos) ? (normalized as LexemePos) : null;
}

export function createTaskRouter(): Router {
  const router = Router();

  router.get("/tasks", async (req, res, next) => {
    const parsed = taskQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid task query",
        code: "INVALID_TASK_QUERY",
        details: parsed.error.flatten(),
      });
    }

    try {
      await ensureTaskSpecCacheFresh();

      const { pos, taskType, taskTypes: taskTypesRaw, limit, deviceId, level } = parsed.data;
      const filters: SQL[] = [];
      let normalisedPos: LexemePos | null = null;
      const resolvedTaskTypes: TaskType[] = [];

      const appendTaskType = (value: string) => {
        const resolved = parseTaskTypeFilter(value);
        if (!resolved) {
          throw new Error(value);
        }
        if (!resolvedTaskTypes.includes(resolved)) {
          resolvedTaskTypes.push(resolved);
        }
      };

      res.setHeader("Cache-Control", "no-store");

      if (pos) {
        normalisedPos = normaliseTaskPosFilter(pos);
        if (!normalisedPos) {
          return res.status(400).json({
            error: `Unsupported part-of-speech filter: ${pos}`,
            code: "INVALID_POS_FILTER",
          });
        }
        filters.push(eq(taskSpecs.pos, normalisedPos));
      }

      try {
        if (taskType) {
          appendTaskType(taskType);
        }

        if (taskTypesRaw) {
          const candidates = Array.isArray(taskTypesRaw) ? taskTypesRaw : [taskTypesRaw];
          for (const candidate of candidates) {
            appendTaskType(candidate);
          }
        }
      } catch (error) {
        const invalidType = typeof error === "string" ? error : String(error);
        return res.status(400).json({
          error: `Unsupported task type filter: ${invalidType}`,
          code: "INVALID_TASK_TYPE",
        });
      }

      const requestedLevels = Array.isArray(level)
        ? level
        : typeof level === "string"
        ? [level]
        : [];

      const applyGlobalLevelFilter =
        requestedLevels.length === 1 && (resolvedTaskTypes.length <= 1 || resolvedTaskTypes.length === 0);
      const globalLevel = applyGlobalLevelFilter ? requestedLevels[0]! : null;

      if (applyGlobalLevelFilter && globalLevel) {
        filters.push(
          sql`upper(coalesce(${lexemes.metadata} ->> 'level', ${taskSpecs.prompt} ->> 'cefrLevel')) = ${globalLevel}`,
        );
      }

      const sessionUserId = getSessionUserId(req.authSession);
      const hasIdentity = Boolean(sessionUserId || deviceId);

      const createBaseQuery = () =>
        db
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

      const recencyThreshold = new Date(Date.now() - RECENT_ATTEMPT_WINDOW_MS);

      const buildOrderedQuery = (typesOverride?: TaskType[]) => {
        const activeTaskTypes = typesOverride ?? resolvedTaskTypes;
        const combinedFilters = [...filters];

        if (activeTaskTypes.length === 1) {
          combinedFilters.push(eq(taskSpecs.taskType, activeTaskTypes[0]!));
        } else if (activeTaskTypes.length > 1) {
          combinedFilters.push(inArray(taskSpecs.taskType, activeTaskTypes));
        }

        const baseQuery = createBaseQuery();

        const taskQuery = combinedFilters.length
          ? baseQuery.where(and(...combinedFilters))
          : baseQuery;

        const orderedQuery = hasIdentity
          ? (() => {
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
              const combinedIdentity = or(
                ...(identityExpressions as [SQL, SQL, ...SQL[]]),
              );
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
              const combinedIdentity = or(
                ...(identityLogExpressions as [SQL, SQL, ...SQL[]]),
              );
              identityLogFilter = combinedIdentity ?? null;
            }

            const recencyFilters: SQL[] = [];
            if (identityLogFilter) {
              recencyFilters.push(identityLogFilter);
              recencyFilters.push(gte(practiceLog.attemptedAt, recencyThreshold));
              if (requestedLevels.length) {
                const levelSet = new Set([UNSPECIFIED_CEFR_LEVEL, ...requestedLevels]);
                recencyFilters.push(
                  inArray(practiceLog.cefrLevel, Array.from(levelSet)),
                );
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
                asc(
                  sql`case when ${recentAttempts.recentAttemptedAt} is null then 0 else 1 end`,
                ),
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
          })()
        : taskQuery.orderBy(desc(taskSpecs.updatedAt), asc(taskSpecs.id));

        return orderedQuery;
      };

      const mappedRows: Array<Record<string, any>> = [];

      if (resolvedTaskTypes.length > 1) {
        for (const typeKey of resolvedTaskTypes) {
          const perTypeQuery = buildOrderedQuery([typeKey]);
          const perTypeRows = await executeSelectRaw<Record<string, unknown>>(
            perTypeQuery.limit(limit),
          );
          mappedRows.push(
            ...perTypeRows.map((row) => mapTaskRow(row as Record<string, any>)),
          );
        }
      } else {
        const compiledQuery = buildOrderedQuery().limit(limit);
        const rowsRaw = await executeSelectRaw<Record<string, unknown>>(compiledQuery);
        mappedRows.push(...rowsRaw.map((row) => mapTaskRow(row as Record<string, any>)));
      }

      const payload: Array<{
        taskId: string;
        taskType: string;
        renderer: string;
        pos: string;
        prompt: Record<string, unknown>;
        solution?: unknown;
        queueCap: number;
        lexeme: { id: string; lemma: string; metadata: Record<string, unknown> | null };
      }> = [];

      for (const row of mappedRows) {
        const taskId = normaliseString(row.taskId);
        const taskTypeValue = normaliseString(row.taskType);
        const rendererValue = normaliseString(row.renderer);
        const posValue = normaliseString(row.pos);
        const lexemeId = normaliseString(row.lexemeId);
        const lexemeLemmaRaw = normaliseStringOrNull(row.lexemeLemma);

        if (!taskId || !taskTypeValue || !posValue || !lexemeId) {
          continue;
        }

        const lexemeLemma = lexemeLemmaRaw ?? lexemeId;
        if (!lexemeLemma) {
          continue;
        }

        let registryEntry: ReturnType<typeof getTaskRegistryEntry> | null = null;
        try {
          registryEntry = getTaskRegistryEntry(taskTypeValue as TaskType);
        } catch (error) {
          console.warn("Pruning task with unsupported type", {
            taskType: taskTypeValue,
            taskId,
            error,
          });
          try {
            await db.delete(taskSpecs).where(eq(taskSpecs.id, taskId));
          } catch (deleteError) {
            console.error("Failed to delete unsupported task spec", {
              taskId,
              taskType: taskTypeValue,
              deleteError,
            });
          }
          continue;
        }

        const prompt = normaliseTaskPrompt(row.prompt);
        const metadata = normaliseLexemeMetadata(row.lexemeMetadata) ?? null;

        payload.push({
          taskId,
          taskType: taskTypeValue,
          renderer: rendererValue ?? registryEntry.renderer,
          pos: posValue,
          prompt,
          solution: row.solution ?? undefined,
          queueCap: registryEntry.queueCap,
          lexeme: {
            id: lexemeId,
            lemma: lexemeLemma,
            metadata,
          },
        });
      }

      const levelByType = new Map<TaskType, string>();
      if (!applyGlobalLevelFilter && requestedLevels.length && resolvedTaskTypes.length) {
        resolvedTaskTypes.forEach((taskTypeValue, index) => {
          const levelValue = requestedLevels[index] ?? requestedLevels[0];
          if (levelValue) {
            levelByType.set(taskTypeValue, levelValue);
          }
        });
      } else if (globalLevel) {
        resolvedTaskTypes.forEach((taskTypeValue) => {
          levelByType.set(taskTypeValue, globalLevel);
        });
      }

      const tasksByType = new Map<TaskType, typeof payload>();

      const resolveTaskLevel = (task: (typeof payload)[number]): string | null => {
        const metadataLevel = normaliseCefrLevel(task.lexeme.metadata?.level);
        if (metadataLevel) {
          return metadataLevel;
        }
        const promptLevel = normaliseCefrLevel(
          isRecord(task.prompt) ? (task.prompt.cefrLevel as string | undefined) : undefined,
        );
        return promptLevel ?? null;
      };

      for (const task of payload) {
        const typeKey = task.taskType as TaskType;
        if (resolvedTaskTypes.length && !resolvedTaskTypes.includes(typeKey)) {
          continue;
        }

        const requiredLevel = levelByType.get(typeKey) ?? null;
        if (requiredLevel) {
          const taskLevel = resolveTaskLevel(task);
          if (taskLevel && taskLevel !== requiredLevel) {
            continue;
          }
        }

        if (!tasksByType.has(typeKey)) {
          tasksByType.set(typeKey, []);
        }
        tasksByType.get(typeKey)!.push(task);
      }

      const limitPerType = limit;
      const limitedByTypeEntries: Array<[TaskType, typeof payload]> = [];

      const targetTypes = resolvedTaskTypes.length
        ? resolvedTaskTypes
        : Array.from(tasksByType.keys());

      for (const typeKey of targetTypes) {
        const tasks = tasksByType.get(typeKey) ?? [];
        const limited = tasks.slice(0, limitPerType);
        tasksByType.set(typeKey, limited);
        limitedByTypeEntries.push([typeKey, limited]);
      }

      const mergeTaskGroups = (
        groups: Array<[TaskType, typeof payload]>,
        perTypeLimit: number,
      ): typeof payload => {
        if (!groups.length) {
          return [];
        }
        const queues = groups.map(([, tasks]) => [...tasks]);
        const result: typeof payload = [];
        const seen = new Set<string>();
        const totalLimit = perTypeLimit * groups.length;

        while (result.length < totalLimit && queues.some((queue) => queue.length > 0)) {
          for (const queue of queues) {
            if (!queue.length) {
              continue;
            }
            const candidate = queue.shift()!;
            if (seen.has(candidate.taskId)) {
              continue;
            }
            seen.add(candidate.taskId);
            result.push(candidate);
            if (result.length >= totalLimit) {
              break;
            }
          }
        }

        return result;
      };

      const mergedTasks =
        resolvedTaskTypes.length > 1
          ? mergeTaskGroups(limitedByTypeEntries, limitPerType)
          : payload.slice(0, limitPerType);

      res.json({
        tasks: mergedTasks,
        tasksByType: Object.fromEntries(
          Array.from(tasksByType.entries()).map(([typeKey, tasks]) => [typeKey, tasks]),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/submission", async (req, res) => {
    const parsed = submissionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid submission payload",
        code: "INVALID_SUBMISSION",
        details: parsed.error.flatten(),
      });
    }

    const payload = parsed.data;
    res.setHeader("Cache-Control", "no-store");
    const sessionUserId = getSessionUserId(req.authSession);

    const selectTaskRowById = async (
      taskId: string,
    ): Promise<
      | null
      | {
          taskId: string;
          taskType: string | undefined;
          pos: string | undefined;
          renderer: string | undefined;
          lexemeId: string | undefined;
          frequencyRank: number | null | undefined;
        }
    > => {
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

      const raw = rows[0]!;
      return {
        taskId: getRowValue<string>(raw, "taskId", "id")!,
        taskType: getRowValue<string | undefined>(raw, "taskType", "task_type"),
        pos: getRowValue<string | undefined>(raw, "pos"),
        renderer: getRowValue<string | undefined>(raw, "renderer"),
        lexemeId: getRowValue<string | undefined>(raw, "lexemeId", "lexeme_id"),
        frequencyRank: getRowValue<number | null | undefined>(raw, "frequencyRank", "frequency_rank"),
      };
    };

    const resolveTaskIdFromPayload = async (): Promise<string | null> => {
      if (payload.lexemeId) {
        const fallbackRows = await executeSelectRaw<Record<string, unknown>>(
          db
            .select({ taskId: taskSpecs.id })
            .from(taskSpecs)
            .where(
              and(
                eq(taskSpecs.lexemeId, payload.lexemeId),
                eq(taskSpecs.taskType, payload.taskType),
              ),
            )
            .limit(1),
        );

        if (fallbackRows.length) {
          const fallbackId = getRowValue<string | null>(fallbackRows[0]!, "taskId", "id");
          const normalisedFallback = normaliseString(fallbackId);
          if (normalisedFallback) {
            return normalisedFallback;
          }
        }
      }

      return null;
    };

    let resolvedTaskId = normaliseString(payload.taskId);
    let taskRow = resolvedTaskId ? await selectTaskRowById(resolvedTaskId) : null;

    if (!taskRow) {
      const fallbackTaskId = await resolveTaskIdFromPayload();
      if (fallbackTaskId) {
        resolvedTaskId = fallbackTaskId;
        taskRow = await selectTaskRowById(fallbackTaskId);
      }
    }

    if (!taskRow || !resolvedTaskId) {
      return sendError(res, 404, "Task not found", "TASK_NOT_FOUND");
    }

    if (!taskRow.pos) {
      console.error("Task is missing part of speech", {
        taskId: resolvedTaskId,
      });
      return sendError(res, 500, "Task configuration invalid", "TASK_INVALID_POS");
    }

    const taskPos = asLexemePos(taskRow.pos);
    if (!taskPos) {
      console.error("Task has unsupported part of speech", {
        taskId: resolvedTaskId,
        pos: taskRow.pos,
      });
      return sendError(res, 500, "Task configuration invalid", "TASK_INVALID_POS");
    }

    if (resolvedTaskId !== payload.taskId) {
      console.warn("Resolved submission task identifier", {
        submittedTaskId: payload.taskId,
        resolvedTaskId,
        deviceId: payload.deviceId,
      });
    }

    const registryEntry = getTaskRegistryEntry(taskRow.taskType as TaskType);

    const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : undefined;
    const answeredAt = payload.answeredAt ? new Date(payload.answeredAt) : undefined;
    const queuedAt = payload.queuedAt ? new Date(payload.queuedAt) : undefined;
    const responseMs = payload.responseMs ?? payload.timeSpentMs ?? 0;
    const resolvedCefrLevel = normaliseCefrLevel(payload.cefrLevel) ?? null;
    const attemptTimestamp = submittedAt ?? new Date();
    const serialisedLevel = serialisePracticeLogLevel(resolvedCefrLevel);

    try {
      const queueCap = registryEntry.queueCap;

      await db.insert(practiceHistory).values({
        taskId: resolvedTaskId,
        lexemeId: taskRow.lexemeId!,
        pos: taskRow.pos!,
        taskType: taskRow.taskType!,
        renderer: taskRow.renderer!,
        deviceId: payload.deviceId,
        userId: sessionUserId,
        result: payload.result,
        responseMs,
        submittedAt: attemptTimestamp,
        answeredAt: answeredAt ?? submittedAt ?? null,
        queuedAt: queuedAt ?? null,
        cefrLevel: resolvedCefrLevel,
        hintsUsed: payload.hintsUsed ?? false,
        metadata: {
          submittedResponse: payload.submittedResponse ?? payload.answer ?? null,
          expectedResponse: payload.expectedResponse ?? null,
          promptSummary: typeof payload.promptSummary === "string" ? payload.promptSummary : null,
          queueCap,
          frequencyRank: taskRow.frequencyRank ?? null,
          legacyVerb: payload.legacyVerb ?? null,
        },
      });

      await logPracticeAttempt(db, {
        taskId: resolvedTaskId,
        lexemeId: taskRow.lexemeId!,
        pos: taskRow.pos!,
        taskType: taskRow.taskType!,
        deviceId: payload.deviceId ?? null,
        userId: sessionUserId,
        cefrLevel: serialisedLevel,
        attemptedAt: attemptTimestamp,
      });

      res.json({
        status: "recorded",
        taskId: resolvedTaskId,
        deviceId: payload.deviceId,
        queueCap,
      });
    } catch (error) {
      console.error("Failed to process task submission", error);
      sendError(res, 500, "Failed to record submission", "SUBMISSION_FAILED");
    }
  });

  return router;
}
