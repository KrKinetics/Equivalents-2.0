/**
 * Allowlisted origin for /intake.html?token=… links.
 * Never trusts body.origin, Host, or X-Forwarded-Host.
 */

import { allowedCorsOrigin } from '../../security/portal-auth.mjs';

export const PRODUCTION_INTAKE_ORIGIN = 'https://app.krkinetics.com';
export const LOCAL_INTAKE_ORIGIN = 'http://127.0.0.1:4190';

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

/**
 * @param {object} [opts]
 * @param {string} [opts.originHeader]
 * @param {string} [opts.vercelEnv]
 * @param {string} [opts.vercelUrl]
 * @param {string} [opts.publicOrigin]
 * @returns {{ ok: true, origin: string } | { ok: false, reason: string }}
 */
export function resolveIntakeOrigin({
  originHeader = '',
  vercelEnv = process.env.VERCEL_ENV,
  vercelUrl = process.env.VERCEL_URL,
  publicOrigin = process.env.COACH_PUBLIC_ORIGIN,
} = {}) {
  const env = String(vercelEnv || '').toLowerCase();

  if (env === 'production') {
    return { ok: true, origin: PRODUCTION_INTAKE_ORIGIN };
  }

  if (env === 'preview') {
    const fromVercel = allowlistedOrigin(vercelUrl);
    if (fromVercel) return { ok: true, origin: fromVercel };
    const fromRequest = allowlistedOrigin(originHeader);
    if (fromRequest && fromRequest !== PRODUCTION_INTAKE_ORIGIN) {
      return { ok: true, origin: fromRequest };
    }
    return { ok: false, reason: 'preview_origin_unresolved' };
  }

  const fromRequest = allowlistedOrigin(originHeader);
  if (fromRequest) return { ok: true, origin: fromRequest };
  return { ok: true, origin: LOCAL_INTAKE_ORIGIN };
}

/**
 * @param {string} origin
 * @param {string} token
 */
export function buildIntakeInviteUrl(origin, token) {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/intake.html?token=${encodeURIComponent(String(token || ''))}`;
}
