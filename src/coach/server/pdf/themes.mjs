/**
 * Canonical PDF brand themes for KR Kinetics and Elevate Fitness.
 * Visual language mirrors the historical dual-brand client PDFs (structure/palette),
 * not dossier numeric values.
 */

import { brandIdFromOrganizationSlug } from '../../workspace/org-brand.mjs';
import { BRANDS } from '../../branding/brands.mjs';

/** @typedef {'kr'|'elevate'} BrandId */

/**
 * @typedef {Readonly<{
 *   id: BrandId,
 *   displayName: string,
 *   filenameSlug: string,
 *   logoAlt: string,
 *   banner: string,
 *   bannerGradient: string,
 *   primary: string,
 *   secondary: string,
 *   accent: string,
 *   accentSoft: string,
 *   footerBg: string,
 *   footerText: string,
 *   subtitleTone: string,
 *   sectionText: string,
 *   reconTitleBg: string,
 *   totalsBg: string,
 *   valAccent: string,
 *   piePro: string,
 *   pieGlu: string,
 *   pieLip: string,
 *   logoFilter: string,
 *   logoObjectFit: string,
 *   logoMaxWidth: string,
 *   logoMaxHeight: string,
 *   notesBorder: string,
 *   notesBg: string,
 * }>} PdfTheme
 */

/** @type {Readonly<Record<BrandId, PdfTheme>>} */
export const PDF_THEMES = Object.freeze({
  kr: Object.freeze({
    id: 'kr',
    displayName: BRANDS.kr.displayName,
    filenameSlug: BRANDS.kr.slug,
    logoAlt: BRANDS.kr.logoAlt,
    banner: '#071B41',
    bannerGradient: 'linear-gradient(135deg,#071B41 0%,#0B285B 68%,#071B41 100%)',
    primary: '#071B41',
    secondary: '#0B285B',
    accent: '#ED1136',
    accentSoft: '#3b82f6',
    footerBg: '#071B41',
    footerText: '#cbd8eb',
    subtitleTone: '#cbd8eb',
    sectionText: '#1e293b',
    reconTitleBg: '#071B41',
    totalsBg: '#071B41',
    valAccent: '#3b82f6',
    piePro: '#6366f1',
    pieGlu: '#b91c1c',
    pieLip: '#fde68a',
    // Keep KR red mark visible — never invert to a white silhouette.
    // screen blend removes the asset's black plate so the navy banner shows through.
    logoFilter: 'none',
    logoBlend: 'screen',
    logoObjectFit: 'contain',
    logoMaxWidth: '210px',
    logoMaxHeight: '52px',
    notesBorder: '#fca5a5',
    notesBg: '#fff5f5',
  }),
  elevate: Object.freeze({
    id: 'elevate',
    displayName: BRANDS.elevate.displayName,
    filenameSlug: BRANDS.elevate.slug,
    logoAlt: BRANDS.elevate.logoAlt,
    banner: '#050505',
    bannerGradient: 'linear-gradient(135deg,#050505 0%,#111111 70%,#050505 100%)',
    primary: '#050505',
    secondary: '#111111',
    accent: '#D4A94F',
    accentSoft: '#E8D39B',
    footerBg: '#050505',
    footerText: '#E8D39B',
    subtitleTone: '#E8D39B',
    sectionText: '#171717',
    reconTitleBg: '#111111',
    totalsBg: '#111111',
    valAccent: '#9A6A13',
    piePro: '#D4A94F',
    pieGlu: '#8B6914',
    pieLip: '#E8D39B',
    // Full-color mountain + gold lettering — never invert / never screen-blend.
    logoFilter: 'none',
    logoBlend: 'normal',
    logoObjectFit: 'cover',
    logoMaxWidth: '150px',
    logoMaxHeight: '54px',
    notesBorder: '#D4A94F',
    notesBg: '#fffbeb',
  }),
});

/**
 * Brands a authenticated member of a known portal org may request for PDF export.
 * Joint-project rule: both PDF brands are selectable; org still gates data access.
 * @param {string|null|undefined} organizationSlug
 * @returns {BrandId[]}
 */
export function allowedPdfBrandsForOrganization(organizationSlug) {
  const orgBrand = brandIdFromOrganizationSlug(organizationSlug);
  if (!orgBrand) return [];
  return ['kr', 'elevate'];
}

/**
 * @param {unknown} value
 * @returns {BrandId|null}
 */
export function normalizeBrandToken(value) {
  if (value == null || value === '') return null;
  const s = String(value).toLowerCase().trim();
  if (s === 'kr' || s === 'kr-kinetics' || s === 'kr_kinetics') return 'kr';
  if (s === 'elevate' || s === 'elevate-fitness' || s === 'elevate_fitness') return 'elevate';
  return null;
}

/**
 * Resolve the PDF brand from the explicit UI selection + auth context.
 * Never silently overwrite a valid selection with the organization brand.
 *
 * @param {{
 *   selectedBrand?: unknown,
 *   organizationSlug?: string|null,
 * }} input
 * @returns {{
 *   ok: true, brandId: BrandId, theme: PdfTheme, orgBrandId: BrandId
 * } | {
 *   ok: false, status: number, error: string
 * }}
 */
export function resolvePdfBrand({ selectedBrand, organizationSlug } = {}) {
  const orgBrandId = brandIdFromOrganizationSlug(organizationSlug);
  if (!orgBrandId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const allowed = allowedPdfBrandsForOrganization(organizationSlug);
  let brandId;
  if (selectedBrand == null || selectedBrand === '') {
    brandId = orgBrandId;
  } else {
    brandId = normalizeBrandToken(selectedBrand);
    if (!brandId) {
      return { ok: false, status: 400, error: 'bad_request' };
    }
  }

  if (!allowed.includes(brandId)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  return {
    ok: true,
    brandId,
    theme: PDF_THEMES[brandId],
    orgBrandId,
  };
}

/**
 * @param {BrandId} brandId
 * @returns {PdfTheme}
 */
export function getPdfTheme(brandId) {
  return PDF_THEMES[brandId] || PDF_THEMES.kr;
}
