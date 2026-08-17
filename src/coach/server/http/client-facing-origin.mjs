/**
 * Canonical public origin for client invitation URLs.
 * Intake and motivation must use this helper only.
 * Never pin invitations to an immutable Vercel deployment hostname.
 */

import { allowedCorsOrigin } from '../../security/portal-auth.mjs';

export const PRODUCTION_CLIENT_ORIGIN = 'https://app.krkinetics.com';
export const LOCAL_CLIENT_ORIGIN = 'http://127.0.0.1:4190';
export const INTEGRATION_PROFIL_MOTIVATIONNEL_REF = 'integration/profil-motivationnel';
export const INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN =
  'https://equivalents-2-0-git-integration-prof-57a4cb-krkinetics-projects.vercel.app';

/** @deprecated Use PRODUCTION_CLIENT_ORIGIN. Kept for existing intake/motivation imports. */
export const PRODUCTION_INTAKE_ORIGIN = PRODUCTION_CLIENT_ORIGIN;
/** @deprecated Use LOCAL_CLIENT_ORIGIN. */
export const LOCAL_INTAKE_ORIGIN = LOCAL_CLIENT_ORIGIN;

/**
 * Immutable Vercel hosts look like project-hash-team.vercel.app
 * and never contain the "-git-" branch-alias marker.
 * @param {unknown} hostname
 */
export function isImmutableVercelDeploymentHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host.endsWith('.vercel.app')) return false;
  if (host.includes('-git-')) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)+-[a-z0-9]+\.vercel\.app$/.test(host);
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function allowlistedOrigin(raw) {
  if (raw == null || raw === '') return null;
  try {
    const value = String(raw).trim();
    const candidate = value.includes('://') ? value : `https://${value.replace(/^\/+/, '')}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      return null;
    }
    const allowed = allowedCorsOrigin(parsed.origin);
    return allowed ? allowed.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function safeConfiguredPreviewOrigin(raw) {
  const allowed = allowlistedOrigin(raw);
  if (!allowed) return null;
  let host = '';
  try {
    host = new URL(allowed).hostname;
  } catch {
    return null;
  }
  if (host === 'app.krkinetics.com') return null;
  if (isImmutableVercelDeploymentHost(host)) return null;
  return allowed;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.environment]
 * @param {string} [opts.requestOrigin]
 * @param {string} [opts.vercelGitCommitRef]
 * @param {string} [opts.publicOrigin]
 * @returns {{ ok: true, origin: string } | { ok: false, reason: string }}
 */
export function resolveClientFacingOrigin({
  environment = process.env.VERCEL_ENV,
  requestOrigin = '',
  vercelGitCommitRef = process.env.VERCEL_GIT_COMMIT_REF,
  publicOrigin = process.env.COACH_PUBLIC_ORIGIN,
} = {}) {
  const env = String(environment || '').toLowerCase();

  if (env === 'production') {
    return { ok: true, origin: PRODUCTION_CLIENT_ORIGIN };
  }

  if (env === 'preview') {
    const ref = String(vercelGitCommitRef || '').trim();
    if (ref === INTEGRATION_PROFIL_MOTIVATIONNEL_REF) {
      return { ok: true, origin: INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN };
    }
    const configured = safeConfiguredPreviewOrigin(publicOrigin);
    if (configured) return { ok: true, origin: configured };
    return { ok: false, reason: 'preview_origin_unresolved' };
  }

  const fromRequest = allowlistedOrigin(requestOrigin);
  if (fromRequest) return { ok: true, origin: fromRequest };
  return { ok: true, origin: LOCAL_CLIENT_ORIGIN };
}
