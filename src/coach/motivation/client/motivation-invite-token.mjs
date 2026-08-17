/**
 * Official public reader for /motivation.html?token=…
 * Reads only the query param. No hash, path, cookie, or storage fallbacks.
 */

export const MOTIVATION_INVITE_TOKEN_PARAM = 'token';

/**
 * @param {string | URL | { search?: string, href?: string } | null | undefined} locationLike
 * @returns {string}
 */
export function readMotivationInviteToken(locationLike) {
  if (locationLike == null) return '';
  try {
    if (typeof locationLike === 'string') {
      if (locationLike.includes('://')) {
        return new URL(locationLike).searchParams.get(MOTIVATION_INVITE_TOKEN_PARAM) || '';
      }
      return new URLSearchParams(locationLike.startsWith('?') ? locationLike.slice(1) : locationLike)
        .get(MOTIVATION_INVITE_TOKEN_PARAM) || '';
    }
    if (locationLike instanceof URL) {
      return locationLike.searchParams.get(MOTIVATION_INVITE_TOKEN_PARAM) || '';
    }
    if (typeof locationLike.search === 'string') {
      return new URLSearchParams(locationLike.search).get(MOTIVATION_INVITE_TOKEN_PARAM) || '';
    }
    if (typeof locationLike.href === 'string') {
      return new URL(locationLike.href).searchParams.get(MOTIVATION_INVITE_TOKEN_PARAM) || '';
    }
  } catch {
    return '';
  }
  return '';
}
