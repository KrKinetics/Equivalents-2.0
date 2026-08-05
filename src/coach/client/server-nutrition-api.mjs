/**
 * Browser client for Coach server nutrition APIs.
 * Used only when COACH_FEATURES.serverNutritionEngine is enabled.
 *
 * Never falls back to /api/coach-data or local coach-data.json.
 */

const ROUTES = Object.freeze({
  search: '/api/coach-food-search',
  detail: '/api/coach-food-detail',
  energy: '/api/coach-calc-energy',
  macros: '/api/coach-calc-macros',
  portions: '/api/coach-calc-portions',
  equivalences: '/api/coach-calc-equivalences',
});

export const SERVER_NUTRITION_GENERIC_ERROR =
  'Le calcul serveur est temporairement indisponible. Réessayez.';

function orgFields() {
  const ctx = globalThis.COACH_WORKSPACE_CONTEXT
    || globalThis.__COACH_WORKSPACE_CONTEXT__
    || {};
  const out = {};
  if (ctx.organizationId) out.organization_id = ctx.organizationId;
  if (ctx.organizationSlug) out.organization_slug = ctx.organizationSlug;
  return out;
}

/**
 * @param {string} route
 * @param {object} body
 */
export async function coachNutritionPost(route, body = {}) {
  const res = await fetch(route, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ...orgFields(), ...body }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(SERVER_NUTRITION_GENERIC_ERROR);
    err.status = res.status;
    err.publicError = data?.error || 'unavailable';
    throw err;
  }
  return data;
}

export function searchFoodsApi(query) {
  return coachNutritionPost(ROUTES.search, query);
}

export function foodDetailApi(id) {
  return coachNutritionPost(ROUTES.detail, { id });
}

export function calcEnergyApi(input) {
  return coachNutritionPost(ROUTES.energy, input);
}

export function calcMacrosApi(input) {
  return coachNutritionPost(ROUTES.macros, input);
}

export function calcPortionsApi(input) {
  return coachNutritionPost(ROUTES.portions, input);
}

export function calcEquivalencesApi(input) {
  return coachNutritionPost(ROUTES.equivalences, input);
}

export { ROUTES };
