import rateLimit, { type Options as RateLimitOptions, type RateLimitRequestHandler } from "express-rate-limit";

const DEFAULT_AUTH_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_AUTH_LIMIT = 5;

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export interface AuthRateLimitOptions {
  windowMs: number;
  limit: number;
}

export function resolveAuthRateLimitOptions(env: NodeJS.ProcessEnv = process.env): AuthRateLimitOptions {
  const windowMs = parsePositiveInteger(env.AUTH_RATE_LIMIT_WINDOW_MS) ?? DEFAULT_AUTH_WINDOW_MS;
  const limit = parsePositiveInteger(env.AUTH_RATE_LIMIT_MAX) ?? DEFAULT_AUTH_LIMIT;

  return { windowMs, limit } satisfies AuthRateLimitOptions;
}

export function createAuthRateLimiter(): RateLimitRequestHandler {
  const { windowMs, limit } = resolveAuthRateLimitOptions();

  const options = {
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Please try again later." },
    statusCode: 429,
  } satisfies Partial<RateLimitOptions>;

  return rateLimit(options);
}

export const authRateLimitedPaths: readonly string[] = ["/api/auth"] as const;
