import { Router } from "express";
import { runRegenerateQueuesJob } from "../jobs/regenerate-queues.js";
import { requireAdminAccess } from "./admin/auth.js";
import {
  parseLimitParam,
  parsePageParam,
  parseTriState,
  parseWordId,
  wordBatchEnrichmentRequestSchema,
  wordCreateSchema,
  wordEnrichmentRequestSchema,
  wordUpdateSchema,
} from "./admin/schemas.js";
import {
  createWord,
  enrichWordById,
  findWordById,
  listWords,
  runWordEnrichmentBatch,
  updateWordById,
} from "./admin/services.js";
import {
  getSessionUserId,
  isRecord,
  normaliseString,
  normaliseStringOrNull,
  sendError,
} from "./shared.js";

export function createAdminRouter(): Router {
  const router = Router();

  router.post("/jobs/regenerate-queues", requireAdminAccess, async (req, res, next) => {
    try {
      const reason = isRecord(req.body) ? normaliseString(req.body.reason) ?? null : null;
      const triggeredBy = getSessionUserId(req.authSession);

      const result = await runRegenerateQueuesJob({
        triggeredBy,
        reason,
      });

      res.json({
        status: "completed",
        job: "regenerate_queues",
        runId: result.jobRunId,
        startedAt: result.startedAt.toISOString(),
        finishedAt: result.finishedAt.toISOString(),
        durationMs: result.durationMs,
        latestTouchedAt: result.latestTouchedAt ? result.latestTouchedAt.toISOString() : null,
        stats: result.stats,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/words", requireAdminAccess, async (req, res) => {
    try {
      const pos = normaliseStringOrNull(req.query.pos)?.trim();
      const level = normaliseStringOrNull(req.query.level)?.trim();
      const approvalFilter = parseTriState(req.query.approved);
      const completeFilter = parseTriState(req.query.complete);
      const enrichedFilter = parseTriState(req.query.enriched);
      const search = normaliseString(req.query.search)?.trim().toLowerCase() ?? null;
      const page = parsePageParam(req.query.page, 1);
      const perPage = Math.min(parseLimitParam(req.query.perPage, 50), 200);

      const result = await listWords({
        pos,
        level,
        approvalFilter,
        completeFilter,
        enrichedFilter,
        search,
        page,
        perPage,
      });

      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      console.error("Error fetching words:", error);
      sendError(res, 500, "Failed to fetch words", "WORDS_FETCH_FAILED");
    }
  });

  router.post("/words", requireAdminAccess, async (req, res) => {
    try {
      const parsed = wordCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid word payload", "INVALID_WORD_INPUT");
      }

      const created = await createWord(parsed.data);
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating word:", error);
      if (error instanceof Error && error.message === "WORD_ALREADY_EXISTS") {
        return sendError(res, 409, "Word already exists", "WORD_ALREADY_EXISTS");
      }
      if (error instanceof Error && error.message === "WORD_CREATE_FAILED") {
        return sendError(res, 500, "Failed to create word", "WORD_CREATE_FAILED");
      }
      sendError(res, 500, "Failed to create word", "WORD_CREATE_FAILED");
    }
  });

  router.get("/words/:id", requireAdminAccess, async (req, res) => {
    try {
      const id = parseWordId(req.params.id);
      if (!id) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const word = await findWordById(id);
      if (!word) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      res.setHeader("Cache-Control", "no-store");
      res.json(word);
    } catch (error) {
      console.error("Error fetching word", error);
      sendError(res, 500, "Failed to fetch word", "WORD_FETCH_FAILED");
    }
  });

  router.patch("/words/:id", requireAdminAccess, async (req, res) => {
    try {
      const id = parseWordId(req.params.id);
      if (!id) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const parsed = wordUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid word payload", "INVALID_WORD_INPUT");
      }

      const updated = await updateWordById(id, parsed.data);
      if (!updated) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating word:", error);
      if (error instanceof Error && error.message === "WORD_UPDATE_FAILED") {
        return sendError(res, 500, "Failed to update word", "WORD_UPDATE_FAILED");
      }
      sendError(res, 500, "Failed to update word", "WORD_UPDATE_FAILED");
    }
  });

  router.post("/words/:id/enrich", requireAdminAccess, async (req, res) => {
    try {
      const id = parseWordId(req.params.id);
      if (!id) {
        return sendError(res, 400, "Invalid word id", "INVALID_WORD_ID");
      }

      const parsed = wordEnrichmentRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid enrichment payload", "INVALID_WORD_ENRICH_INPUT");
      }

      const enriched = await enrichWordById(id, {
        overwrite: parsed.data.overwrite,
      });
      if (!enriched) {
        return sendError(res, 404, "Word not found", "WORD_NOT_FOUND");
      }

      res.json(enriched);
    } catch (error) {
      console.error("Error enriching word:", error);
      sendError(res, 500, "Failed to enrich word", "WORD_ENRICH_FAILED");
    }
  });

  router.post("/admin/enrichment/run", requireAdminAccess, async (req, res) => {
    try {
      const parsed = wordBatchEnrichmentRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(res, 400, "Invalid enrichment payload", "INVALID_WORD_ENRICH_INPUT");
      }

      const result = await runWordEnrichmentBatch({
        limit: parsed.data.limit ?? 25,
        mode: parsed.data.mode ?? "pending",
        onlyIncomplete: parsed.data.onlyIncomplete ?? true,
        overwrite: parsed.data.overwrite ?? false,
        pos: parsed.data.pos ?? null,
        level: parsed.data.level ?? null,
      });

      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      console.error("Error running batch enrichment:", error);
      sendError(res, 500, "Failed to run enrichment", "WORD_ENRICH_FAILED");
    }
  });

  return router;
}
