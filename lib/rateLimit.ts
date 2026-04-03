/**
 * In-memory sliding window rate limiter.
 *
 * LIMITATION: This uses a module-level Map that resets on every serverless cold start.
 * In Vercel's serverless environment, each function invocation may get a fresh instance,
 * making this rate limiter ineffective for distributed rate limiting.
 *
 * CORRECT FIX: Move rate limit state to Redis (e.g. Upstash) or a Supabase RPC counter.
 * This in-memory implementation is a best-effort guard only — it works within a single
 * long-lived process but not across serverless invocations.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const CLEANUP_INTERVAL_MS = 300_000;
const MAX_ENTRIES = 10_000;

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

if (process.env.NODE_ENV === "production") {
  console.warn(
    "[rateLimit] Using in-memory rate limiter in production. " +
    "This is not persistent across serverless invocations. " +
    "Consider migrating to Redis or Supabase-backed rate limiting."
  );
}

function evictOldestEntries(): void {
  if (store.size <= MAX_ENTRIES) return;
  const entriesToEvict = store.size - MAX_ENTRIES;
  const iterator = store.keys();
  for (let i = 0; i < entriesToEvict; i++) {
    const key = iterator.next().value;
    if (key) store.delete(key);
  }
}

export function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const entry = store.get(identifier) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
  if (entry.timestamps.length >= MAX_REQUESTS_PER_WINDOW) return true;
  entry.timestamps.push(now);
  store.set(identifier, entry);
  evictOldestEntries();
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
