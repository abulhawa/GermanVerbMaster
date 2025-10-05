import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors, { type CorsOptions } from "cors";

import { registerRoutes } from "../routes.js";

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
   * Rethrow errors after sending the JSON payload. Enabled by default so the
   * dev server logs unhandled failures.
   */
  rethrowErrors?: boolean;
}

function buildCorsOptions(allowedOrigins: readonly string[] = []): CorsOptions {
  if (allowedOrigins.length === 0) {
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  } satisfies CorsOptions;
}

export function createApiApp(options: CreateApiAppOptions = {}): Express {
  const app = express();

  const enableCors = options.enableCors ?? true;
  if (enableCors) {
    const configuredOrigins = options.allowedOrigins ?? (process.env.APP_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    app.use(cors(buildCorsOptions(configuredOrigins)));
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  registerRoutes(app);

  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = error?.status ?? error?.statusCode ?? 500;
    const message = error?.message ?? "Internal Server Error";

    if (res.headersSent) {
      return res.end();
    }

    res.status(status).json({ error: message });

    if (options.rethrowErrors !== false && error) {
      throw error;
    }
  });

  return app;
}

