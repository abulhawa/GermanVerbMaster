import { type CorsOptions } from "cors";

const DEVELOPMENT_FALLBACK_ORIGINS = [
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
] as const;

type NodeEnvironment = "development" | "production" | (string & {});

function determineNodeEnvironment(): NodeEnvironment {
  const defaultNodeEnv: NodeEnvironment = (process.env.VERCEL ? "production" : "development") as NodeEnvironment;
  return (process.env.NODE_ENV ?? defaultNodeEnv) as NodeEnvironment;
}

function parseOriginList(value?: string | readonly string[]): string[] {
  if (!value) {
    return [];
  }

  const source = typeof value === "string" ? value.split(",") : [...value];
  return source
    .map((origin: string) => origin.trim())
    .filter(Boolean);
}

export interface ResolveAllowedOriginsOptions {
  explicitOrigins?: readonly string[];
  envOrigins?: string;
  nodeEnv?: NodeEnvironment;
}

export function resolveAllowedOrigins(options: ResolveAllowedOriginsOptions = {}): readonly string[] {
  const nodeEnv = options.nodeEnv ?? determineNodeEnvironment();
  const configured = parseOriginList(options.explicitOrigins ?? []);

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  const envConfigured = parseOriginList(options.envOrigins);
  if (envConfigured.length > 0) {
    return Array.from(new Set(envConfigured));
  }

  if (nodeEnv === "production") {
    throw new Error(
      "APP_ORIGIN must be configured with at least one allowed origin when NODE_ENV is set to production.",
    );
  }

  return [...DEVELOPMENT_FALLBACK_ORIGINS];
}

export function buildCorsOptions(allowedOrigins: readonly string[]): CorsOptions {
  if (allowedOrigins.length === 0) {
    throw new Error("An allow list of origins is required to configure CORS.");
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

export const developmentFallbackOrigins: readonly string[] = DEVELOPMENT_FALLBACK_ORIGINS;
