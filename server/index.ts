import { createApiApp } from "./api/app.js";
import { createServer } from "http";
import type { Socket } from "net";
import { serveStatic } from "./serve-static.js";
import { log, logError } from "./logger.js";
import { getPool } from "../db/client.js";

const defaultNodeEnv = process.env.VERCEL ? "production" : "development";
process.env.NODE_ENV = process.env.NODE_ENV ?? defaultNodeEnv;

let serverInstance: ReturnType<typeof createServer> | undefined;
let isShuttingDown = false;
const trackedSockets = new Set<Socket>();

function trackConnections(server: ReturnType<typeof createServer>): void {
  server.on("connection", (socket) => {
    trackedSockets.add(socket);
    socket.once("close", () => {
      trackedSockets.delete(socket);
    });
  });
}

function destroyOpenSockets(): void {
  for (const socket of trackedSockets) {
    socket.destroy();
    trackedSockets.delete(socket);
  }
}

async function closeServer(): Promise<void> {
  const instance = serverInstance;

  if (!instance) {
    return;
  }

  destroyOpenSockets();
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

  destroyOpenSockets();
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  log(`received ${signal}, starting graceful shutdown`);

  let shutdownError: unknown;

  try {
    await closeServer();
  } catch (error) {
    shutdownError = error ?? shutdownError;
  }

  try {
    await getPool().end();
  } catch (error) {
    if (shutdownError) {
      logError(error, "server-shutdown");
    } else {
      shutdownError = error;
    }
  }

  if (shutdownError) {
    logError(shutdownError as Error, "server-shutdown");
    void process.exit(1);
    return;
  }

  log("graceful shutdown completed");
  void process.exit(0);
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
    trackConnections(server);

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
