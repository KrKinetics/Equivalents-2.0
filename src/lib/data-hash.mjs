import crypto from 'crypto';
import { stableStringify } from './data-hash-lite.mjs';

export { stableStringify };

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
