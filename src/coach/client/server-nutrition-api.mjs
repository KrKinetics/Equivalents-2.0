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

export const SERVER_NUTRITION_RATE_LIMIT_ERROR =
  'Trop de demandes rapprochées. Attendez quelques secondes puis réessayez.';

export const SERVER_NUTRITION_RATE_BACKEND_ERROR =
  'Le service est temporairement indisponible. Réessayez dans quelques secondes.';

export const SERVER_NUTRITION_VALIDATION_ERROR =
  'Certaines données du plan doivent être recalculées.';

export const SERVER_NUTRITION_AUTH_ERROR =
  'Votre session a expiré. Reconnectez-vous puis réessayez.';

export const SERVER_NUTRITION_FORBIDDEN_ERROR =
  'Accès refusé pour cette organisation.';

export const SERVER_PDF_GENERIC_ERROR =
  'La génération PDF est temporairement indisponible. Réessayez.';

export const SERVER_PDF_PLAN_NOT_READY_ERROR =
  'Le plan alimentaire n’est pas prêt. Générez ou complétez la répartition des portions avant d’exporter le PDF.';

export const SERVER_PDF_INCONSISTENT_PLAN_ERROR =
  'Le plan alimentaire est incomplet ou incohérent. Vérifiez les portions et les totaux, puis réessayez.';

/**
 * Map HTTP status / public error code to a stable user-facing message.
 * Internal codes stay on the Error object (publicError) for diagnostics.
 * @param {number} status
 * @param {string} [publicError]
 */
export function formatServerNutritionError(status, publicError = '') {
  const code = String(publicError || '');
  if (status === 429 || code === 'rate_limited') return SERVER_NUTRITION_RATE_LIMIT_ERROR;
  if (code === 'rate_limit_unavailable' || code === 'rate_limit_misconfigured') {
    return SERVER_NUTRITION_RATE_BACKEND_ERROR;
  }
  if (
    status === 400
    || status === 413
    || status === 415
    || status === 422
    || code === 'validation_failed'
    || code === 'malformed_request'
    || code === 'bad_request'
    || code === 'payload_too_large'
    || code === 'unsupported_media_type'
  ) {
    return SERVER_NUTRITION_VALIDATION_ERROR;
  }
  if (status === 401 || code === 'unauthorized') return SERVER_NUTRITION_AUTH_ERROR;
  if (status === 403 || code === 'forbidden') return SERVER_NUTRITION_FORBIDDEN_ERROR;
  if (status === 409 || code === 'conflict') return SERVER_NUTRITION_VALIDATION_ERROR;
  return SERVER_NUTRITION_GENERIC_ERROR;
}

export function formatServerPdfError(requestId, publicError) {
  if (publicError === 'plan_not_ready') return SERVER_PDF_PLAN_NOT_READY_ERROR;
  if (publicError === 'inconsistent_plan') return SERVER_PDF_INCONSISTENT_PLAN_ERROR;
  if (publicError === 'rate_limited') return SERVER_NUTRITION_RATE_LIMIT_ERROR;
  const id = String(requestId || '').trim();
  if (!id) return SERVER_PDF_GENERIC_ERROR;
  return `${SERVER_PDF_GENERIC_ERROR} Code : ${id.slice(0, 8)}`;
}

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
    const publicError = data?.error || 'nutrition_service_error';
    const err = new Error(formatServerNutritionError(res.status, publicError));
    err.status = res.status;
    err.publicError = publicError;
    err.requestId = data?.requestId || res.headers.get('x-request-id') || '';
    err.retryAfter = res.headers.get('Retry-After') || '';
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
    },
    body: JSON.stringify({ ...orgFields(), ...body }),
  });

  if (!res.ok) {
    let publicError = 'unavailable';
    let requestId = res.headers.get('x-request-id') || '';
    let stage = '';
    try {
      const data = await res.json();
      publicError = data?.error || publicError;
      if (data?.requestId) requestId = String(data.requestId);
      if (data?.stage) stage = String(data.stage);
    } catch { /* ignore */ }
    const err = new Error(formatServerPdfError(requestId, publicError));
    err.status = res.status;
    err.publicError = publicError;
    err.requestId = requestId;
    err.stage = stage;
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
