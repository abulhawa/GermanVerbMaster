import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";

import { registerRoutes } from "../routes.js";
import { logError } from "../logger.js";
import { buildCorsOptions, resolveAllowedOrigins } from "../config/cors.js";

export interface CreateApiAppOptions {
  /**
   * Enable CORS middleware. Enabled by default to mirror the production API.
   */
  enableCors?: boolean;
  /**
   * Optional explicit list of origins allowed by CORS.
   */
  allowedOrigins?: readonly string[];
  /**
   * Rethrow errors after sending the JSON payload. Disabled by default so
   * handlers cannot crash the server.
   */
  rethrowErrors?: boolean;
}

export function createApiApp(options: CreateApiAppOptions = {}): Express {
  const app = express();

  const enableCors = options.enableCors ?? true;
  const rethrowErrors = options.rethrowErrors ?? false;
  if (enableCors) {
    const configuredOrigins = resolveAllowedOrigins({
      explicitOrigins: options.allowedOrigins,
      envOrigins: process.env.APP_ORIGIN,
    });

    app.use(cors(buildCorsOptions(configuredOrigins)));
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  registerRoutes(app);

  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = error?.status ?? error?.statusCode ?? 500;
    const message = error?.message ?? "Internal Server Error";

    if (!rethrowErrors && error) {
      logError(error);
    }

    if (res.headersSent) {
      if (rethrowErrors && error) {
        throw error;
      }
      return res.end();
    }

    res.status(status).json({ error: message });

    if (rethrowErrors && error) {
      throw error;
    }
  });

  return app;
}

