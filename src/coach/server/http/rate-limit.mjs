/**
 * Best-effort in-memory rate limit for serverless instances.
 *
 * Documented limits (per isolate / cold start resets the map):
 * - 60 requests / 60s sliding window per client key (IP or user id)
 * - Not a global distributed limiter; Production hardening may add Redis later.
 *
 * Fail-open only when key is missing — still applies a coarse global bucket.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

/** @type {Map<string, number[]>} */
const buckets = new Map();

/**
 * @param {string} key
 * @param {{ max?: number, windowMs?: number, now?: number }} [opts]
 * @returns {{ ok: true } | { ok: false, status: 429, error: 'rate_limited', retryAfterSec: number }}
 */
export function checkRateLimit(key, {
  max = MAX_REQUESTS,
  windowMs = WINDOW_MS,
  now = Date.now(),
} = {}) {
  const bucketKey = String(key || 'anonymous').slice(0, 128);
  const cutoff = now - windowMs;
  const prev = (buckets.get(bucketKey) || []).filter((t) => t > cutoff);
  if (prev.length >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((prev[0] + windowMs - now) / 1000));
    return {
      ok: false,
      status: 429,
      error: 'rate_limited',
      retryAfterSec,
    };
  }
  prev.push(now);
  buckets.set(bucketKey, prev);
  return { ok: true };
}

/** Test helper — clear all buckets. */
export function resetRateLimitBuckets() {
  buckets.clear();
}

export const RATE_LIMIT_WINDOW_MS = WINDOW_MS;
export const RATE_LIMIT_MAX_REQUESTS = MAX_REQUESTS;
