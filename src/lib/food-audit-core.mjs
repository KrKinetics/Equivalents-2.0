/**
 * Shared food audit engine (Node + browser).
 * Pure functions — never mutates nutrients.
 */

import {
  CALCULATION_GROUPS,
  DISPLAY_CATEGORIES,
  FOOD_STATUSES,
  PORTION_UNITS,
  PREPARATION_STATES,
  SOURCE_TYPES,
} from './nutrition-constants.mjs';
import { parsePortionLabel } from './legacy-portion-parser.mjs';
import { getFoodStatus, hasStatusMismatch, isVerifiedFood, isRejectedFood, isActiveFood } from './food-status.mjs';
import {
  isMeaningfulString,
  isValidIsoDateOnly,
  isValidIsoDateTime,
  isValidApprovedAt,
  isValidHttpUrl,
  isValidDoi,
  isValidNutrientsBasis,
  looksLikeServingDescription,
  looksLikeEvidenceRef,
  knownSourceReferenceIds,
} from './source-validators.mjs';
import { validateNumericField, NUTRIENT_NUMERIC_FIELDS } from './numeric-validate.mjs';
import {
  STRUCTURAL_BLOCKING_CODES,
  collectVerificationIntegrityErrors,
} from './verification-integrity.mjs';
import {
  validateVerificationEligibility,
  verifiedOpenErrorsMessage,
} from './verification-eligibility.mjs';

export const RESOLVABLE_CODES = new Set([
  'KCAL_DIFF_HIGH',
  'KCAL_DIFF_MODERATE',
  'PORTION_LABEL_MISMATCH_FR',
  'PORTION_LABEL_MISMATCH_EN',
]);

export const NON_RESOLVABLE_CODES = new Set([
  'MISSING_REQUIRED',
  'NEGATIVE_VALUE',
  'INVALID_NUMERIC_TYPE',
  'NON_FINITE_VALUE',
  'DUPLICATE_ID',
  'STATUS_MISMATCH',
  'INSUFFICIENT_SOURCE',
  'SCOOP_WITHOUT_GRAMS',
  'SOURCE_RECORD_ID_MISSING',
  'SOURCE_ACCESS_DATE_MISSING',
  'SOURCE_SERVING_MISSING',
  'SOURCE_EVIDENCE_MISSING',
  'SOURCE_BASIS_MISSING',
  'SOURCE_URL_OR_RECORD_MISSING',
  'VERIFICATION_DATE_MISSING',
  'VERIFICATION_DATE_INVALID',
  'VERIFICATION_REVIEWER_MISSING',
  'VERIFICATION_DATASET_VERSION_MISSING',
  'VERIFICATION_HISTORY_MISSING',
  'VERIFICATION_HISTORY_INCOMPLETE',
  'VERIFICATION_HISTORY_MISMATCH',
  'VERIFICATION_HISTORY_OLD_VALUE_MISMATCH',
  'VERIFICATION_TRANSACTION_ID_REUSED',
  'VERIFICATION_TRANSACTION_NOT_CONTIGUOUS',
  'VERIFICATION_TRANSACTION_ORDER_INVALID',
  'VERIFIED_WITH_OPEN_ERRORS',
]);

