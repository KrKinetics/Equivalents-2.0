/**
 * Map portal organization slugs to calculator PDF brand ids.
 * Pure config — no DOM, auth, or nutrition side effects.
 */

/** @typedef {'kr' | 'elevate'} BrandId */

/** @type {Readonly<Record<string, BrandId>>} */
export const ORG_SLUG_TO_BRAND_ID = Object.freeze({
  'kr-kinetics': 'kr',
  'elevate-fitness': 'elevate',
});

/**
 * @param {unknown} slug
 * @returns {BrandId | null}
 */
export function brandIdFromOrganizationSlug(slug) {
  if (typeof slug !== 'string' || !slug) return null;
  return ORG_SLUG_TO_BRAND_ID[slug] || null;
}

/**
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isKnownOrganizationSlug(slug) {
  return brandIdFromOrganizationSlug(slug) != null;
}
