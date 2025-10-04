import { createHash } from "node:crypto";
import type { Pool } from "pg";

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  remaining: number;
  resetAt: Date;
}

type DatabaseClientModule = typeof import("../db/client.js");

let configuredPool: Pool | undefined;
let lastCleanup = 0;
const memoryCounters = new Map<string, { hits: number; expiresAt: number }>();
let lastMemoryCleanup = 0;
let clientModulePromise: Promise<DatabaseClientModule> | undefined;

export function configureRateLimitPool(pool: Pool | undefined): void {
  configuredPool = pool;
  if (pool) {
    memoryCounters.clear();
    lastMemoryCleanup = 0;
  }
}

function shouldUseMemoryFallback(error: unknown): boolean {
  if (configuredPool) {
    return false;
  }

  const fallbackFlag = process.env.RATE_LIMIT_MEMORY_FALLBACK ?? "";
  const fallbackEnabled = ["1", "true", "yes"].includes(fallbackFlag.toLowerCase());

  if (fallbackEnabled || process.env.NODE_ENV === "test") {
    return true;
  }

  if (error instanceof Error && /database_url is not configured/i.test(error.message)) {
    return true;
  }

  return false;
}

async function loadDatabaseClient(): Promise<DatabaseClientModule> {
  if (!clientModulePromise) {
    clientModulePromise = import("../db/client.js");
  }
  return clientModulePromise;
}

async function resolvePool(): Promise<Pool> {
  if (configuredPool) {
    return configuredPool;
  }

  const client = await loadDatabaseClient();
  return client.getPool();
}

async function cleanupExpiredCounters(pool: Pool): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < 60_000) {
    return;
  }

  lastCleanup = now;

  try {
    await pool.query(
      "delete from rate_limit_counters where expires_at < now() - interval '5 minutes'",
    );
  } catch (error) {
    console.warn("Failed to clean up expired rate limits", error);
  }
}

export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cleanupMemoryCounters(now: number): void {
  if (now - lastMemoryCleanup < 60_000) {
    return;
  }

  lastMemoryCleanup = now;

  for (const [bucket, entry] of memoryCounters) {
    if (entry.expiresAt <= now) {
      memoryCounters.delete(bucket);
    }
  }
}

export async function enforceRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowMs } = options;
  if (!key || !key.trim()) {
    throw new Error("Rate limit key must be provided");
  }

  if (windowMs <= 0) {
    throw new Error("Rate limit window must be greater than zero");
  }

  if (limit <= 0) {
    throw new Error("Rate limit must be greater than zero");
  }

  const normalizedKey = key.trim();
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + windowMs);

  let pool: Pool | undefined;
  try {
    pool = await resolvePool();
  } catch (error) {
    if (!shouldUseMemoryFallback(error)) {
      throw error;
    }
  }

  if (!pool) {
    const bucketKey = `${normalizedKey}:${windowStartMs}`;
    const existing = memoryCounters.get(bucketKey);
    const hits = (existing?.hits ?? 0) + 1;
    memoryCounters.set(bucketKey, { hits, expiresAt: resetAt.getTime() });
    cleanupMemoryCounters(now);

    const allowed = hits <= limit;
    const remaining = allowed ? Math.max(0, limit - hits) : 0;

    return {
      allowed,
      hits,
      remaining,
      resetAt,
    };
  }

  const result = await pool.query<{ hits: number }>(
    `insert into rate_limit_counters as counters (key, window_start, hits, expires_at)
     values ($1, $2, 1, $3)
     on conflict (key, window_start)
     do update set
       hits = counters.hits + 1,
       updated_at = now()
     returning hits`,
    [normalizedKey, windowStart, resetAt],
  );

  const hits = Number(result.rows[0]?.hits ?? 0);
  const allowed = hits <= limit;
  const remaining = allowed ? Math.max(0, limit - hits) : 0;

  void cleanupExpiredCounters(pool);

  return {
    allowed,
    hits,
    remaining,
    resetAt,
  };
}
