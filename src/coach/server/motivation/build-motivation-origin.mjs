/**
 * Allowlisted origin for /motivation.html?token=… links.
 * Reuses the intake origin allowlist. Never trusts body.origin.
 */

import {
  resolveIntakeOrigin,
  PRODUCTION_INTAKE_ORIGIN,
  LOCAL_INTAKE_ORIGIN,
} from '../intake/build-intake-origin.mjs';

export { resolveIntakeOrigin, PRODUCTION_INTAKE_ORIGIN, LOCAL_INTAKE_ORIGIN };

/**
 * @param {string} origin
 * @param {string} token
 */
export function buildMotivationInviteUrl(origin, token) {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/motivation.html?token=${encodeURIComponent(String(token || ''))}`;
}