/** Legacy nutrient signatures that still trigger SUSPECT_CASE when name matches. */
export const SUSPECT_CASES = [
  {
    id: 'chicken_breast',
    match: /poitrine de poulet|chicken breast/i,
    reason: 'Suspect legacy signature: ~48 kcal / 8 g protein / 7 g fat',
    signature: { declaredKcal: 48, proteinG: 8, fatG: 7 },
    tolerance: { declaredKcal: 2, proteinG: 0.5, fatG: 0.5 },
  },
  {
    id: 'egg_whites',
    match: /blancs d['’]œuf|egg whites/i,
    reason: 'Suspect legacy signature: ~36 kcal / 2.5 g protein / 1 g carbs',
    signature: { declaredKcal: 36, proteinG: 2.5, carbsG: 1 },
    tolerance: { declaredKcal: 2, proteinG: 0.3, carbsG: 0.3 },
  },
  {
    id: 'greek_yogurt',
    match: /yogourt grec \(100 g\)|greek yogurt \(100 g\)|100 ml.*greek yogurt|100 ml de Yogourt grec/i,
    reason: 'Suspect legacy signature: ~67 kcal / 1 g protein / 3 g carbs / 0 g fat',
    signature: { declaredKcal: 67, proteinG: 1, carbsG: 3, fatG: 0 },
    tolerance: { declaredKcal: 2, proteinG: 0.3, carbsG: 0.3, fatG: 0.3 },
  },
  {
    id: 'sweet_potato',
    match: /pomme de terre.*douce|sweet potato/i,
    reason: 'Suspect legacy signature: ~82 kcal / 3 g protein / 1 g carbs',
    signature: { declaredKcal: 82, proteinG: 3, carbsG: 1 },
    tolerance: { declaredKcal: 2, proteinG: 0.5, carbsG: 0.5 },
  },
  {
    id: 'quinoa',
    match: /quinoa/i,
    reason: 'Suspect legacy signature: ~116 kcal / 8 g protein / 1 g carbs',
    signature: { declaredKcal: 116, proteinG: 8, carbsG: 1 },
    tolerance: { declaredKcal: 2, proteinG: 0.5, carbsG: 0.5 },
  },
];

export function calculatedKcal(nutrients) {
  const n = nutrients || {};
  const p = n.proteinG;
  const c = n.carbsG;
  const f = n.fatG;
  if ([p, c, f].some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return p * 4 + c * 4 + f * 9;
}

function fatFromComponents(n) {
  const parts = [n.saturatedFatG, n.polyunsaturatedFatG, n.monounsaturatedFatG];
  if (parts.every((v) => v == null)) return null;
  return parts.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
}

function push(alerts, severity, code, message, extra = {}) {
  alerts.push({ severity, code, message, ...extra });
}

function approxEq(actual, expected, tol) {
  if (expected == null) return true;
  if (actual == null || !Number.isFinite(Number(actual))) return false;
  return Math.abs(Number(actual) - Number(expected)) <= Number(tol ?? 0);
}

export function matchesSuspectSignature(nutrients, signature, tolerance = {}) {
  if (!signature) return false;
  return Object.keys(signature).every((key) =>
    approxEq(nutrients?.[key], signature[key], tolerance[key] ?? 0)
  );
}

export function resolutionSnapshotHash(code, food) {
  const n = food?.nutrients || {};
  const p = food?.portion || {};
  if (code === 'KCAL_DIFF_HIGH' || code === 'KCAL_DIFF_MODERATE') {
    return `kcal:${n.proteinG}|${n.carbsG}|${n.fatG}|${n.declaredKcal}`;
  }
  if (code === 'PORTION_LABEL_MISMATCH_FR') {
    return `portionFr:${p.amount}|${p.unit}|${p.grams}|${p.labelFr}`;
  }
  if (code === 'PORTION_LABEL_MISMATCH_EN') {
    return `portionEn:${p.amount}|${p.unit}|${p.grams}|${p.labelEn}`;
  }
  return `generic:${code}`;
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  const out = [];
  for (const alert of alerts) {
    const key = `${alert.severity}|${alert.code}|${alert.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alert);
  }
  return out;
}

/** Resolution lifecycle: open | invalid | stale | resolved_documented */
export function getResolutionState(food, code) {
  const list = food.auditResolutions || [];
  const match = [...list].reverse().find((r) => r && r.code === code);
  if (!match) return { status: 'open', resolution: null };

  if (!RESOLVABLE_CODES.has(code) || !RESOLVABLE_CODES.has(match.code)) {
    return { status: 'invalid', resolution: match };
  }
  if (!match.fieldsHash) return { status: 'invalid', resolution: match };
  if (!match.reason || !match.approvedBy || !match.sourceReferenceId) {
    return { status: 'invalid', resolution: match };
  }
  if (!isValidApprovedAt(match.approvedAt)) {
    return { status: 'invalid', resolution: match };
  }
  if (!isValidIsoDateTime(match.createdAt)) {
    return { status: 'invalid', resolution: match };
  }
  if (!Number.isInteger(match.version) || match.version < 1) {
    return { status: 'invalid', resolution: match };
  }

  const sourceResult = validateSource(food);
  if (!sourceResult.authoritative) {
    return { status: 'invalid', resolution: match };
  }

  const known = knownSourceReferenceIds(food);
  if (!known.includes(String(match.sourceReferenceId).trim())) {
    return { status: 'invalid', resolution: match };
  }

  const expected = resolutionSnapshotHash(code, food);
  if (match.fieldsHash !== expected) {
    return { status: 'stale', resolution: match };
  }
  return { status: 'resolved_documented', resolution: match };
}

function nearNumber(a, b, tol = 0.051) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= tol;
}

export function compareLabelToCanonical(label, canonical, lang) {
  const parsed = parsePortionLabel(label || '');
  const mismatches = [];
  if (!nearNumber(parsed.amount, canonical?.amount)) {
    mismatches.push({ field: 'amount', parsed: parsed.amount, canonical: canonical?.amount });
  }
  if (parsed.unit && canonical?.unit && parsed.unit !== canonical.unit) {
    mismatches.push({ field: 'unit', parsed: parsed.unit, canonical: canonical.unit });
  }
  // grams: only compare when both sides have a value
  if (parsed.grams != null && canonical?.grams != null && !nearNumber(parsed.grams, canonical.grams)) {
    mismatches.push({ field: 'grams', parsed: parsed.grams, canonical: canonical.grams });
  }
  return { parsed, mismatches, lang };
}

/**
 * Detailed source validation. Returns { ok, alerts }.
 * Empty/generic strings, invalid dates/URLs/DOI, and type+name alone are NEVER enough.
 */
export function validateSource(food) {
  const alerts = [];
  const s = food?.source || {};
  if (!s.type || !SOURCE_TYPES.includes(s.type)) {
    return {
      ok: false,
      alerts: [
        {
          severity: 'WARNING',
          code: 'LEGACY_SOURCE_ONLY',
          message: 'Seule la source legacy du guide est présente — insuffisante pour verified',
        },
      ],
      authoritative: false,
    };
  }

  const need = (cond, code, message) => {
    if (!cond) push(alerts, 'ERROR', code, message);
  };

  const accessDateMessage =
    'accessedAt doit être une date ISO YYYY-MM-DD valide et non future';
  // Shared field quality checks when values are present
  if (s.accessedAt != null && s.accessedAt !== '') {
    need(isValidIsoDateOnly(s.accessedAt), 'SOURCE_ACCESS_DATE_MISSING', accessDateMessage);
  }
  if (s.url != null && s.url !== '') {
    need(isValidHttpUrl(s.url), 'SOURCE_URL_OR_RECORD_MISSING', 'url doit être une URI HTTP/HTTPS valide');
  }
  if (s.doi != null && s.doi !== '') {
    need(isValidDoi(s.doi), 'SOURCE_URL_OR_RECORD_MISSING', 'doi doit être un DOI valide ou une URL doi.org');
  }
  if (s.nutrientsBasis != null && s.nutrientsBasis !== '') {
    need(isValidNutrientsBasis(s.nutrientsBasis), 'SOURCE_BASIS_MISSING', 'nutrientsBasis doit appartenir à l’enum autorisé');
  }

  switch (s.type) {
    case 'canadian_nutrient_file':
    case 'usda_fooddata_central':
      need(isMeaningfulString(s.name), 'INSUFFICIENT_SOURCE', 'source.name requis et significatif');
      need(isMeaningfulString(s.recordId, { minLength: 2 }), 'SOURCE_RECORD_ID_MISSING', 'recordId exploitable requis (pas x/- /test)');
      need(isValidIsoDateOnly(s.accessedAt), 'SOURCE_ACCESS_DATE_MISSING', accessDateMessage);
      need(looksLikeServingDescription(s.servingDescription), 'SOURCE_SERVING_MISSING', 'servingDescription doit décrire une portion ou une base en grammes');
      need(isValidNutrientsBasis(s.nutrientsBasis), 'SOURCE_BASIS_MISSING', 'nutrientsBasis enum requis (ne peut pas être null)');
      break;
    case 'manufacturer_label': {
      const brand = s.brand || food.portion?.brand;
      need(isMeaningfulString(brand), 'INSUFFICIENT_SOURCE', 'brand significatif requis');
      need(isMeaningfulString(s.productName), 'INSUFFICIENT_SOURCE', 'productName significatif requis');
      need(isMeaningfulString(s.labelServingSize), 'SOURCE_SERVING_MISSING', 'labelServingSize significatif requis');
      need(isValidIsoDateOnly(s.accessedAt), 'SOURCE_ACCESS_DATE_MISSING', accessDateMessage);
      need(looksLikeEvidenceRef(s.evidenceRef), 'SOURCE_EVIDENCE_MISSING', 'evidenceRef (chemin, URL ou id de preuve) requis');
      need(looksLikeServingDescription(s.servingDescription), 'SOURCE_SERVING_MISSING', 'servingDescription doit correspondre à la portion d’étiquette');
      break;
    }
    case 'manufacturer_website':
      need(
        isMeaningfulString(s.brand) || isMeaningfulString(s.productName),
        'INSUFFICIENT_SOURCE',
        'brand ou productName significatif requis'
      );
      need(isValidHttpUrl(s.url), 'SOURCE_URL_OR_RECORD_MISSING', 'url HTTP/HTTPS valide requise');
      need(isValidIsoDateOnly(s.accessedAt), 'SOURCE_ACCESS_DATE_MISSING', accessDateMessage);
      need(looksLikeServingDescription(s.servingDescription), 'SOURCE_SERVING_MISSING', 'servingDescription significatif requis');
      break;
    case 'peer_reviewed_reference':
      need(isMeaningfulString(s.name), 'INSUFFICIENT_SOURCE', 'source.name significatif requis');
      need(
        isMeaningfulString(s.recordId) || isValidHttpUrl(s.url) || isValidDoi(s.doi),
        'SOURCE_URL_OR_RECORD_MISSING',
        'recordId, DOI ou URL valide requis'
      );
      need(isValidIsoDateOnly(s.accessedAt), 'SOURCE_ACCESS_DATE_MISSING', accessDateMessage);
      need(looksLikeServingDescription(s.servingDescription), 'SOURCE_SERVING_MISSING', 'servingDescription significatif requis');
      break;
    case 'other_authoritative':
      need(isMeaningfulString(s.name), 'INSUFFICIENT_SOURCE', 'source.name significatif requis');
      need(
        isValidHttpUrl(s.url) || isMeaningfulString(s.recordId),
        'SOURCE_URL_OR_RECORD_MISSING',
        'URL HTTP/HTTPS ou recordId exploitable requis'
      );
      need(isValidIsoDateOnly(s.accessedAt), 'SOURCE_ACCESS_DATE_MISSING', accessDateMessage);
      need(isMeaningfulString(s.notes, { minLength: 10 }), 'INSUFFICIENT_SOURCE', 'notes justifiant le caractère authoritative requises');
      break;
    default:
      push(alerts, 'ERROR', 'INSUFFICIENT_SOURCE', `Type de source inconnu: ${s.type}`);
  }

  const extras = [
    s.recordId,
    s.url,
    s.doi,
    s.accessedAt,
    s.servingDescription,
    s.nutrientsBasis,
    s.evidenceRef,
    s.productName,
    s.labelServingSize,
    s.brand,
    s.notes,
  ].filter((v) => v != null && String(v).trim() !== '');
  if (s.type && s.name && extras.length === 0) {
    push(
      alerts,
      'ERROR',
      'INSUFFICIENT_SOURCE',
      'Une source type+name seulement ne permet pas verified'
    );
  }

  const deduped = dedupeAlerts(alerts);
  const openErrors = deduped.filter((a) => a.severity === 'ERROR');
  return { ok: openErrors.length === 0, alerts: deduped, authoritative: openErrors.length === 0 };
}

export function hasAuthoritativeSource(food) {
  return validateSource(food).authoritative;
}

/**
 * Audit a single food.
 * @param {object} food
 * @param {Map<string, number>} idCounts
 */
export function auditFood(food, idCounts = new Map()) {
  const alerts = [];
  const n = food.nutrients || {};
  const portion = food.portion || {};
  const names = food.names || {};
  const status = getFoodStatus(food);

  if (!food.id) push(alerts, 'ERROR', 'MISSING_ID', 'Identifiant manquant');
  if (food.id && (idCounts.get(food.id) || 0) > 1) {
    push(alerts, 'ERROR', 'DUPLICATE_ID', `Identifiant dupliqué: ${food.id}`);
  }

  if (hasStatusMismatch(food)) {
    push(
      alerts,
      'ERROR',
      'STATUS_MISMATCH',
      `food.status (${food.status}) ≠ verification.status (${food.verification?.status})`
    );
  }

  if (!names.fr) push(alerts, 'ERROR', 'MISSING_FR_NAME', 'Nom français absent');
  if (!names.en) push(alerts, 'ERROR', 'MISSING_EN_NAME', 'Nom anglais / version EN absente');
  if (!portion.labelFr) push(alerts, 'ERROR', 'MISSING_PORTION_FR', 'Portion française absente');
  if (!portion.labelEn) push(alerts, 'ERROR', 'MISSING_PORTION_EN', 'Portion anglaise absente');

  if (portion.amount == null) {
    push(alerts, 'ERROR', 'MISSING_AMOUNT_UNIT', 'Quantité absente ou non positive');
  } else {
    const amountCheck = validateNumericField(portion.amount, {
      allowNull: false,
      exclusiveMin: 0,
      min: null,
      field: 'portion.amount',
    });
    if (!amountCheck.ok) {
      push(alerts, 'ERROR', amountCheck.code, amountCheck.message);
    }
  }
  if (!portion.unit) {
    push(alerts, 'ERROR', 'MISSING_AMOUNT_UNIT', 'Unité absente');
  } else if (!PORTION_UNITS.includes(portion.unit)) {
    push(alerts, 'ERROR', 'INVALID_UNIT', `Unité invalide: ${portion.unit}`);
  }

  if (food.displayCategory && !DISPLAY_CATEGORIES.includes(food.displayCategory)) {
    push(alerts, 'ERROR', 'INVALID_CATEGORY', `Catégorie invalide: ${food.displayCategory}`);
  }
  if (food.calculationGroup && !CALCULATION_GROUPS.includes(food.calculationGroup)) {
    push(alerts, 'ERROR', 'INVALID_GROUP', `Groupe invalide: ${food.calculationGroup}`);
  }

  if (portion.preparationState != null && portion.preparationState !== '') {
    if (!PREPARATION_STATES.includes(portion.preparationState)) {
      push(alerts, 'ERROR', 'INVALID_PREP_STATE', `État de préparation invalide: ${portion.preparationState}`);
    }
  } else {
    push(alerts, 'WARNING', 'MISSING_PREP_STATE', 'État cru/cuit/égoutté non précisé');
  }

  if (status && !FOOD_STATUSES.includes(status)) {
    push(alerts, 'ERROR', 'INVALID_STATUS', `Statut invalide: ${status}`);
  }

  for (const [key, label] of NUTRIENT_NUMERIC_FIELDS) {
    const required = key === 'proteinG' || key === 'carbsG' || key === 'declaredKcal';
    if (n[key] == null) {
      if (required) push(alerts, 'ERROR', 'MISSING_REQUIRED', `${label} manquante(s)`);
      else if (key === 'fatG') push(alerts, 'ERROR', 'MISSING_TOTAL_FAT', 'Lipides totaux absents');
      continue;
    }
    const check = validateNumericField(n[key], { allowNull: false, min: 0, field: key });
    if (!check.ok) push(alerts, 'ERROR', check.code, check.message);
  }

  if (portion.grams != null) {
    const gramsCheck = validateNumericField(portion.grams, {
      allowNull: false,
      exclusiveMin: 0,
      min: null,
      field: 'portion.grams',
    });
    if (!gramsCheck.ok) push(alerts, 'ERROR', gramsCheck.code, gramsCheck.message);
  }

  if (
    String(portion.unit).toLowerCase() === 'scoop' &&
    (portion.grams == null || typeof portion.grams !== 'number' || !Number.isFinite(portion.grams))
  ) {
    push(alerts, 'ERROR', 'SCOOP_WITHOUT_GRAMS', 'Scoop utilisé sans poids en grammes');
  }

  const canonical = { amount: portion.amount, unit: portion.unit, grams: portion.grams };
  const frCmp = compareLabelToCanonical(portion.labelFr, canonical, 'fr');
  const enCmp = compareLabelToCanonical(portion.labelEn, canonical, 'en');
  if (frCmp.mismatches.length) {
    const res = getResolutionState(food, 'PORTION_LABEL_MISMATCH_FR');
    push(
      alerts,
      'WARNING',
      'PORTION_LABEL_MISMATCH_FR',
      `Label FR diverge de la portion canonique: ${frCmp.mismatches
        .map((d) => `${d.field}(${d.parsed}≠${d.canonical})`)
        .join(', ')}`,
      { resolutionStatus: res.status, parsedPreview: frCmp.parsed }
    );
  }
  if (enCmp.mismatches.length) {
    const res = getResolutionState(food, 'PORTION_LABEL_MISMATCH_EN');
    push(
      alerts,
      'WARNING',
      'PORTION_LABEL_MISMATCH_EN',
      `Label EN diverge de la portion canonique: ${enCmp.mismatches
        .map((d) => `${d.field}(${d.parsed}≠${d.canonical})`)
        .join(', ')}`,
      { resolutionStatus: res.status, parsedPreview: enCmp.parsed }
    );
  }

  const calc = calculatedKcal(n);
  const declared = typeof n.declaredKcal === 'number' && Number.isFinite(n.declaredKcal) ? n.declaredKcal : null;
  let absDiff = null;
  let pctDiff = null;
  if (calc != null && declared != null) {
    absDiff = Math.abs(declared - calc);
    pctDiff = calc === 0 ? (declared === 0 ? 0 : 100) : (absDiff / Math.abs(calc)) * 100;
    if (absDiff > 15 || pctDiff > 20) {
      const res = getResolutionState(food, 'KCAL_DIFF_HIGH');
      push(
        alerts,
        'ERROR',
        'KCAL_DIFF_HIGH',
        `Différence calorique élevée: déclaré ${declared} vs Atwater ${calc.toFixed(1)} (Δ ${absDiff.toFixed(1)} / ${pctDiff.toFixed(1)}%)`,
        { resolutionStatus: res.status }
      );
    } else if (pctDiff >= 10) {
      const res = getResolutionState(food, 'KCAL_DIFF_MODERATE');
      push(
        alerts,
        'WARNING',
        'KCAL_DIFF_MODERATE',
        `Différence calorique modérée: déclaré ${declared} vs Atwater ${calc.toFixed(1)} (${pctDiff.toFixed(1)}%)`,
        { resolutionStatus: res.status }
      );
    }
  }

  if (portion.grams == null) push(alerts, 'WARNING', 'MISSING_GRAMS', 'Poids en grammes absent');

  if (portion.brandSpecific && !portion.brand) {
    push(alerts, 'WARNING', 'MISSING_BRAND', 'Marque nécessaire mais absente');
  }

  if (n.fiberG != null && n.carbsG != null && typeof n.fiberG === 'number' && typeof n.carbsG === 'number' && n.fiberG > n.carbsG) {
    push(alerts, 'WARNING', 'FIBER_GT_CARBS', 'Fibres supérieures aux glucides');
  }

  const fatSum = fatFromComponents(n);
  if (typeof n.fatG === 'number' && fatSum != null && fatSum > n.fatG + 0.05) {
    push(
      alerts,
      'WARNING',
      'FAT_COMPONENTS_EXCEED_TOTAL',
      `Somme sat+mono+poly (${fatSum}) > lipides totaux (${n.fatG})`
    );
  }

  if (food.displayCategory === 'autres_sources_proteinees') {
    if (!['protein', 'whey'].includes(food.calculationGroup)) {
      push(alerts, 'WARNING', 'AMBIGUOUS_GROUP', 'calculationGroup ambigu pour autres protéines');
    }
  }

  if (food.calculationGroup === 'whey' && (portion.grams == null || !portion.brand)) {
    push(
      alerts,
      'WARNING',
      'AMBIGUOUS_GROUP',
      'Protéine en poudre: précision grammes/marque insuffisante pour un calculateur fiable'
    );
  }

  const hay = `${food.id} ${names.fr} ${names.en} ${portion.labelFr} ${portion.labelEn}`;
  for (const sc of SUSPECT_CASES) {
    if (sc.match.test(hay) && matchesSuspectSignature(n, sc.signature, sc.tolerance)) {
      push(alerts, 'ERROR', 'SUSPECT_CASE', sc.reason, { suspectId: sc.id });
    }
  }

  // Whey mismatch stays a WARNING until calculator reconnect — never permanent ERROR by name alone
  if (/lactos[eé]rum|\bwhey\b/i.test(hay)) {
    push(
      alerts,
      'WARNING',
      'GUIDE_VS_CALCULATOR',
      `Whey: guide ${n.proteinG} g prot. / ${portion.labelFr} vs calculateur MOYENNES.whey 22 g prot. / scoop`
    );
  }

  const sourceResult = validateSource(food);
  for (const a of sourceResult.alerts) {
    // LEGACY_SOURCE_ONLY is warning; field-level source issues are errors
    alerts.push(a);
  }

  if (isVerifiedFood(food) && !sourceResult.authoritative) {
    if (!alerts.some((a) => a.code === 'INSUFFICIENT_SOURCE' && a.severity === 'ERROR')) {
      push(
        alerts,
        'ERROR',
        'INSUFFICIENT_SOURCE',
        'Source de validation insuffisante pour un aliment verified'
      );
    }
  }

  for (const err of collectVerificationIntegrityErrors(food)) {
    push(alerts, 'ERROR', err.code, err.message);
  }

  // History / resolution date integrity
  for (const entry of food.history || []) {
    const stamp = entry?.timestamp || entry?.at;
    if (stamp != null && stamp !== '' && !isValidIsoDateTime(stamp) && !isValidIsoDateOnly(stamp)) {
      push(
        alerts,
        'ERROR',
        'VERIFICATION_DATE_INVALID',
        `history timestamp/at invalide: ${stamp}`
      );
      break;
    }
  }

  if (isVerifiedFood(food)) {
    const eligibility = validateVerificationEligibility(
      food,
      { alerts },
      { sourceAuthoritative: sourceResult.authoritative }
    );
    if (!eligibility.ok) {
      push(
        alerts,
        'ERROR',
        'VERIFIED_WITH_OPEN_ERRORS',
        verifiedOpenErrorsMessage(food, eligibility)
      );
    }
  }

  const openErrors = alerts.filter(
    (a) => a.severity === 'ERROR' && a.resolutionStatus !== 'resolved_documented'
  );
  const errorCount = openErrors.length;
  const warningCount = alerts.filter((a) => a.severity === 'WARNING').length;
  const resolvedCount = alerts.filter((a) => a.resolutionStatus === 'resolved_documented').length;
  const maxSeverity = errorCount ? 'ERROR' : warningCount ? 'WARNING' : 'OK';

  return {
    id: food.id,
    displayCategory: food.displayCategory,
    calculationGroup: food.calculationGroup,
    exchangeProfileId: food.exchangeProfileId ?? null,
    classificationStatus: food.classificationStatus ?? 'pending',
    nameFr: names.fr,
    nameEn: names.en,
    status,
    portionLabelFr: portion.labelFr,
    portionLabelEn: portion.labelEn,
    amount: portion.amount,
    unit: portion.unit,
    grams: portion.grams,
    parsedFr: frCmp.parsed,
    parsedEn: enCmp.parsed,
    nutrients: n,
    declaredKcal: declared ?? null,
    calculatedKcal: calc,
    absDiff,
    pctDiff,
    alerts,
    errorCount,
    warningCount,
    resolvedCount,
    maxSeverity,
    canVerify: canMarkVerified(food, alerts),
  };
}

export function canMarkVerified(food, alerts = null) {
  const resultAlerts = alerts || auditFood(food).alerts;
  return validateVerificationEligibility(
    food,
    { alerts: resultAlerts },
    { sourceAuthoritative: validateSource(food).authoritative }
  ).ok;
}

export function auditDataset(foods) {
  const idCounts = new Map();
  for (const f of foods || []) idCounts.set(f.id, (idCounts.get(f.id) || 0) + 1);
  const items = (foods || []).map((f) => auditFood(f, idCounts));
  items.sort(
    (a, b) =>
      b.errorCount - a.errorCount ||
      b.warningCount - a.warningCount ||
      String(a.nameFr || '').localeCompare(String(b.nameFr || ''), 'fr')
  );

  const foodById = new Map((foods || []).map((f) => [f.id, f]));
  const blockingErrorCount = items.reduce((a, i) => a + i.errorCount, 0);
  const warningCount = items.reduce((a, i) => a + i.warningCount, 0);
  const foodsWithBlockingErrors = items.filter((i) => i.errorCount > 0).length;
  const foodsWithWarnings = items.filter((i) => i.warningCount > 0).length;
  const foodsWithWarningsOnly = items.filter((i) => i.errorCount === 0 && i.warningCount > 0).length;
  const auditCleanFoods = items.filter((i) => i.errorCount === 0 && i.warningCount === 0).length;

  const activeFoods = (foods || []).filter((f) => isActiveFood(f));
  const rejectedFoods = (foods || []).filter((f) => isRejectedFood(f));
  const verifiedFoods = (foods || []).filter((f) => isVerifiedFood(f)).length;
  const unverifiedFoods = (foods || []).filter((f) => getFoodStatus(f) === 'unverified').length;

  let structuralBlockingErrorCount = 0;
  let activeBlockingErrorCount = 0;
  let rejectedBlockingErrorCount = 0;
  let activeFoodsWithBlockingErrors = 0;
  let rejectedFoodsWithBlockingErrors = 0;

  for (const item of items) {
    const food = foodById.get(item.id);
    const rejected = food ? isRejectedFood(food) : false;
    const allErrors = item.alerts.filter(
      (a) => a.severity === 'ERROR' && a.resolutionStatus !== 'resolved_documented'
    );
    const structuralErrors = allErrors.filter((a) => STRUCTURAL_BLOCKING_CODES.has(a.code));
    structuralBlockingErrorCount += structuralErrors.length;

    if (rejected) {
      const nonStructural = allErrors.filter((a) => !STRUCTURAL_BLOCKING_CODES.has(a.code));
      rejectedBlockingErrorCount += nonStructural.length;
      if (allErrors.length > 0) rejectedFoodsWithBlockingErrors += 1;
      // structural on rejected still counts toward active-blocking gate via structuralBlockingErrorCount
      activeBlockingErrorCount += structuralErrors.length;
    } else {
      activeBlockingErrorCount += allErrors.length;
      if (allErrors.length > 0) activeFoodsWithBlockingErrors += 1;
    }
  }

  const alertCountsByCode = {};
  for (const item of items) {
    for (const a of item.alerts) {
      alertCountsByCode[a.code] = (alertCountsByCode[a.code] || 0) + 1;
    }
  }

  const byId = {};
  for (const item of items) {
    if (item.id) byId[item.id] = item;
  }

  return {
    summary: {
      totalFoods: (foods || []).length,
      activeFoods: activeFoods.length,
      rejectedFoods: rejectedFoods.length,
      verifiedFoods,
      unverifiedFoods,
      blockingErrorCount,
      activeBlockingErrorCount,
      rejectedBlockingErrorCount,
      structuralBlockingErrorCount,
      foodsWithBlockingErrors,
      activeFoodsWithBlockingErrors,
      rejectedFoodsWithBlockingErrors,
      warningCount,
      foodsWithWarnings,
      foodsWithWarningsOnly,
      auditCleanFoods,
      blockingErrors: blockingErrorCount,
      foodsWithErrors: foodsWithBlockingErrors,
      foodsOk: auditCleanFoods,
    },
    alertCountsByCode,
    items,
    byId,
  };
}
