/**
 * Strict source field validators (pure, Node + browser safe).
 */

import { NUTRIENTS_BASIS } from './nutrition-constants.mjs';

const GENERIC_TOKENS = new Set([
  'x',
  '-',
  '--',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'test',
  'todo',
  'tbd',
  '?',
  '.',
]);

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isMeaningfulString(value, { minLength = 2 } = {}) {
  if (!isNonEmptyString(value)) return false;
  const trimmed = value.trim();
  if (trimmed.length < minLength) return false;
  if (GENERIC_TOKENS.has(trimmed.toLowerCase())) return false;
  return true;
}

/** YYYY-MM-DD only, calendar-valid, not in the future (UTC date). */
export function isValidIsoDateOnly(value) {
  if (!isNonEmptyString(value)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const [y, m, d] = value.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return false;
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return dt.getTime() <= todayUtc;
}

export function isValidHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** DOI string (10.xxxx/...) or https://doi.org/... */
export function isValidDoi(value) {
  if (!isNonEmptyString(value)) return false;
  const v = value.trim();
  if (/^https?:\/\/(dx\.)?doi\.org\/10\.\d{4,9}\/\S+$/i.test(v)) return true;
  return /^10\.\d{4,9}\/\S+$/i.test(v);
}

export function isValidNutrientsBasis(value) {
  return NUTRIENTS_BASIS.includes(value);
}

export function looksLikeServingDescription(value) {
  if (!isMeaningfulString(value, { minLength: 3 })) return false;
  // Prefer descriptions that mention amount/unit/grams or a concrete serving phrase.
  return /(\d|[½⅓¼¾]|ml|g\b|oz|cup|tbsp|tsp|scoop|portion|serving|portion|étiquette|label|gram)/i.test(
    value
  );
}

export function looksLikeEvidenceRef(value) {
  if (!isMeaningfulString(value, { minLength: 3 })) return false;
  if (isValidHttpUrl(value)) return true;
  // path-like or opaque evidence id
  return /[\\/.]|evidence|photo|label|scan|pdf|img|proof|ref/i.test(value) || value.trim().length >= 6;
}

export function knownSourceReferenceIds(food) {
  const s = food?.source || {};
  const ids = [];
  if (isMeaningfulString(s.recordId)) ids.push(String(s.recordId).trim());
  if (isMeaningfulString(s.evidenceRef)) ids.push(String(s.evidenceRef).trim());
  if (isValidHttpUrl(s.url)) ids.push(String(s.url).trim());
  if (isValidDoi(s.doi)) ids.push(String(s.doi).trim());
  if (isMeaningfulString(s.name)) ids.push(String(s.name).trim());
  const legacy = food?.legacySource;
  if (legacy?.referenceId) ids.push(String(legacy.referenceId).trim());
  if (legacy?.reference) ids.push(String(legacy.reference).trim());
  return [...new Set(ids.filter(Boolean))];
}
