import type { Express } from "express";
import { createAdminRouter } from "./routes/admin.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPracticeHistoryRouter } from "./routes/practice-history.js";
import { createTaskRouter } from "./routes/tasks.js";

// The routing surface is split across domain-specific routers located in
// server/routes/*.ts. This file now focuses on wiring those routers together in
// the correct order so middleware like the auth session attachment continues to
// run before downstream handlers.

export function registerRoutes(app: Express): void {
  const authRouter = createAuthRouter();
  const taskRouter = createTaskRouter();
  const practiceHistoryRouter = createPracticeHistoryRouter();
  const adminRouter = createAdminRouter();

  app.use("/api", authRouter);
  app.use("/api", taskRouter);
  app.use("/api", practiceHistoryRouter);
  app.use("/api", adminRouter);
}
