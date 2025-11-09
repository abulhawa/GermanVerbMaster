import { Router } from "express";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, lexemes, practiceHistory } from "@db";
import type {
  AnswerHistoryLexemeSnapshot,
  LexemePos,
  PracticeResult,
  TaskAnswerHistoryItem,
  TaskType,
} from "@shared";
import { normalizeWordExample } from "@shared";
import {
  getSessionUserId,
  isRecord,
  levelSchema,
  normaliseCefrLevel,
  normaliseLexemeMetadata,
  normaliseString,
  sendError,
} from "./shared.js";

const practiceHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  result: z.enum(["correct", "incorrect"]).optional(),
  level: levelSchema.optional(),
  deviceId: z.string().trim().min(6).max(64).optional(),
});

const clearPracticeHistorySchema = z.object({
  deviceId: z.string().trim().min(6).max(64).optional(),
});

type PracticeHistoryRow = {
  id: number;
  taskId: string;
  lexemeId: string;
  pos: string;
  taskType: string;
  renderer: string;
  result: PracticeResult;
  responseMs: number;
  submittedAt: Date;
  answeredAt: Date | null;
  cefrLevel: string | null;
  metadata: Record<string, unknown> | null;
  lexemeLemma: string | null;
  lexemeMetadata: Record<string, unknown> | null;
};

function buildLexemeSnapshotFromRow(
  row: Pick<PracticeHistoryRow, "lexemeId" | "lexemeLemma" | "pos" | "lexemeMetadata" | "cefrLevel">,
): AnswerHistoryLexemeSnapshot {
  const metadata = normaliseLexemeMetadata(row.lexemeMetadata) ?? {};
  const exampleMeta = isRecord(metadata.example) ? metadata.example : null;
  const level = normaliseCefrLevel(row.cefrLevel ?? metadata.level);
  const english = normaliseString(metadata.english);
  const normalizedExample = exampleMeta
    ? normalizeWordExample({
        sentence: typeof exampleMeta.sentence === "string" ? exampleMeta.sentence : undefined,
        translations: isRecord(exampleMeta.translations)
          ? Object.fromEntries(
              Object.entries(exampleMeta.translations).filter((entry): entry is [string, string] =>
                typeof entry[1] === "string",
              ),
            )
          : undefined,
        exampleDe: typeof exampleMeta.de === "string" ? exampleMeta.de : undefined,
        exampleEn: typeof exampleMeta.en === "string" ? exampleMeta.en : undefined,
      })
    : null;
  const auxiliary = normaliseString(metadata.auxiliary);
  const allowedAuxiliaries = new Set(["haben", "sein", "haben / sein"]);

  return {
    id: row.lexemeId,
    lemma: row.lexemeLemma ?? row.lexemeId,
    pos: row.pos as LexemePos,
    level,
    english: english ?? undefined,
    example:
      normalizedExample && (normalizedExample.sentence || normalizedExample.translations?.en)
        ? {
            de: normalizedExample.sentence ?? undefined,
            en: normalizedExample.translations?.en ?? undefined,
          }
        : undefined,
    auxiliary: auxiliary && allowedAuxiliaries.has(auxiliary)
      ? (auxiliary as AnswerHistoryLexemeSnapshot["auxiliary"])
      : undefined,
  } satisfies AnswerHistoryLexemeSnapshot;
}

function toAnswerHistoryItem(row: PracticeHistoryRow): TaskAnswerHistoryItem {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const submittedResponse = metadata.submittedResponse ?? null;
  const expectedResponse = metadata.expectedResponse ?? null;
  const lexemeSnapshot = buildLexemeSnapshotFromRow(row);
  const answeredAt = row.answeredAt ?? row.submittedAt;
  const promptSummary = normaliseString(metadata.promptSummary)
    ?? `${lexemeSnapshot.lemma} – ${row.taskType.replace(/[_-]+/g, " ")}`;
  const attemptedAnswer = normaliseString(submittedResponse);
  const correctAnswer = normaliseString(expectedResponse);
  const cefrLevel = normaliseCefrLevel(row.cefrLevel ?? lexemeSnapshot.level);

  return {
    id: `practice_history:${row.id}`,
    taskId: row.taskId,
    lexemeId: row.lexemeId,
    taskType: row.taskType as TaskType,
    pos: row.pos as LexemePos,
    renderer: row.renderer,
    result: row.result,
    submittedResponse,
    expectedResponse,
    promptSummary,
    answeredAt: answeredAt.toISOString(),
    timeSpentMs: row.responseMs,
    timeSpent: row.responseMs,
    cefrLevel,
    mode: undefined,
    attemptedAnswer,
    correctAnswer,
    prompt: promptSummary,
    level: cefrLevel,
    lexeme: lexemeSnapshot,
    verb: undefined,
    legacyVerb: undefined,
  } satisfies TaskAnswerHistoryItem;
}

