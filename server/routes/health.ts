import { Router } from "express";

import { getPool } from "../../db/client.js";

type ReadinessError = Error & { status?: number; cause?: unknown };

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.get("/readyz", async (_req, res, next) => {
    try {
      await getPool().query("select 1");
      res.status(200).json({ status: "ready" });
    } catch (cause) {
      const readinessError: ReadinessError = new Error("Database not ready");
      readinessError.status = 503;
      readinessError.cause = cause;
      next(readinessError);
    }
  });

  return router;
}

