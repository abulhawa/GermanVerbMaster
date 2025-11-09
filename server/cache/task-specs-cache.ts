import { ensureTaskSpecsSynced, getTaskSpecSyncMetadata } from '../tasks/synchronizer.js';

const DEFAULT_CACHE_TTL_MS = 60_000;
const CACHE_TTL_ENV_KEYS = ['TASK_SPEC_CACHE_TTL_MS', 'TASK_SPEC_FEED_CACHE_TTL_MS'] as const;

let cacheTtlOverrideMs: number | null = null;
let refreshPromise: Promise<void> | null = null;

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, parsed);
}

export function getTaskSpecCacheTtlMs(): number {
  if (cacheTtlOverrideMs !== null) {
    return cacheTtlOverrideMs;
  }

  for (const key of CACHE_TTL_ENV_KEYS) {
    const parsed = parsePositiveNumber(process.env[key]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return DEFAULT_CACHE_TTL_MS;
}

export function setTaskSpecCacheTtlMs(value: number | null): void {
  if (value === null) {
    cacheTtlOverrideMs = null;
    return;
  }

  if (!Number.isFinite(value)) {
    throw new Error('Task spec cache TTL override must be a finite number or null');
  }

  cacheTtlOverrideMs = Math.max(0, value);
}

export function resetTaskSpecCache(): void {
  refreshPromise = null;
}

export function isTaskSpecCacheStale(now: number = Date.now()): boolean {
  const ttlMs = getTaskSpecCacheTtlMs();
  if (!Number.isFinite(ttlMs)) {
    return false;
  }

  const metadata = getTaskSpecSyncMetadata();
  const lastCompletedAt = metadata.lastRunCompletedAt?.getTime() ?? null;
  if (!lastCompletedAt) {
    return true;
  }

  if (ttlMs <= 0) {
    return true;
  }

  return now - lastCompletedAt >= ttlMs;
}

export async function ensureTaskSpecCacheFresh(): Promise<void> {
  if (!isTaskSpecCacheStale()) {
    return;
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        await ensureTaskSpecsSynced();
      } finally {
        refreshPromise = null;
      }
    })();
  }

  await refreshPromise;
}
