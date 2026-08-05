/**
 * Server food equivalences — category guide rows without full-bank dump.
 */

import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from '../search/search-foods.mjs';

/**
 * Project a guide food row to a minimal equivalence card.
 * @param {object} food
 */
export function toEquivalenceRow(food) {
  const v = food?.values || {};
  return {
    id: food.id,
    nameFr: food.nameFr || '',
    nameEn: food.nameEn || '',
    portionFr: food.portionFr || '',
    portionEn: food.portionEn || '',
    values: {
      prot: v.prot ?? null,
      gluc: v.gluc ?? null,
      lip: v.lip ?? null,
      fib: v.fib ?? null,
      cal: v.cal ?? null,
    },
  };
}

/**
 * @param {object} coachData
 * @param {{ category?: string, limit?: number, offset?: number }} query
 */
export function listEquivalences(coachData, {
  category = '',
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
} = {}) {
  const sections = Array.isArray(coachData?.guide?.sections) ? coachData.guide.sections : [];
  const cat = String(category || '').trim();

  const categories = sections.map((s) => ({
    id: s.id,
    labelFr: s.titleFr || s.id,
    labelEn: s.titleEn || s.titleFr || s.id,
    count: Array.isArray(s.foods) ? s.foods.length : 0,
  }));

  let rows = [];
  if (cat) {
    const section = sections.find((s) => s.id === cat);
    rows = Array.isArray(section?.foods) ? section.foods : [];
  } else {
    // Without a category, return empty foods — never dump the full guide.
    rows = [];
  }

  const safeLimit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Number(limit) || DEFAULT_SEARCH_LIMIT));
  const safeOffset = Math.max(0, Math.min(10_000, Number(offset) || 0));
  const page = rows.slice(safeOffset, safeOffset + safeLimit).map(toEquivalenceRow);

  return {
    category: cat || null,
    results: page,
    total: rows.length,
    limit: safeLimit,
    offset: safeOffset,
    categories,
  };
}
