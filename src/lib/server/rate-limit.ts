/**
 * In-memory windowed rate limiter for edge runtime.
 *
 * Map<ip, Entry>, 60s window, 5 calls/IP/window by default.
 * Supports optional `bucket` to namespace different endpoints.
 *
 * Known limitation: Vercel Edge Functions run in isolated V8 instances, so this
 * Map is per-instance, not global. For a single-IP demo this is fine. Bot traffic
 * across instances could bypass.
 * TODO: Upstash Redis se virar produção.
 *
 * x-forwarded-for spoofing: caller must pass the leftmost value (first hop) after
 * `.split(',')[0].trim()`. On Vercel this is the real client IP.
 */

interface Entry {
  count: number;
  windowStart: number;
}

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  bucket?: string;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 5;

const buckets = new Map<string, Entry>();

function key(bucket: string, ip: string): string {
  return `${bucket}:${ip}`;
}

export function checkRateLimit(
  ip: string,
  opts: RateLimitOptions = {},
): { ok: true } | { ok: false; retryAfter: number } {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const max = opts.max ?? DEFAULT_MAX;
  const bucket = opts.bucket ?? "default";

  const k = key(bucket, ip);
  const now = Date.now();
  const e = buckets.get(k);

  if (!e || now - e.windowStart >= windowMs) {
    buckets.set(k, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (e.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - e.windowStart)) / 1000));
    return { ok: false, retryAfter };
  }

  e.count += 1;
  return { ok: true };
}

export function resetRateLimitForTest(): void {
  buckets.clear();
}
