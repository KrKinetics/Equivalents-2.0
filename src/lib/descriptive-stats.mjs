import { median } from './group-statistics.mjs';

const finite = (values) => (values || []).filter((value) => typeof value === 'number' && Number.isFinite(value));

export function percentile(values, p) {
  const sorted = finite(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const requested = Number(p);
  const clamped = Math.max(0, Math.min(1, requested > 1 ? requested / 100 : requested));
  const index = (sorted.length - 1) * clamped;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * fraction;
}

export function mad(values) {
  const numbers = finite(values);
  if (!numbers.length) return null;
  const center = median(numbers);
  return median(numbers.map((value) => Math.abs(value - center)));
}

export function roundHalfAwayFromZero(n, decimals = 0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  const rounded = Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * factor);
  return rounded / factor;
}

export function normalizeFrName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .toLocaleLowerCase('fr-CA')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Deterministic display formatting. Never coerces null to 0.
 * Caps binary float noise (e.g. 30.699999999999996 → 30.7).
 */
export function formatStatNumber(value, maxDecimals = 4) {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) return null;
  // toFixed avoids binary float tails (30.6999… / 18.7999…) before numeric coercion.
  const rounded = Number(value.toFixed(maxDecimals));
  if (Object.is(rounded, -0)) return 0;
  return rounded;
}

/** Stable textual form for markdown / UI (never emits 30.699999999999996). */
export function formatStatNumberText(value, maxDecimals = 4) {
  const cleaned = formatStatNumber(value, maxDecimals);
  if (cleaned == null) return null;
  return cleaned.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

/** Recursively replace finite numbers with formatStatNumber for stable JSON/CSV/HTML exports. */
export function sanitizeExportNumbers(value, maxDecimals = 4) {
  if (value == null) return value;
  if (typeof value === 'number') return formatStatNumber(value, maxDecimals);
  if (Array.isArray(value)) return value.map((item) => sanitizeExportNumbers(item, maxDecimals));
  if (typeof value === 'object') {
    if (value instanceof RegExp) return value.source;
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = sanitizeExportNumbers(nested, maxDecimals);
    }
    return out;
  }
  return value;
}

export function formatNumberForLocale(value, lang = 'fr', maxDecimals = 4) {
  const text = formatStatNumberText(value, maxDecimals);
  if (text == null) return '—';
  return lang === 'fr' ? text.replace('.', ',') : text;
}
