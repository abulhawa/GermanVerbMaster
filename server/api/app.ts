import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet, { type HelmetOptions } from "helmet";

import { registerRoutes } from "../routes.js";
import { logError } from "../logger.js";
import { requestLogger } from "../middleware/request-logger.js";
import { buildCorsOptions, resolveAllowedOrigins } from "../config/cors.js";
import { authRateLimitedPaths, createAuthRateLimiter } from "../middleware/rate-limit.js";

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

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const defaultNodeEnv = process.env.VERCEL ? "production" : "development";
  const nodeEnv = process.env.NODE_ENV ?? defaultNodeEnv;
  const isProduction = nodeEnv === "production";

  const connectSrc: string[] = ["'self'"];
  if (!isProduction) {
    // Allow local Vite development tooling (HTTP + WebSocket) to reach the API while
    // keeping the production policy tightly scoped to the deployed origin.
    connectSrc.push(
      "http://localhost:5000",
      "ws://localhost:5000",
      "http://127.0.0.1:5000",
      "ws://127.0.0.1:5000",
    );
  }

  const scriptSrc: string[] = ["'self'"];
  if (!isProduction) {
    // Vite injects an inline React refresh preamble in development.
    // Allow it explicitly so the dev client can boot without violating the CSP.
    scriptSrc.push("'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'");
  }
  
  const workerSrc: string[] = ["'self'"];
  if (!isProduction) {
    // Vite's dev client creates blob: workers for HMR. Allow blob: in dev only.
    workerSrc.push('blob:');
  }

  const helmetOptions: HelmetOptions = {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc,
        // Allow blob: worker sources in development so Vite HMR can create blob workers
        workerSrc,
        fontSrc: ["'self'", "https:", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc,
        // React components from Radix UI rely on inline styles for dynamic rendering.
        // Preserve Helmet's default allowance so CSP does not break those components,
        // and explicitly allow Google Fonts stylesheets consumed by the client UI.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "deny" },
    hsts: isProduction
      ? {
          maxAge: 63072000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    referrerPolicy: { policy: "no-referrer" },
  };

  app.use(helmet(helmetOptions));

  app.use(requestLogger);

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

  for (const path of authRateLimitedPaths) {
    app.use(path, createAuthRateLimiter());
  }

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

