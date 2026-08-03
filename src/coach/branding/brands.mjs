/**
 * Centralized Coach brand metadata for KR Kinetics and Elevate Fitness.
 * Pure configuration — no UI, nutrition, storage, or PDF rendering side effects.
 */

/** @typedef {'kr' | 'elevate'} BrandId */

/**
 * @typedef {object} BrandConfig
 * @property {BrandId} id
 * @property {string} displayName
 * @property {string} slug
 * @property {string} logoAlt
 * @property {string} guidePath
 * @property {string} headerLogoPath
 * @property {string} pdfLogoRuntimeExpr Browser expression resolved at PDF export time.
 */

export const DEFAULT_BRAND_ID = /** @type {BrandId} */ ('kr');

/** @type {Readonly<{ kr: Readonly<BrandConfig>, elevate: Readonly<BrandConfig> }>} */
export const BRANDS = Object.freeze({
  kr: Object.freeze({
    id: 'kr',
    displayName: 'KR Kinetics',
    slug: 'KR_Kinetics',
    logoAlt: 'KR Kinetics',
    guidePath: './guides/kr-kinetics-equivalents-client-fr.pdf',
    headerLogoPath: './assets/logo-kr-kinetics-horizontal.png',
    pdfLogoRuntimeExpr: 'window.KR_PDF_LOGO_HORIZONTAL_DATA_URI',
  }),
  elevate: Object.freeze({
    id: 'elevate',
    displayName: 'Elevate Fitness',
    slug: 'Elevate_Fitness',
    logoAlt: 'Elevate Fitness',
    guidePath: './guides/elevate-fitness-equivalents-client-fr.pdf',
    headerLogoPath: './assets/logo-elevate-fitness.jpg',
    pdfLogoRuntimeExpr: 'window.ELEVATE_PDF_LOGO_DATA_URI',
  }),
});

/**
 * Resolve a creator token to a known brand id.
 * Unknown values fall back to KR (current runtime behavior).
 * @param {unknown} creator
 * @returns {BrandId}
 */
export function resolveBrandId(creator) {
  return creator === 'elevate' ? 'elevate' : 'kr';
}

/**
 * @param {unknown} creator
 * @returns {Readonly<BrandConfig>}
 */
export function getBrand(creator) {
  return BRANDS[resolveBrandId(creator)];
}

/**
 * Exact browser Object.freeze literal currently injected as PDF_BRANDS.
 * Formatting is intentionally preserved to keep rebuild output stable.
 * @returns {string}
 */
export function buildPdfBrandsRuntimeObjectLiteral() {
  const kr = BRANDS.kr;
  const elevate = BRANDS.elevate;
  return `Object.freeze({
    kr: Object.freeze({
        key: '${kr.id}', label: '${kr.displayName}', slug: '${kr.slug}',
        logo: ${kr.pdfLogoRuntimeExpr},
        logoAlt: '${kr.logoAlt}', guide: '${kr.guidePath}'
    }),
    elevate: Object.freeze({
        key: '${elevate.id}', label: '${elevate.displayName}', slug: '${elevate.slug}',
        logo: ${elevate.pdfLogoRuntimeExpr},
        logoAlt: '${elevate.logoAlt}', guide: '${elevate.guidePath}'
    })
})`;
}
