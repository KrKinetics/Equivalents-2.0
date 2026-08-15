/**
 * Canonical client-email classification for intake invites.
 * Matches the intake SQL shape: lower(trim) + simple addr-spec.
 * Never treats a request-body email as authoritative.
 */

export const CLIENT_EMAIL_MAX_LENGTH = 160;
export const CLIENT_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * @param {unknown} value
 * @returns {
 *   | { ok: true, email: string }
 *   | { ok: false, reason: 'missing' | 'invalid' }
 * }
 */
export function classifyClientEmail(value) {
  if (value == null) return { ok: false, reason: 'missing' };
  const email = String(value).trim().toLowerCase();
  if (!email) return { ok: false, reason: 'missing' };
  if (email.length > CLIENT_EMAIL_MAX_LENGTH || !CLIENT_EMAIL_RE.test(email)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, email };
}

/**
 * Display-only helper for coach dashboard labels. Server remains authoritative.
 * @param {unknown} value
 */
export function looksLikeClientEmail(value) {
  return classifyClientEmail(value).ok;
}
