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

/**
 * Authoritative source reference IDs only — never legacySource or source.name.
 */
export function knownSourceReferenceIds(food) {
  const s = food?.source || {};
  const ids = [];
  if (isMeaningfulString(s.recordId)) ids.push(String(s.recordId).trim());
  if (isMeaningfulString(s.evidenceRef)) ids.push(String(s.evidenceRef).trim());
  if (isValidHttpUrl(s.url)) ids.push(String(s.url).trim());
  if (isValidDoi(s.doi)) ids.push(String(s.doi).trim());
  return [...new Set(ids.filter(Boolean))];
}

/**
 * ISO-8601 datetime with timezone (e.g. 2026-07-29T12:00:00.000Z).
 * Calendar-strict: does not trust Date.parse normalization of impossible dates.
 */
export function isValidIsoDateTime(value) {
  if (!isNonEmptyString(value)) return false;
  const raw = value.trim();
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
  );
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] || '';
  const tz = match[8];

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  if (tz !== 'Z') {
    const tzMatch = tz.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!tzMatch) return false;
    const tzHour = Number(tzMatch[2]);
    const tzMinute = Number(tzMatch[3]);
    if (tzHour > 23 || tzMinute > 59) return false;
  }

  // Reconstruct UTC components from the nominal local wall time + offset.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  if (fraction) {
    const msPart = Number(`0${fraction}`);
    if (!Number.isFinite(msPart)) return false;
    utcMs += Math.round(msPart * 1000);
  }
  if (tz !== 'Z') {
    const sign = tz[0] === '-' ? 1 : -1;
    const tzHour = Number(tz.slice(1, 3));
    const tzMinute = Number(tz.slice(4, 6));
    utcMs += sign * (tzHour * 60 + tzMinute) * 60 * 1000;
  }

  const dt = new Date(utcMs);
  if (!Number.isFinite(dt.getTime())) return false;

  // Verify the calendar date of the wall-clock components (before tz shift).
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    wall.getUTCFullYear() !== year ||
    wall.getUTCMonth() !== month - 1 ||
    wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour ||
    wall.getUTCMinutes() !== minute ||
    wall.getUTCSeconds() !== second
  ) {
    return false;
  }

  return true;
}

/** approvedAt: YYYY-MM-DD or full ISO datetime with timezone. */
export function isValidApprovedAt(value) {
  if (!isNonEmptyString(value)) return false;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isValidIsoDateOnly(raw);
  return isValidIsoDateTime(raw);
}
