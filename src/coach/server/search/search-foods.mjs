/**
 * Server food search — parity with client filtrerGuideEquivalents semantics.
 *
 * Matching: case-insensitive substring on nameFr, nameEn, portionFr.
 * No accent folding (matches current client / golden fixtures).
 * Results are always sorted by id for stable ordering.
 */

export const DEFAULT_SEARCH_LIMIT = 25;
export const MAX_SEARCH_LIMIT = 50;
export const MAX_QUERY_LENGTH = 80;

/**
 * Pure filter used by golden parity tests (no pagination).
 * @param {object[]} foods
 * @param {string} q
 * @param {string} [category]
 * @returns {object[]}
 */
export function filterFoods(foods, q, category = '') {
  const query = String(q || '').trim().toLowerCase();
  const cat = String(category || '').trim();
  return (Array.isArray(foods) ? foods : [])
    .filter((f) => {
      if (cat && f.displayCategory !== cat) return false;
      if (!query) return true;
      return (f.nameFr || '').toLowerCase().includes(query)
        || (f.nameEn || '').toLowerCase().includes(query)
        || (f.portionFr || '').toLowerCase().includes(query);
    })
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * Project a food row to the minimal search-result shape (no audit/evidence).
 * @param {object} food
 */
export function toSearchResult(food) {
  const n = food?.nutrients || {};
  return {
    id: food.id,
    nameFr: food.nameFr || '',
    nameEn: food.nameEn || '',
    portionFr: food.portionFr || '',
    portionEn: food.portionEn || '',
    displayCategory: food.displayCategory || '',
    nutrients: {
      proteinG: n.proteinG ?? null,
      carbsG: n.carbsG ?? null,
      fatG: n.fatG ?? null,
      fiberG: n.fiberG ?? null,
      declaredKcal: n.declaredKcal ?? null,
    },
  };
}

/**
 * @param {object} coachData
 * @param {{ q?: string, category?: string, limit?: number, offset?: number }} query
 */
export function searchFoods(coachData, {
  q = '',
  category = '',
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
} = {}) {
  const foods = Array.isArray(coachData?.foods) ? coachData.foods : [];
  const filtered = filterFoods(foods, q, category);
  const safeLimit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Number(limit) || DEFAULT_SEARCH_LIMIT));
  const safeOffset = Math.max(0, Math.min(10_000, Number(offset) || 0));
  const page = filtered.slice(safeOffset, safeOffset + safeLimit).map(toSearchResult);

  const categories = (coachData?.guide?.sections || []).map((s) => ({
    id: s.id,
    labelFr: s.titleFr || s.id,
    labelEn: s.titleEn || s.titleFr || s.id,
  }));

  return {
    results: page,
    total: filtered.length,
    limit: safeLimit,
    offset: safeOffset,
    categories,
  };
}
