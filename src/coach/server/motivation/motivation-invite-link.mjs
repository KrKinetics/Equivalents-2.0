/**
 * Canonical public motivation invite URL contract.
 * Single constructor. Server and tests must use these helpers.
 * Never log the raw token.
 */

import { createHash } from 'node:crypto';

export const MOTIVATION_INVITE_PATH = '/motivation.html';
export const MOTIVATION_INVITE_TOKEN_PARAM = 'token';
export const VERCEL_PROTECTION_BYPASS_PARAM = 'x-vercel-protection-bypass';
export const VERCEL_PROTECTION_BYPASS_COOKIE_PARAM = 'x-vercel-set-bypass-cookie';

/**
 * @param {unknown} token
 * @returns {string}
 */
export function fingerprintMotivationInviteToken(token) {
  const raw = String(token || '');
  if (!raw) return '';
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 12);
}

/**
 * @param {unknown} origin
 * @returns {boolean}
 */
export function isVercelPreviewOrigin(origin) {
  try {
    const host = new URL(String(origin || '')).hostname;
    return host.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

/**
 * Preview Deployment Protection bypass, never used on production origin.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {string} [origin]
 */
export function resolvePreviewProtectionBypass(env = {}, origin = '') {
  const vercelEnv = String(env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production') return '';
  if (!isVercelPreviewOrigin(origin)) return '';
  const secret = String(
    env.COACH_PREVIEW_PROTECTION_BYPASS
    || env.VERCEL_AUTOMATION_BYPASS_SECRET
    || '',
  ).trim();
  return secret;
}

/**
 * @param {string} origin
 * @param {string} token
 * @param {{ protectionBypass?: string }} [options]
 */
export function buildMotivationInviteUrl(origin, token, options = {}) {
  const base = String(origin || '').replace(/\/$/, '');
  const rawToken = String(token || '');
  let href = `${base}${MOTIVATION_INVITE_PATH}?${MOTIVATION_INVITE_TOKEN_PARAM}=${encodeURIComponent(rawToken)}`;
  const bypass = String(options.protectionBypass || '').trim();
  if (bypass && isVercelPreviewOrigin(base)) {
    href += `&${VERCEL_PROTECTION_BYPASS_PARAM}=${encodeURIComponent(bypass)}`;
    href += `&${VERCEL_PROTECTION_BYPASS_COOKIE_PARAM}=true`;
  }
  return href;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   ok: boolean,
 *   href: string,
 *   origin: string,
 *   pathname: string,
 *   token: string,
 *   has_token: boolean,
 *   token_length: number,
 *   fingerprint: string,
 * }}
 */
export function parseMotivationInviteUrl(raw) {
  const href = String(raw || '');
  const empty = {
    ok: false,
    href,
    origin: '',
    pathname: '',
    token: '',
    has_token: false,
    token_length: 0,
    fingerprint: '',
  };
  try {
    const parsed = new URL(href);
    const token = parsed.searchParams.get(MOTIVATION_INVITE_TOKEN_PARAM) || '';
    return {
      ok: parsed.pathname === MOTIVATION_INVITE_PATH && Boolean(token),
      href: parsed.href,
      origin: parsed.origin,
      pathname: parsed.pathname,
      token,
      has_token: Boolean(token),
      token_length: token.length,
      fingerprint: fingerprintMotivationInviteToken(token),
    };
  } catch {
    return empty;
  }
}

/**
 * Refuse send unless the canonical invite URL still carries the raw token.
 * @param {unknown} inviteUrl
 * @param {unknown} expectedToken
 */
export function assertMotivationInviteUrl(inviteUrl, expectedToken) {
  const parsed = parseMotivationInviteUrl(inviteUrl);
  const expected = String(expectedToken || '');
  if (parsed.pathname !== MOTIVATION_INVITE_PATH) {
    return { ...parsed, ok: false, reason: 'invalid_path' };
  }
  if (!parsed.has_token) {
    return { ...parsed, ok: false, reason: 'missing_token' };
  }
  if (!expected || parsed.token !== expected) {
    return { ...parsed, ok: false, reason: 'token_mismatch' };
  }
  return { ...parsed, ok: true, reason: '' };
}

/**
 * Coach/Preview diagnostics. Never includes the raw token.
 * @param {ReturnType<typeof parseMotivationInviteUrl>} parsed
 */
export function motivationInviteDiagnostics(parsed) {
  return {
    invite_url_has_token: parsed.has_token === true,
    invite_url_path: parsed.pathname || '',
    invite_token_fingerprint: parsed.fingerprint || '',
  };
}
