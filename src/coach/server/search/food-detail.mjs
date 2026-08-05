/**
 * Server food detail — single food, display fields only.
 */

import { toSearchResult } from './search-foods.mjs';

/**
 * @param {object} coachData
 * @param {string} foodId
 * @returns {{ ok: true, food: object } | { ok: false, error: 'not_found' }}
 */
export function getFoodDetail(coachData, foodId) {
  const id = String(foodId || '').trim();
  if (!id) return { ok: false, error: 'not_found' };
  const foods = Array.isArray(coachData?.foods) ? coachData.foods : [];
  const found = foods.find((f) => f.id === id);
  if (!found) return { ok: false, error: 'not_found' };
  return { ok: true, food: toSearchResult(found) };
}
