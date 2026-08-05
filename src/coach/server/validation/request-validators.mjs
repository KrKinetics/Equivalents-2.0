/**
 * Strict request validators for Coach nutrition API routes.
 * Reject unknown properties. Enforce types, ranges, and length limits.
 */

import { MAX_API_BODY_BYTES } from '../require-request-auth.mjs';
import { MAX_QUERY_LENGTH, MAX_SEARCH_LIMIT } from '../search/search-foods.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOOD_ID_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/i;
const ACTIVITES = new Set(['sedentaire', 'leger', 'modere', 'actif']);
const SEXES = new Set(['H', 'F']);
const METHODS = new Set(['nasem2023', 'iom2005']);
const PROTEIN_MODES = new Set(['gkg', 'pct']);
const MACRO_MODES = new Set(['preset', 'custom']);
const PORTION_ACTIONS = new Set([
  'moyennes', 'banque_totals', 'suggest', 'score', 'distribute',
  'planned_totals', 'reconcile', 'portion_totals', 'macro_percentages',
  'auto_repartition',
]);
const REPART_MODES = new Set(['classique', 'equilibre', 'performance', 'entrainement']);
const CATS = ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];

function fail(message = 'bad_request') {
  return { ok: false, error: 'bad_request', message };
}

function assertObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_json_object');
  return null;
}

function assertNoUnknown(body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) return fail('unexpected_property');
  }
  return null;
}

function optionalUuid(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) return fail(`invalid_${field}`);
  return null;
}

function optionalSlug(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(value)) {
    return fail('invalid_organization_slug');
  }
  return null;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function finiteNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Shared org selector fields (never trusted alone — auth module verifies membership).
 */
function readOrgFields(body) {
  const err = optionalUuid(body.organization_id, 'organization_id')
    || optionalSlug(body.organization_slug);
  if (err) return err;
  return {
    ok: true,
    organization_id: body.organization_id || null,
    organization_slug: body.organization_slug || null,
  };
}

export function validateFoodSearchBody(body) {
  const objErr = assertObject(body);
  if (objErr) return objErr;
  const allowed = new Set([
    'organization_id', 'organization_slug', 'q', 'category', 'limit', 'offset',
  ]);
  const unk = assertNoUnknown(body, allowed);
  if (unk) return unk;
  const org = readOrgFields(body);
  if (!org.ok) return org;

  if (body.q != null && typeof body.q !== 'string') return fail('invalid_q');
  if (body.q != null && body.q.length > MAX_QUERY_LENGTH) return fail('q_too_long');
  if (body.category != null && typeof body.category !== 'string') return fail('invalid_category');
  if (body.category != null && body.category.length > 64) return fail('category_too_long');

  return {
    ok: true,
    value: {
      organization_id: org.organization_id,
      organization_slug: org.organization_slug,
      q: body.q == null ? '' : String(body.q),
      category: body.category == null ? '' : String(body.category),
      limit: clampInt(body.limit, 1, MAX_SEARCH_LIMIT, 25),
      offset: clampInt(body.offset, 0, 10_000, 0),
    },
  };
}

export function validateFoodDetailBody(body) {
  const objErr = assertObject(body);
  if (objErr) return objErr;
  const allowed = new Set(['organization_id', 'organization_slug', 'id']);
  const unk = assertNoUnknown(body, allowed);
  if (unk) return unk;
  const org = readOrgFields(body);
  if (!org.ok) return org;
  if (typeof body.id !== 'string' || !FOOD_ID_RE.test(body.id)) return fail('invalid_id');
  return {
    ok: true,
    value: {
      organization_id: org.organization_id,
      organization_slug: org.organization_slug,
      id: body.id,
    },
  };
}

export function validateEnergyBody(body) {
  const objErr = assertObject(body);
  if (objErr) return objErr;
  const allowed = new Set([
    'organization_id', 'organization_slug',
    'sexe', 'age', 'poidsKg', 'hauteurM', 'activite', 'method',
  ]);
  const unk = assertNoUnknown(body, allowed);
  if (unk) return unk;
  const org = readOrgFields(body);
  if (!org.ok) return org;

  if (!SEXES.has(body.sexe)) return fail('invalid_sexe');
  const age = finiteNumber(body.age, 1, 120);
  const poidsKg = finiteNumber(body.poidsKg, 20, 400);
  const hauteurM = finiteNumber(body.hauteurM, 0.5, 2.5);
  if (age == null || poidsKg == null || hauteurM == null) return fail('invalid_numeric');
  if (!ACTIVITES.has(body.activite)) return fail('invalid_activite');
  const method = body.method == null ? 'nasem2023' : body.method;
  if (!METHODS.has(method)) return fail('invalid_method');

  return {
    ok: true,
    value: {
      organization_id: org.organization_id,
      organization_slug: org.organization_slug,
      sexe: body.sexe,
      age,
      poidsKg,
      hauteurM,
      activite: body.activite,
      method,
    },
  };
}

