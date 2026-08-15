/**
 * Server-only mail mode for intake invitations.
 * Defaults to disabled (fail closed) so Preview cannot email real clients.
 *
 * COACH_MAIL_MODE: disabled | test | production
 * production is honored only when VERCEL_ENV=production.
 * COACH_MAIL_TEST_RECIPIENTS: comma/space separated allowlist (test mode only)
 */

export const MAIL_MODES = Object.freeze(['disabled', 'test', 'production']);

/**
 * @param {NodeJS.ProcessEnv | Record<string, string|undefined>} [env]
 * @returns {'disabled'|'test'|'production'}
 */
export function resolveCoachMailMode(env = process.env) {
  const raw = String(env.COACH_MAIL_MODE || '').trim().toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV || '').toLowerCase();
  if (raw === 'production') {
    return vercelEnv === 'production' ? 'production' : 'disabled';
  }
  if (raw === 'test' || raw === 'disabled') return raw;
  return 'disabled';
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseTestRecipients(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string} email
 * @param {{ mode?: string, testRecipients?: string[] }} [opts]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function maySendToRecipient(email, {
  mode = 'disabled',
  testRecipients = [],
} = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { ok: false, reason: 'missing_recipient' };
  if (mode === 'production') return { ok: true };
  if (mode === 'test') {
    if (testRecipients.includes(normalized)) return { ok: true };
    return { ok: false, reason: 'test_mode_recipient_blocked' };
  }
  return { ok: false, reason: 'mail_mode_disabled' };
}
