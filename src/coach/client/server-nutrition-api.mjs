/**
 * Browser client for Coach server nutrition + PDF APIs.
 * Never falls back to /api/coach-data or local coach-data.json.
 */

const ROUTES = Object.freeze({
  search: '/api/coach-food-search',
  detail: '/api/coach-food-detail',
  energy: '/api/coach-calc-energy',
  macros: '/api/coach-calc-macros',
  portions: '/api/coach-calc-portions',
  equivalences: '/api/coach-calc-equivalences',
  pdf: '/api/coach-generate-pdf',
});

export const SERVER_NUTRITION_GENERIC_ERROR =
  'Le service nutritionnel est temporairement indisponible. Réessayez.';

export const SERVER_PDF_GENERIC_ERROR =
  'La génération PDF est temporairement indisponible. Réessayez.';

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

/**
 * PDF endpoint returns binary — never parse as JSON on success.
 * @param {object} body
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generatePdfApi(body = {}) {
  const res = await fetch(ROUTES.pdf, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/pdf',
    },
    body: JSON.stringify({ ...orgFields(), ...body }),
  });

  if (!res.ok) {
    let publicError = 'unavailable';
    try {
      const data = await res.json();
      publicError = data?.error || publicError;
    } catch { /* ignore */ }
    const err = new Error(SERVER_PDF_GENERIC_ERROR);
    err.status = res.status;
    err.publicError = publicError;
    throw err;
  }

  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
  const filename = match
    ? decodeURIComponent(match[1].replace(/"/g, ''))
    : 'Plan.pdf';
  const blob = await res.blob();
  return { blob, filename };
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
