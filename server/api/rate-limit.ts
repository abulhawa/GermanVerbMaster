import { createHash } from "node:crypto";

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

const memoryCounters = new Map<string, { hits: number; expiresAt: number }>();
let lastMemoryCleanup = 0;

/**
 * Clears the in-memory rate limit counters.
 *
 * Historically this helper configured a shared database pool. The partner
 * integration tables that backed the persistent implementation have been
 * removed, so the function now simply resets the ephemeral store while
 * keeping the public API available for existing callers.
 */
export function configureRateLimitPool(): void {
  memoryCounters.clear();
  lastMemoryCleanup = 0;
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
  const resetAt = new Date(windowStartMs + windowMs);

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
