/**
 * Allowlisted origin for /intake.html?token=… links.
 * Delegates to the shared client-facing origin resolver.
 * Never trusts body.origin, Host, X-Forwarded-Host, or an immutable Vercel deploy.
 */

import {
  LOCAL_CLIENT_ORIGIN,
  PRODUCTION_CLIENT_ORIGIN,
  allowlistedOrigin,
  resolveClientFacingOrigin,
} from '../http/client-facing-origin.mjs';

export const PRODUCTION_INTAKE_ORIGIN = PRODUCTION_CLIENT_ORIGIN;
export const LOCAL_INTAKE_ORIGIN = LOCAL_CLIENT_ORIGIN;
export { allowlistedOrigin };

/**
 * @param {object} [opts]
 * @param {string} [opts.originHeader]
 * @param {string} [opts.vercelEnv]
 * @param {string} [opts.vercelUrl]
 * @param {string} [opts.publicOrigin]
 * @param {string} [opts.vercelGitCommitRef]
 * @returns {{ ok: true, origin: string } | { ok: false, reason: string }}
 */
export function resolveIntakeOrigin({
  originHeader = '',
  vercelEnv = process.env.VERCEL_ENV,
  vercelUrl = process.env.VERCEL_URL,
  publicOrigin = process.env.COACH_PUBLIC_ORIGIN,
  vercelGitCommitRef = process.env.VERCEL_GIT_COMMIT_REF,
} = {}) {
  void vercelUrl;
  return resolveClientFacingOrigin({
    environment: vercelEnv,
    requestOrigin: originHeader,
    vercelGitCommitRef,
    publicOrigin,
  });
}

/**
 * @param {string} origin
 * @param {string} token
 */
export function buildIntakeInviteUrl(origin, token) {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/intake.html?token=${encodeURIComponent(String(token || ''))}`;
}
