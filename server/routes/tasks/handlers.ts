import type { RequestHandler } from "express";
import { eq, sql, type SQL } from "drizzle-orm";
import type { LexemePos, TaskType } from "@shared";
import {
  db,
  lexemes,
  practiceHistory,
  taskSpecs,
} from "@db";
import { ensureTaskSpecCacheFresh } from "../../cache/task-specs-cache.js";
import { logPracticeAttempt } from "../../practice-log.js";
import { getTaskRegistryEntry } from "../../tasks/registry.js";
import {
  getSessionUserId,
  normaliseCefrLevel,
  normaliseLexemeMetadata,
  normaliseString,
  normaliseStringOrNull,
  sendError,
  serialisePracticeLogLevel,
} from "../shared.js";
import {
  asLexemePos,
  normaliseTaskPosFilter,
  normaliseTaskPrompt,
  parseTaskTypeFilter,
  submissionSchema,
  taskQuerySchema,
} from "./schemas.js";
import {
  RECENT_ATTEMPT_WINDOW_MS,
  fetchTaskRowById,
  fetchTasksForTypes,
  findTaskIdByLexemeAndType,
} from "./queries.js";

export function createListTasksHandler(): RequestHandler {
  return async (req, res, next) => {
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
      const recencyThreshold = new Date(Date.now() - RECENT_ATTEMPT_WINDOW_MS);

      const rows = await fetchTasksForTypes({
        filters,
        taskTypes: resolvedTaskTypes,
        normalisedPos,
        requestedLevels,
        sessionUserId,
        deviceId,
        recencyThreshold,
        limit,
      });

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

      for (const row of rows) {
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
          continue;
        }

        const prompt = normaliseTaskPrompt(row.prompt);
        const lexemeMetadata = normaliseLexemeMetadata(row.lexemeMetadata);

        payload.push({
          taskId,
          taskType: taskTypeValue,
          renderer: rendererValue ?? registryEntry.renderer,
          pos: posValue,
          prompt,
          solution: row.solution,
          queueCap: registryEntry.queueCap,
          lexeme: {
            id: lexemeId,
            lemma: lexemeLemma,
            metadata: lexemeMetadata,
          },
        });
      }

      const tasksByType = payload.reduce<Record<TaskType, typeof payload>>((acc, task) => {
        const key = task.taskType as TaskType;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key]!.push(task);
        return acc;
      }, {} as Record<TaskType, typeof payload>);

      const responsePayload: {
        tasks: typeof payload;
        tasksByType?: Record<TaskType, typeof payload>;
      } = { tasks: payload };

      if (Object.keys(tasksByType).length > 0) {
        responsePayload.tasksByType = tasksByType;
      }

      res.json(responsePayload);
    } catch (error) {
      next(error);
    }
  };
}

export function createSubmitTaskHandler(): RequestHandler {
  return async (req, res) => {
    const parsed = submissionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, "Invalid submission", "INVALID_SUBMISSION");
    }

    const payload = parsed.data;
    res.setHeader("Cache-Control", "no-store");
    const sessionUserId = getSessionUserId(req.authSession);

    const resolveTaskIdFromPayload = async (): Promise<string | null> => {
      if (!payload.lexemeId) {
        return null;
      }

      return findTaskIdByLexemeAndType(payload.lexemeId, payload.taskType);
    };

    let resolvedTaskId = normaliseString(payload.taskId);
    let taskRow = resolvedTaskId ? await fetchTaskRowById(resolvedTaskId) : null;

    if (!taskRow) {
      const fallbackTaskId = await resolveTaskIdFromPayload();
      if (fallbackTaskId) {
        resolvedTaskId = fallbackTaskId;
        taskRow = await fetchTaskRowById(fallbackTaskId);
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

    if (!asLexemePos(taskRow.pos)) {
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
  };
}
