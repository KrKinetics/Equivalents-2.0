import crypto from 'crypto';

/**
 * Stable JSON stringify with sorted object keys.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Hash foods only (normalized) — excludes volatile meta timestamps.
 */
export function computeFoodsDataHash(foods) {
  const normalized = (foods || []).map((f) => {
    const copy = { ...f };
    // Keep verification/status content; strip only runtime noise if present
    return copy;
  });
  normalized.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const payload = stableStringify(normalized);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function shortHash(hash, len = 12) {
  return String(hash || '').slice(0, len);
}
