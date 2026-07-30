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

export function formatNumberForLocale(value, lang = 'fr') {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const text = String(value);
  return lang === 'fr' ? text.replace('.', ',') : text;
}
