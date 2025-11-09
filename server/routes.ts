import type { Express } from "express";
import { createAuthRouter } from "./routes/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createPracticeHistoryRouter } from "./routes/practice-history.js";
import { createTaskRouter } from "./routes/tasks.js";
import { createAdminRouter } from "./routes/admin.js";
import { isAdminFeatureEnabled } from "./config.js";

// The routing surface is split across domain-specific routers located in
// server/routes/*.ts. This file now focuses on wiring those routers together in
// the correct order so middleware like the auth session attachment continues to
// run before downstream handlers.

export function registerRoutes(app: Express): void {
  const healthRouter = createHealthRouter();
  const authRouter = createAuthRouter();
  const taskRouter = createTaskRouter();
  const practiceHistoryRouter = createPracticeHistoryRouter();

  app.use(healthRouter);
  app.use("/api", authRouter);
  app.use("/api", taskRouter);
  app.use("/api", practiceHistoryRouter);
  if (isAdminFeatureEnabled()) {
    const adminRouter = createAdminRouter();
    app.use("/api", adminRouter);
  }
}
