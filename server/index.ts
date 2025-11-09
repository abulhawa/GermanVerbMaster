import { createApiApp } from "./api/app.js";
import { createServer } from "http";
import { serveStatic } from "./serve-static.js";
import { log, logError } from "./logger.js";

const defaultNodeEnv = process.env.VERCEL ? "production" : "development";
process.env.NODE_ENV = process.env.NODE_ENV ?? defaultNodeEnv;

const app = createApiApp();

const nodeEnv = process.env.NODE_ENV ?? defaultNodeEnv;
app.set("env", nodeEnv);

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

    const defaultPort = 5000;
    const resolvedPort = (() => {
      const envPort = process.env.PORT;

      if (!envPort) {
        return defaultPort;
      }

      const parsedPort = Number.parseInt(envPort, 10);

      if (Number.isNaN(parsedPort)) {
        return defaultPort;
      }

      return parsedPort;
    })();

    server.listen(resolvedPort, "0.0.0.0", () => {
      log(`serving on port ${resolvedPort}`);
    });
  } catch (error) {
    logError(error, "server-startup");
    process.exit(1);
  }
})();
