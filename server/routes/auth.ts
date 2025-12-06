import { Router } from "express";
import { authRouter as betterAuthRouter, socialProviders } from "../auth/index.js";
import { attachAuthSessionMiddleware } from "./middleware.js";
import { getSessionRole, toIsoString } from "./shared.js";

export function createAuthRouter(): Router {
  const router = Router();

  router.use("/auth", betterAuthRouter);

  router.get("/auth/providers", (_req, res) => {
    const enabledProviders = Object.entries(socialProviders)
      .filter(([, provider]) => provider?.enabled)
      .map(([key]) => key);

    res.json({ providers: enabledProviders });
  });

  router.use(attachAuthSessionMiddleware);

  router.get("/me", async (req, res, next) => {
    try {
      const authSession = req.authSession ?? undefined;
      const activeSession = authSession?.session ?? null;
      const user = authSession?.user ?? null;

      if (!authSession || !activeSession || !user) {
        return res.status(401).json({
          error: "Not authenticated",
          code: "UNAUTHENTICATED",
        });
      }

      const resolvedRole = getSessionRole(authSession) ?? "standard";

      res.setHeader("Cache-Control", "no-store");

      const activeSessionRecord = activeSession as Record<string, any>;
      const userRecord = user as Record<string, any>;

      return res.json({
        session: {
          id: activeSessionRecord.id,
          expiresAt: activeSessionRecord.expiresAt ? toIsoString(activeSessionRecord.expiresAt) : null,
        },
        user: {
          id: userRecord.id,
          name: userRecord.name,
          email: userRecord.email,
          image: userRecord.image ?? null,
          emailVerified: Boolean(userRecord.emailVerified),
          role: resolvedRole,
          createdAt: userRecord.createdAt ? toIsoString(userRecord.createdAt) : null,
          updatedAt: userRecord.updatedAt ? toIsoString(userRecord.updatedAt) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
