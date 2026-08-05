/**
 * Rate limiting for Coach APIs.
 *
 * Default: in-memory sliding window (per Vercel isolate).
 * Optional distributed backend: Supabase RPC `coach_consume_rate_limit`
 * when COACH_RATE_LIMIT_BACKEND=supabase and migration is applied.
 *
 * Fail-closed for over-limit; fail-open to memory when distributed backend errors.
 */

import { getRateLimitProfile } from './rate-limit-profiles.mjs';
import { hashRateIdentity } from './redact.mjs';

/** @type {Map<string, number[]>} */
const buckets = new Map();

/**
 * @param {string} key
 * @param {{ max?: number, windowMs?: number, now?: number }} [opts]
 * @returns {{ ok: true } | { ok: false, status: 429, error: 'rate_limited', retryAfterSec: number }}
 */
export function checkRateLimit(key, {
  max,
  windowMs,
  now = Date.now(),
} = {}) {
  const profile = { max: max ?? 60, windowMs: windowMs ?? 60_000 };
  const bucketKey = String(key || 'anonymous').slice(0, 180);
  const cutoff = now - profile.windowMs;
  const prev = (buckets.get(bucketKey) || []).filter((t) => t > cutoff);
  if (prev.length >= profile.max) {
    const retryAfterSec = Math.max(1, Math.ceil((prev[0] + profile.windowMs - now) / 1000));
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

/**
 * Apply a named route profile (memory).
 * @param {string} routeName
 * @param {string} identityKey
 */
export function checkRouteRateLimit(routeName, identityKey) {
  const profile = getRateLimitProfile(routeName);
  return checkRateLimit(`${routeName}:${identityKey}`, profile);
}

/**
 * Build a non-reversible identity key from request + optional auth.
 * @param {{
 *   req?: { headers?: Record<string, string|string[]|undefined>, socket?: { remoteAddress?: string } },
 *   userId?: string|null,
 *   organizationId?: string|null,
 * }} input
 */
export function buildRateIdentityKey({ req, userId = null, organizationId = null } = {}) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const rawIp = String(
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    || req?.socket?.remoteAddress
    || 'unknown',
  ).split(',')[0].trim();
  const ipHash = hashRateIdentity(rawIp);
  if (userId && organizationId) return `u:${userId}:o:${organizationId}:${ipHash}`;
  if (userId) return `u:${userId}:${ipHash}`;
  return ipHash;
}

/**
 * Distributed check when enabled; otherwise memory.
 * @param {{
 *   routeName: string,
 *   identityKey: string,
 *   supabaseUrl?: string,
 *   accessToken?: string|null,
 *   publishableKey?: string,
 * }} opts
 */
export async function checkDistributedRateLimit({
  routeName,
  identityKey,
  supabaseUrl = '',
  accessToken = null,
  publishableKey = '',
}) {
  const profile = getRateLimitProfile(routeName);
  const backend = String(process.env.COACH_RATE_LIMIT_BACKEND || 'memory').toLowerCase();
  if (backend === 'supabase' && supabaseUrl && publishableKey) {
    try {
      const { consumeSupabaseRateLimit } = await import('./rate-limit-supabase.mjs');
      const remote = await consumeSupabaseRateLimit({
        bucketKey: `${routeName}:${identityKey}`.slice(0, 180),
        max: profile.max,
        windowMs: profile.windowMs,
        supabaseUrl,
        publishableKey,
        accessToken,
      });
      if (remote) return remote;
    } catch {
      // Fall through to memory — never fail the request open without a limit.
    }
  }
  return checkRateLimit(`${routeName}:${identityKey}`, profile);
}

/** Test helper — clear all buckets. */
export function resetRateLimitBuckets() {
  buckets.clear();
}

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 60;
