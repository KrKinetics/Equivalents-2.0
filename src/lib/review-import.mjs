/**
 * Browser + Node safe review import gates.
 * Uses the generated standalone JSON Schema validator (same schema as Ajv Node).
 */

import validateSchema from '../generated/food-equivalents-validator.mjs';

function schemaErrors() {
  return (validateSchema.errors || []).map((e) => ({
    path: e.instancePath || e.schemaPath || '$',
    message: `${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
    keyword: e.keyword,
  }));
}

/**
 * Validate review/export payload before UI initFrom.
 * Refuses structural issues, duplicates, and status mismatches.
 * Does NOT call ensureShapes / silent normalization.
 *
 * @returns {{ ok: boolean, duplicateIds: string[], errors: Array, message?: string }}
 */
export function validateReviewImport(payload) {
  const errors = [];
  const duplicateIds = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      duplicateIds,
      errors: [{ path: '$', message: 'JSON invalide: objet racine requis', keyword: 'type' }],
      message: 'JSON invalide: objet racine requis',
    };
  }

  if (!Array.isArray(payload.foods)) {
    return {
      ok: false,
      duplicateIds,
      errors: [{ path: '/foods', message: 'foods[] requis', keyword: 'required' }],
      message: 'JSON invalide: foods[] requis',
    };
  }

  // Fast structural / type gates before full schema (clearer messages for common cases)
  payload.foods.forEach((food, index) => {
    const path = `/foods/${index}`;
    if (food == null || typeof food !== 'object' || Array.isArray(food)) {
      errors.push({ path, message: 'aliment doit être un objet', keyword: 'type' });
      return;
    }
    if (food.id == null) {
      errors.push({ path: `${path}/id`, message: 'id manquant', keyword: 'required' });
    } else if (typeof food.id !== 'string') {
      errors.push({ path: `${path}/id`, message: 'id doit être une string', keyword: 'type' });
    } else if (!food.id.trim()) {
      errors.push({ path: `${path}/id`, message: 'id vide', keyword: 'minLength' });
    }
    if (food.names == null) {
      errors.push({ path: `${path}/names`, message: 'names manquant', keyword: 'required' });
    }
    if (food.portion == null) {
      errors.push({ path: `${path}/portion`, message: 'portion manquante', keyword: 'required' });
    }
    if (food.nutrients == null) {
      errors.push({ path: `${path}/nutrients`, message: 'nutrients manquant', keyword: 'required' });
    }
    if (food.version != null && typeof food.version !== 'number') {
      errors.push({
        path: `${path}/version`,
        message: `version invalide (reçu ${typeof food.version})`,
        keyword: 'type',
      });
    }
    if (
      food.status != null &&
      food.verification?.status != null &&
      food.status !== food.verification.status
    ) {
      errors.push({
        path,
        message: `STATUS_MISMATCH: status=${food.status} verification.status=${food.verification.status}`,
        keyword: 'statusMismatch',
      });
    }
  });

  const counts = new Map();
  for (const food of payload.foods) {
    if (typeof food?.id === 'string' && food.id.trim()) {
      counts.set(food.id, (counts.get(food.id) || 0) + 1);
    }
  }
  for (const [id, n] of counts) {
    if (n > 1) duplicateIds.push(id);
  }
  if (duplicateIds.length) {
    errors.push({
      path: '/foods',
      message: `identifiant(s) dupliqué(s): ${duplicateIds.join(', ')}`,
      keyword: 'duplicateId',
    });
  }

  const schemaOk = validateSchema(payload);
  if (!schemaOk) {
    for (const err of schemaErrors()) errors.push(err);
  }

  // Deduplicate identical error messages
  const seen = new Set();
  const unique = [];
  for (const err of errors) {
    const key = `${err.path}|${err.keyword}|${err.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(err);
  }

  if (unique.length) {
    const message =
      duplicateIds.length > 0
        ? `Import refusé: identifiant(s) dupliqué(s): ${duplicateIds.join(', ')}`
        : `Import refusé: ${unique[0].message}${unique.length > 1 ? ` (+${unique.length - 1})` : ''}`;
    return { ok: false, duplicateIds, errors: unique, message };
  }

  return { ok: true, duplicateIds: [], errors: [] };
}
