/**
 * Same canonical fingerprint as Master Coach nutritionPlanFingerprint.
 * Prefix kr-nutrition-plan-v1, key-sorted JSON, SHA-256 hex.
 */
import { createHash } from 'node:crypto';

export function stableNutritionJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableNutritionJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableNutritionJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function nutritionPlanFingerprint(plan) {
  return createHash('sha256')
    .update(`kr-nutrition-plan-v1\n${stableNutritionJson(plan)}`)
    .digest('hex');
}
