// Simple in-memory query cache for short-lived query results.
type CacheEntry = { expiresAt: number; rows: unknown[] };

const cache = new Map<string, CacheEntry>();

export function getQueryCache(key: string): unknown[] | undefined {
  try {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      cache.delete(key);
      return undefined;
    }
    // return a shallow copy to avoid accidental mutation
    return entry.rows.map((r) => (Array.isArray(r) || typeof r === 'object' ? { ...(r as any) } : r));
  } catch {
    return undefined;
  }
}

export function setQueryCache(key: string, rows: unknown[], ttlMs: number): void {
  try {
    const expiresAt = Date.now() + Math.max(0, Number(ttlMs) || 0);
    const copy = rows.map((r) => (Array.isArray(r) || typeof r === 'object' ? { ...(r as any) } : r));
    cache.set(key, { expiresAt, rows: copy });
  } catch {
    // ignore cache set errors
  }
}

export function clearQueryCache(): void {
  try {
    cache.clear();
  } catch {
    // ignore
  }
}
