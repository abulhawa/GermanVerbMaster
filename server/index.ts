import { createApiApp } from "./api/app.js";
import { createServer } from "http";
import { serveStatic } from "./serve-static.js";
import { log, logError } from "./logger.js";
import { getPool } from "../db/client.js";

const defaultNodeEnv = process.env.VERCEL ? "production" : "development";
process.env.NODE_ENV = process.env.NODE_ENV ?? defaultNodeEnv;

const SHUTDOWN_TIMEOUT_MS = 10_000;

let serverInstance: ReturnType<typeof createServer> | undefined;
let isShuttingDown = false;

async function closeServer(): Promise<void> {
  const instance = serverInstance;

  if (!instance) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    instance.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  serverInstance = undefined;
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  log(`received ${signal}, starting graceful shutdown`);

  const timeoutError = new Error("Graceful shutdown timed out");
  const shutdownSequence = (async () => {
    let capturedError: unknown;

    try {
      await closeServer();
    } catch (error) {
      capturedError = error;
    }

    try {
      await getPool().end();
    } catch (error) {
      if (capturedError) {
        logError(error, "server-shutdown");
      } else {
        capturedError = error;
      }
    }

    if (capturedError) {
      throw capturedError;
    }
  })();

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(timeoutError);
    }, SHUTDOWN_TIMEOUT_MS);
  });

  try {
    await Promise.race([shutdownSequence, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    log("graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logError(error, "server-shutdown");
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    process.exit(1);
  }
}

const app = createApiApp();

const nodeEnv = process.env.NODE_ENV ?? defaultNodeEnv;
app.set("env", nodeEnv);

function registerShutdownHandler(signal: NodeJS.Signals): void {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

registerShutdownHandler("SIGTERM");
registerShutdownHandler("SIGINT");

(async () => {
  try {
    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    const server = createServer(app);
    serverInstance = server;

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
