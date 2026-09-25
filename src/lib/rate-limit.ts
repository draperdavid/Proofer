// Simple in-memory fixed-window rate limiter for public, unauthenticated endpoints.
// Cloudflare Workers isolates are ephemeral and not shared across edge locations,
// so this is a best-effort throttle rather than a hard guarantee — acceptable per
// the Phase 1 spec, which explicitly defers a durable (KV/table-backed) limiter
// until this proves insufficient.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const MAX_TRACKED_KEYS = 10_000;

const hits = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;

  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of hits) {
      if (now - v.windowStart > WINDOW_MS) hits.delete(k);
    }
  }

  return entry.count > MAX_PER_WINDOW;
}
