import type { AnalyticsScope } from "./types.js";

interface CacheEntry {
  result: unknown;
  expiresAt: number;
  scope: AnalyticsScope;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory cache (could swap for Redis later)
const store = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.result as T;
}

export function cacheSet<T>(
  key: string,
  value: T,
  scope: AnalyticsScope,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  store.set(key, {
    result: value,
    expiresAt: Date.now() + ttlMs,
    scope,
  });
}

/**
 * Clears all cache entries whose scope overlaps with the given scope.
 * Called after uploads or consent changes.
 */
export function cacheInvalidate(scope: AnalyticsScope): void {
  for (const [key, entry] of store) {
    const s = entry.scope;
    // Same institution is always an overlap
    if (s.institutionId !== scope.institutionId) continue;
    // If the invalidation scope is institution-wide, clear everything
    if (!scope.courseId) {
      store.delete(key);
      continue;
    }
    // If cached entry is institution-wide, it overlaps with any course
    if (!s.courseId) {
      store.delete(key);
      continue;
    }
    // Same course
    if (s.courseId === scope.courseId) {
      store.delete(key);
      continue;
    }
  }
}

/**
 * Check cache first; compute and store if miss.
 */
export async function withCache<T>(
  key: string,
  scope: AnalyticsScope,
  compute: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<{ data: T; cached: boolean }> {
  const cached = cacheGet<T>(key);
  if (cached !== null) {
    return { data: cached, cached: true };
  }
  const data = await compute();
  cacheSet(key, data, scope, ttlMs);
  return { data, cached: false };
}

/** Clear the entire cache (useful for testing). */
export function cacheClear(): void {
  store.clear();
}