export function createPracticeHistoryRouter(): Router {
  const router = Router();

  router.get("/practice/history", async (req, res) => {
    const parsed = practiceHistoryQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid history query",
        code: "INVALID_HISTORY_QUERY",
        details: parsed.error.flatten(),
      });
    }

    const { limit, result, level, deviceId } = parsed.data;
    const sessionUserId = getSessionUserId(req.authSession);

    if (!sessionUserId && !deviceId) {
      return sendError(res, 400, "Device identifier required", "DEVICE_ID_REQUIRED");
    }

    try {
      const attributeFilters: Array<ReturnType<typeof eq>> = [];

      if (result) {
        attributeFilters.push(eq(practiceHistory.result, result));
      }

      if (level) {
        attributeFilters.push(eq(practiceHistory.cefrLevel, level));
      }

      const userFilter = sessionUserId ? eq(practiceHistory.userId, sessionUserId) : null;
      const deviceFilter = deviceId ? eq(practiceHistory.deviceId, deviceId) : null;
      const identityFilter: SQL | null =
        (userFilter && deviceFilter ? or(userFilter, deviceFilter) : userFilter ?? deviceFilter) ?? null;

      const baseQuery = db
        .select({
          id: practiceHistory.id,
          taskId: practiceHistory.taskId,
          lexemeId: practiceHistory.lexemeId,
          pos: practiceHistory.pos,
          taskType: practiceHistory.taskType,
          renderer: practiceHistory.renderer,
          result: practiceHistory.result,
          responseMs: practiceHistory.responseMs,
          submittedAt: practiceHistory.submittedAt,
          answeredAt: practiceHistory.answeredAt,
          cefrLevel: practiceHistory.cefrLevel,
          metadata: practiceHistory.metadata,
          lexemeLemma: lexemes.lemma,
          lexemeMetadata: lexemes.metadata,
        })
        .from(practiceHistory)
        .innerJoin(lexemes, eq(practiceHistory.lexemeId, lexemes.id));

      let combinedFilter: SQL | null = identityFilter;

      if (attributeFilters.length === 1) {
        const singleFilter = attributeFilters[0];
        if (combinedFilter) {
          combinedFilter = and(combinedFilter, singleFilter) ?? combinedFilter;
        } else {
          combinedFilter = singleFilter;
        }
      } else if (attributeFilters.length > 1) {
        const attributesFilter = and(...attributeFilters);
        if (attributesFilter) {
          if (combinedFilter) {
            combinedFilter = and(combinedFilter, attributesFilter) ?? combinedFilter;
          } else {
            combinedFilter = attributesFilter;
          }
        }
      }

      const filteredQuery = combinedFilter ? baseQuery.where(combinedFilter) : baseQuery;

      const rows = await filteredQuery
        .orderBy(desc(practiceHistory.submittedAt), desc(practiceHistory.id))
        .limit(limit);

      const history = rows.map((row) => toAnswerHistoryItem(row as PracticeHistoryRow));
      res.setHeader("Cache-Control", "no-store");
      res.json({ history });
    } catch (error) {
      console.error("Failed to load practice history", error);
      sendError(res, 500, "Failed to load practice history", "PRACTICE_HISTORY_FAILED");
    }
  });

  router.delete("/practice/history", async (req, res) => {
    const parsed = clearPracticeHistorySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid clear history payload",
        code: "INVALID_HISTORY_CLEAR",
        details: parsed.error.flatten(),
      });
    }

    const { deviceId } = parsed.data;
    const sessionUserId = getSessionUserId(req.authSession);

    if (!sessionUserId && !deviceId) {
      return sendError(res, 400, "Device identifier required", "DEVICE_ID_REQUIRED");
    }

    const userFilter = sessionUserId ? eq(practiceHistory.userId, sessionUserId) : null;
    const deviceFilter = deviceId ? eq(practiceHistory.deviceId, deviceId) : null;
    const deleteFilter: SQL | null =
      (userFilter && deviceFilter ? or(userFilter, deviceFilter) : userFilter ?? deviceFilter) ?? null;

    if (!deleteFilter) {
      return sendError(res, 400, "No filters provided", "INVALID_HISTORY_CLEAR");
    }

    try {
      await db.delete(practiceHistory).where(deleteFilter);
      res.status(204).send();
    } catch (error) {
      console.error("Failed to clear practice history", error);
      sendError(res, 500, "Failed to clear practice history", "PRACTICE_HISTORY_CLEAR_FAILED");
    }
  });

  return router;
}
