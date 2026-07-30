/**
 * Browser + Node safe review import gates.
 * Uses the generated standalone JSON Schema validator (same schema as Ajv Node).
 */

import validateSchema from '../generated/food-equivalents-validator.mjs';
import { auditDataset, validateSource } from './food-audit-core.mjs';
import { isVerifiedFood } from './food-status.mjs';
import { collectVerificationIntegrityErrors } from './verification-integrity.mjs';
import {
  validateVerificationEligibility,
  verifiedOpenErrorsMessage,
} from './verification-eligibility.mjs';
import {
  isValidApprovedAt,
  isValidIsoDateOnly,
  isValidIsoDateTime,
} from './source-validators.mjs';

function schemaErrors() {
  return (validateSchema.errors || []).map((e) => ({
    path: e.instancePath || e.schemaPath || '$',
    message: `${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
    keyword: e.keyword,
  }));
}

function assertDateField(errors, path, value, label) {
  if (value == null || value === '') return;
  if (isValidIsoDateTime(value) || isValidIsoDateOnly(value) || isValidApprovedAt(value)) return;
  errors.push({
    path,
    message: `${label} invalide: ${value}`,
    keyword: 'format',
  });
}

/**
 * Validate review/export payload before UI initFrom.
 * Refuses structural issues, duplicates, status mismatches, and incomplete verification.
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

  assertDateField(errors, '/meta/exportedAt', payload.meta?.exportedAt, 'exportedAt');
  assertDateField(errors, '/meta/lastAppliedAt', payload.meta?.lastAppliedAt, 'lastAppliedAt');

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

    for (const err of collectVerificationIntegrityErrors(food)) {
      errors.push({
        path: `${path}/verification`,
        message: `${err.code}: ${err.message}`,
        keyword: err.code,
      });
    }

    for (const [i, entry] of (food.history || []).entries()) {
      assertDateField(
        errors,
        `${path}/history/${i}/timestamp`,
        entry?.timestamp || entry?.at,
        'history timestamp'
      );
    }
    for (const [i, resolution] of (food.auditResolutions || []).entries()) {
      assertDateField(
        errors,
        `${path}/auditResolutions/${i}/approvedAt`,
        resolution?.approvedAt,
        'approvedAt'
      );
      assertDateField(
        errors,
        `${path}/auditResolutions/${i}/createdAt`,
        resolution?.createdAt,
        'createdAt'
      );
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

  const audit =
    payload.foods.every(
      (food) => food && typeof food === 'object' && !Array.isArray(food)
    )
      ? auditDataset(payload.foods)
      : null;
  if (audit) {
    for (const food of payload.foods) {
      if (!isVerifiedFood(food)) continue;
      const eligibility = validateVerificationEligibility(food, audit.byId[food.id], {
        sourceAuthoritative: validateSource(food).authoritative,
      });
      if (!eligibility.ok) {
        errors.push({
          path: `/foods/${food.id}/verification`,
          message: verifiedOpenErrorsMessage(food, eligibility),
          keyword: 'VERIFIED_WITH_OPEN_ERRORS',
        });
      }
    }
  }

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
    return { ok: false, duplicateIds, errors: unique, message, audit };
  }

  return { ok: true, duplicateIds: [], errors: [], audit };
}
