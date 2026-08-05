/**
 * Rate limiting for Coach APIs.
 *
 * Backends:
 * - memory: allowed in test / local / Preview when explicitly selected (or default
 *   outside Production). Forbidden in Production (VERCEL_ENV=production).
 * - supabase: distributed RPC. On RPC failure in Production/Preview with this
 *   backend → HTTP 503 (fail-closed). Never falls back to memory after a failed RPC.
 */

import { getRateLimitProfile } from './rate-limit-profiles.mjs';
import { hashRateIdentity } from './redact.mjs';

/** @type {Map<string, number[]>} */
const buckets = new Map();

const RETRY_AFTER_UNAVAILABLE_SEC = 5;
const RETRY_AFTER_MISCONFIGURED_SEC = 30;

/**
 * @returns {'production'|'preview'|'development'|'test'}
 */
export function resolveDeployEnv({
  vercelEnv = process.env.VERCEL_ENV,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const v = String(vercelEnv || '').toLowerCase();
  if (v === 'production' || v === 'preview' || v === 'development') return v;
  if (String(nodeEnv || '').toLowerCase() === 'test') return 'test';
  return 'development';
}

/**
 * @returns {'memory'|'supabase'|null} null = unset
 */
export function resolveRateLimitBackend({
  configured = process.env.COACH_RATE_LIMIT_BACKEND,
} = {}) {
  const raw = String(configured || '').trim().toLowerCase();
  if (raw === 'supabase' || raw === 'memory') return raw;
  return null;
}

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
 * @param {string} routeName
 * @param {string} identityKey
 */
export function checkRouteRateLimit(routeName, identityKey) {
  const profile = getRateLimitProfile(routeName);
  return checkRateLimit(`${routeName}:${identityKey}`, profile);
}

/**
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
  const userPart = userId ? hashRateIdentity(String(userId)).replace(/^ip_/, 'u_') : null;
  const orgPart = organizationId
    ? hashRateIdentity(String(organizationId)).replace(/^ip_/, 'o_')
    : null;
  if (userPart && orgPart) return `${userPart}:${orgPart}:${ipHash}`;
  if (userPart) return `${userPart}:${ipHash}`;
  return ipHash;
}

/**
 * @typedef {{
 *   ok: true,
 *   backend: 'memory'|'supabase',
 * } | {
 *   ok: false,
 *   status: number,
 *   error: string,
 *   retryAfterSec: number,
 *   backend: 'memory'|'supabase',
 *   category?: string,
 * }} RateLimitDecision
 */

/**
 * @param {{
 *   routeName: string,
 *   identityKey: string,
 *   supabaseUrl?: string,
 *   accessToken?: string|null,
 *   publishableKey?: string,
 *   deployEnv?: ReturnType<typeof resolveDeployEnv>,
 *   backend?: ReturnType<typeof resolveRateLimitBackend>,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<RateLimitDecision>}
 */
export async function checkDistributedRateLimit({
  routeName,
  identityKey,
  supabaseUrl = '',
  accessToken = null,
  publishableKey = '',
  deployEnv = resolveDeployEnv(),
  backend = resolveRateLimitBackend(),
  fetchImpl,
}) {
  const profile = getRateLimitProfile(routeName);
  const bucketKey = `${routeName}:${identityKey}`.slice(0, 180);

  // Unset backend: Production refuses; Preview/dev/test may use memory.
  if (backend == null) {
    if (deployEnv === 'production') {
      return {
        ok: false,
        status: 503,
        error: 'rate_limit_misconfigured',
        retryAfterSec: RETRY_AFTER_MISCONFIGURED_SEC,
        backend: 'memory',
        category: 'backend_unset_in_production',
      };
    }
    backend = 'memory';
  }

  if (backend === 'memory') {
    if (deployEnv === 'production') {
      return {
        ok: false,
        status: 503,
        error: 'rate_limit_misconfigured',
        retryAfterSec: RETRY_AFTER_MISCONFIGURED_SEC,
        backend: 'memory',
        category: 'memory_forbidden_in_production',
      };
    }
    const mem = checkRateLimit(bucketKey, profile);
    if (mem.ok) return { ok: true, backend: 'memory' };
    return { ...mem, backend: 'memory', category: 'limit_reached' };
  }

  // backend === 'supabase' — never fall back to memory after RPC failure
  if (!supabaseUrl || !publishableKey) {
    return {
      ok: false,
      status: 503,
      error: 'rate_limit_misconfigured',
      retryAfterSec: RETRY_AFTER_MISCONFIGURED_SEC,
      backend: 'supabase',
      category: 'missing_supabase_env',
    };
  }

  try {
    const { consumeSupabaseRateLimit } = await import('./rate-limit-supabase.mjs');
    const remote = await consumeSupabaseRateLimit({
      bucketKey,
      max: profile.max,
      windowMs: profile.windowMs,
      supabaseUrl,
      publishableKey,
      accessToken,
      fetchImpl,
    });
    if (remote.kind === 'allowed') {
      return { ok: true, backend: 'supabase' };
    }
    if (remote.kind === 'limited') {
      return {
        ok: false,
        status: 429,
        error: 'rate_limited',
        retryAfterSec: remote.retryAfterSec,
        backend: 'supabase',
        category: 'limit_reached',
      };
    }
    return {
      ok: false,
      status: 503,
      error: 'rate_limit_unavailable',
      retryAfterSec: RETRY_AFTER_UNAVAILABLE_SEC,
      backend: 'supabase',
      category: remote.category || 'rpc_unavailable',
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'rate_limit_unavailable',
      retryAfterSec: RETRY_AFTER_UNAVAILABLE_SEC,
      backend: 'supabase',
      category: 'rpc_exception',
    };
  }
}

/** Test helper — clear all buckets. */
export function resetRateLimitBuckets() {
  buckets.clear();
}

export const RATE_LIMIT_WINDOW_MS = 60_000;
/** Default profile max — keep in sync with rate-limit-profiles.default.max */
export const RATE_LIMIT_MAX_REQUESTS = 120;
export { RETRY_AFTER_UNAVAILABLE_SEC, RETRY_AFTER_MISCONFIGURED_SEC };