export function validateMacrosBody(body) {
  const objErr = assertObject(body);
  if (objErr) return objErr;
  const allowed = new Set([
    'organization_id', 'organization_slug',
    'tdee', 'goalMultiplier', 'weightKg',
    'proteinMode', 'gPerKg', 'pct', 'proteinGrams',
    'macroMode', 'macroRatio', 'customG', 'customL',
    'isRestDay', 'hydrationKcal', 'manualAddL',
  ]);
  const unk = assertNoUnknown(body, allowed);
  if (unk) return unk;
  const org = readOrgFields(body);
  if (!org.ok) return org;

  const tdee = finiteNumber(body.tdee, 0, 20_000);
  const weightKg = finiteNumber(body.weightKg, 20, 400);
  const goalMultiplier = finiteNumber(body.goalMultiplier ?? 1, 0.5, 1.5);
  if (tdee == null || weightKg == null || goalMultiplier == null) return fail('invalid_numeric');

  const proteinMode = body.proteinMode == null ? 'gkg' : body.proteinMode;
  if (!PROTEIN_MODES.has(proteinMode)) return fail('invalid_protein_mode');
  const macroMode = body.macroMode == null ? 'preset' : body.macroMode;
  if (!MACRO_MODES.has(macroMode)) return fail('invalid_macro_mode');

  if (body.macroRatio != null) {
    if (typeof body.macroRatio !== 'string' || body.macroRatio.length > 32) return fail('invalid_macro_ratio');
  }
  if (body.isRestDay != null && typeof body.isRestDay !== 'boolean') return fail('invalid_is_rest_day');

  return {
    ok: true,
    value: {
      organization_id: org.organization_id,
      organization_slug: org.organization_slug,
      tdee,
      goalMultiplier,
      weightKg,
      proteinMode,
      gPerKg: body.gPerKg,
      pct: body.pct,
      proteinGrams: body.proteinGrams,
      macroMode,
      macroRatio: body.macroRatio == null ? '25,45,30' : body.macroRatio,
      customG: body.customG,
      customL: body.customL,
      isRestDay: Boolean(body.isRestDay),
      hydrationKcal: body.hydrationKcal,
      manualAddL: body.manualAddL,
    },
  };
}

function validateBanqueMap(banque) {
  if (!banque || typeof banque !== 'object' || Array.isArray(banque)) return fail('invalid_banque');
  for (const key of Object.keys(banque)) {
    if (!CATS.includes(key)) return fail('unexpected_banque_key');
    const n = Number(banque[key]);
    if (!Number.isFinite(n) || n < 0 || n > 500) return fail('invalid_banque_value');
  }
  return null;
}

export function validatePortionsBody(body) {
  const objErr = assertObject(body);
  if (objErr) return objErr;
  const allowed = new Set([
    'organization_id', 'organization_slug',
    'action', 'banque', 'targets', 'portions', 'total', 'weights',
    'repartition', 'reconcileInput',
    'mode', 'heureEntrainement',
    'pro', 'glu', 'lip',
  ]);
  const unk = assertNoUnknown(body, allowed);
  if (unk) return unk;
  const org = readOrgFields(body);
  if (!org.ok) return org;
  if (!PORTION_ACTIONS.has(body.action)) return fail('invalid_action');

  if (body.banque != null) {
    const bErr = validateBanqueMap(body.banque);
    if (bErr) return bErr;
  }
  if (body.weights != null) {
    if (!Array.isArray(body.weights) || body.weights.length > 20) return fail('invalid_weights');
    for (const w of body.weights) {
      if (!Number.isFinite(Number(w)) || Number(w) < 0 || Number(w) > 1000) return fail('invalid_weights');
    }
  }
  if (body.total != null) {
    const t = finiteNumber(body.total, 0, 500);
    if (t == null) return fail('invalid_total');
  }
  if (body.mode != null) {
    if (typeof body.mode !== 'string' || !REPART_MODES.has(body.mode)) return fail('invalid_mode');
  }
  if (body.heureEntrainement != null && body.heureEntrainement !== '') {
    if (typeof body.heureEntrainement !== 'string' || !/^\d{2}:\d{2}$/.test(body.heureEntrainement)) {
      return fail('invalid_heureEntrainement');
    }
  }
  for (const macroKey of ['pro', 'glu', 'lip']) {
    if (body[macroKey] != null) {
      const n = finiteNumber(body[macroKey], 0, 2000);
      if (n == null) return fail(`invalid_${macroKey}`);
    }
  }

  return {
    ok: true,
    value: {
      organization_id: org.organization_id,
      organization_slug: org.organization_slug,
      action: body.action,
      banque: body.banque,
      targets: body.targets,
      portions: body.portions,
      total: body.total,
      weights: body.weights,
      repartition: body.repartition,
      mode: body.mode,
      heureEntrainement: body.heureEntrainement == null || body.heureEntrainement === ''
        ? null
        : body.heureEntrainement,
      pro: body.pro,
      glu: body.glu,
      lip: body.lip,
      reconcileInput: body.reconcileInput,
    },
  };
}

export function validateEquivalencesBody(body) {
  const objErr = assertObject(body);
  if (objErr) return objErr;
  const allowed = new Set([
    'organization_id', 'organization_slug', 'category', 'limit', 'offset',
  ]);
  const unk = assertNoUnknown(body, allowed);
  if (unk) return unk;
  const org = readOrgFields(body);
  if (!org.ok) return org;
  if (body.category != null && typeof body.category !== 'string') return fail('invalid_category');
  if (body.category != null && body.category.length > 64) return fail('category_too_long');

  return {
    ok: true,
    value: {
      organization_id: org.organization_id,
      organization_slug: org.organization_slug,
      category: body.category == null ? '' : String(body.category),
      limit: clampInt(body.limit, 1, MAX_SEARCH_LIMIT, 25),
      offset: clampInt(body.offset, 0, 10_000, 0),
    },
  };
}

export { MAX_API_BODY_BYTES };
