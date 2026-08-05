/**
 * Server-only Coach request authentication / authorization for future /api/* routes.
 *
 * Runtime: Vercel Node serverless (Phase 2A recommendation). Not for browser bundles.
 *
 * IMPORTANT — /api/* is NOT covered by Edge middleware matcher.
 * Every future API handler MUST call requireRequestAuth (or equivalent)
 * before any business logic.
 *
 * Never uses the Supabase service role secret. Never trusts client-supplied role or organization_id alone.
 * Public errors are uniform (no account/org enumeration).
 *
 * Legacy /api/coach-data full-bank endpoint removed in Bloc 2 — use minimal /api/coach-* routes.
 */

import {
  readAccessToken,
  requireCoachSession,
} from '../security/portal-auth.mjs';

/** Documented max body size for future API consumers (bytes). */
export const MAX_API_BODY_BYTES = 262_144; // 256 KiB

/** Roles allowed for Coach API operations (DB enum coach_role). */
export const DEFAULT_ALLOWED_ROLES = Object.freeze(['coach', 'platform_owner']);

/**
 * Uniform public error codes — never leak whether user/org/role specifically failed.
 * Handlers should return only `{ error }` from these helpers to clients.
 */
export const PUBLIC_AUTH_ERROR = Object.freeze({
  unauthorized: Object.freeze({ status: 401, error: 'unauthorized' }),
  forbidden: Object.freeze({ status: 403, error: 'forbidden' }),
  misconfigured: Object.freeze({ status: 500, error: 'misconfigured' }),
  payload_too_large: Object.freeze({ status: 413, error: 'payload_too_large' }),
});

/**
 * Map internal failure reasons to public responses (anti-enumeration).
 * @param {string} [reason]
 */
export function toPublicAuthError(reason) {
  if (reason === 'missing_config') return { ...PUBLIC_AUTH_ERROR.misconfigured };
  if (
    reason === 'org_mismatch'
    || reason === 'slug_mismatch'
    || reason === 'role_not_allowed'
    || reason === 'no_organization'
    || reason === 'unknown_organization'
  ) {
    return { ...PUBLIC_AUTH_ERROR.forbidden };
  }
  return { ...PUBLIC_AUTH_ERROR.unauthorized };
}

/**
 * Reject oversized bodies before parsing (future consumers).
 * @param {number|null|undefined} contentLength
 * @param {number} [maxBytes]
 */
export function assertBodyWithinLimit(contentLength, maxBytes = MAX_API_BODY_BYTES) {
  const n = Number(contentLength);
  if (Number.isFinite(n) && n > maxBytes) {
    return { ok: false, ...PUBLIC_AUTH_ERROR.payload_too_large };
  }
  return { ok: true };
}

/**
 * Pick the membership that will authorize this request.
 * Never accepts a client role. organization_id from the client is only a selector
 * that must already appear in the session memberships.
 *
 * @param {object[]} memberships
 * @param {{ requestedOrganizationId?: string|null, allowedRoles?: readonly string[] }} opts
 */
export function resolveAuthorizedMembership(memberships, {
  requestedOrganizationId = null,
  allowedRoles = DEFAULT_ALLOWED_ROLES,
} = {}) {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return { ok: false, reason: 'no_organization' };
  }

  let selected = memberships[0];
  if (requestedOrganizationId != null && requestedOrganizationId !== '') {
    const match = memberships.find((m) => m.organization_id === requestedOrganizationId);
    if (!match) return { ok: false, reason: 'org_mismatch' };
    selected = match;
  }

  const role = selected?.role;
  if (!allowedRoles.includes(role)) {
    return { ok: false, reason: 'role_not_allowed' };
  }
  if (!selected.organization_id) {
    return { ok: false, reason: 'unknown_organization' };
  }

  return {
    ok: true,
    organizationId: selected.organization_id,
    role,
    membershipId: selected.id || null,
  };
}

/**
 * Optional slug check against Supabase (user JWT + publishable key only).
 * Fail closed on network/shape errors → forbidden (no enumeration).
 */
async function fetchOrganizationSlug({
  organizationId,
  accessToken,
  supabaseUrl,
  publishableKey,
  fetchImpl,
}) {
  const base = String(supabaseUrl).replace(/\/$/, '');
  const url = `${base}/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}&select=id,slug&limit=1`;
  const res = await fetchImpl(url, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { ok: false, reason: 'unknown_organization' };
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows[0]?.slug) {
    return { ok: false, reason: 'unknown_organization' };
  }
  return { ok: true, slug: rows[0].slug };
}

/**
 * Authenticate and authorize a Coach API request.
 *
 * @param {object} options
 * @param {string} [options.cookieHeader]
 * @param {string} [options.authorization]
 * @param {string} [options.accessToken] explicit token (tests)
 * @param {string|null} [options.requestedOrganizationId] must match a session membership
 * @param {string|null} [options.requestedOrganizationSlug] must match org slug of selected membership
 * @param {readonly string[]} [options.allowedRoles]
 * @param {string} options.supabaseUrl
 * @param {string} options.publishableKey
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<
 *   | { ok: true, userId: string, organizationId: string, role: string, organizationSlug?: string|null }
 *   | { ok: false, status: number, error: string, reason?: string }
 * >}
 *
 * On success, `reason` is never returned. On failure, `reason` is for server tests
 * only — handlers must expose only `{ error }` from `status`/`error`.
 */
export async function requireRequestAuth({
  cookieHeader,
  authorization,
  accessToken: explicitToken = null,
  requestedOrganizationId = null,
  requestedOrganizationSlug = null,
  allowedRoles = DEFAULT_ALLOWED_ROLES,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  // Deny by default until every gate passes.
  const accessToken = explicitToken || readAccessToken({ cookieHeader, authorization });
  if (!accessToken) {
    return { ok: false, ...toPublicAuthError('missing_token'), reason: 'missing_token' };
  }

  const session = await requireCoachSession({
    accessToken,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });
  if (!session.ok) {
    const pub = toPublicAuthError(session.reason);
    return { ok: false, ...pub, reason: session.reason };
  }

  const resolved = resolveAuthorizedMembership(session.memberships, {
    requestedOrganizationId,
    allowedRoles,
  });
  if (!resolved.ok) {
    const pub = toPublicAuthError(resolved.reason);
    return { ok: false, ...pub, reason: resolved.reason };
  }

  let organizationSlug = null;
  if (requestedOrganizationSlug != null && requestedOrganizationSlug !== '') {
    const org = await fetchOrganizationSlug({
      organizationId: resolved.organizationId,
      accessToken,
      supabaseUrl,
      publishableKey,
      fetchImpl,
    });
    if (!org.ok) {
      const pub = toPublicAuthError(org.reason);
      return { ok: false, ...pub, reason: org.reason };
    }
    if (org.slug !== requestedOrganizationSlug) {
      const pub = toPublicAuthError('slug_mismatch');
      return { ok: false, ...pub, reason: 'slug_mismatch' };
    }
    organizationSlug = org.slug;
  }

  return {
    ok: true,
    userId: session.user.id,
    organizationId: resolved.organizationId,
    role: resolved.role,
    organizationSlug,
  };
}

/**
 * Shape returned to HTTP clients — never includes userId/org/role/reason.
 * @param {{ status: number, error: string }} failure
 */
export function publicAuthResponseBody(failure) {
  return { error: failure.error || 'unauthorized' };
}
