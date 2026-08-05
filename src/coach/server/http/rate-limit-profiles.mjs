/**
 * Per-endpoint rate limit profiles (requests / window).
 * Applied in-memory always; optionally mirrored to Supabase when migration is applied.
 */

/** @typedef {{ max: number, windowMs: number }} RateProfile */

/** @type {Readonly<Record<string, RateProfile>>} */
export const RATE_LIMIT_PROFILES = Object.freeze({
  default: Object.freeze({ max: 60, windowMs: 60_000 }),
  'food-search': Object.freeze({ max: 40, windowMs: 60_000 }),
  'food-detail': Object.freeze({ max: 60, windowMs: 60_000 }),
  'calc-energy': Object.freeze({ max: 30, windowMs: 60_000 }),
  'calc-macros': Object.freeze({ max: 30, windowMs: 60_000 }),
  'calc-portions': Object.freeze({ max: 20, windowMs: 60_000 }),
  'calc-equivalences': Object.freeze({ max: 30, windowMs: 60_000 }),
  'generate-pdf': Object.freeze({ max: 8, windowMs: 60_000 }),
  session: Object.freeze({ max: 20, windowMs: 60_000 }),
  'auth-login': Object.freeze({ max: 10, windowMs: 60_000 }),
  'auth-magic-link': Object.freeze({ max: 5, windowMs: 15 * 60_000 }),
  'cross-org-denied': Object.freeze({ max: 10, windowMs: 60_000 }),
});

/**
 * @param {string} routeName
 * @returns {RateProfile}
 */
export function getRateLimitProfile(routeName) {
  return RATE_LIMIT_PROFILES[routeName] || RATE_LIMIT_PROFILES.default;
}
