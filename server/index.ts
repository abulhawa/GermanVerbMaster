import { createApiApp } from "./api/app.js";
import { createServer } from "http";
import { serveStatic } from "./serve-static.js";
import { log, logError } from "./logger.js";
import { requestLogger } from "./middleware/request-logger.js";

const defaultNodeEnv = process.env.VERCEL ? "production" : "development";
process.env.NODE_ENV = process.env.NODE_ENV ?? defaultNodeEnv;

const app = createApiApp();

const nodeEnv = process.env.NODE_ENV ?? defaultNodeEnv;
app.set("env", nodeEnv);

app.use(requestLogger);

(async () => {
  try {
    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    const server = createServer(app);

    if (nodeEnv === "development") {
      const { setupVite } = await import("./vite.js");
      await setupVite(app, server);
    } else {
      await serveStatic(app);
    }

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client
    const PORT = 5000;
    server.listen(PORT, "0.0.0.0", () => {
      log(`serving on port ${PORT}`);
    });
  } catch (error) {
    logError(error, "server-startup");
    process.exit(1);
  }
})();
