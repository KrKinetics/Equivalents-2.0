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
import { getFoodStatus, hasStatusMismatch, isVerifiedFood } from './food-status.mjs';

export const RESOLVABLE_CODES = new Set([
  'KCAL_DIFF_HIGH',
  'KCAL_DIFF_MODERATE',
  'PORTION_LABEL_MISMATCH_FR',
  'PORTION_LABEL_MISMATCH_EN',
]);

export const NON_RESOLVABLE_CODES = new Set([
  'MISSING_REQUIRED',
  'NEGATIVE_VALUE',
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
  if ([p, c, f].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  return Number(p) * 4 + Number(c) * 4 + Number(f) * 9;
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

export function getResolutionState(food, code) {
  const list = food.auditResolutions || [];
  const match = [...list].reverse().find((r) => r && r.code === code);
  if (!match) return { status: 'open', resolution: null };
  if (!match.reason || !match.approvedBy || !match.approvedAt || !match.sourceReferenceId) {
    return { status: 'open', resolution: match };
  }
  const expected = resolutionSnapshotHash(code, food);
  if (match.fieldsHash && match.fieldsHash !== expected) {
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
 * type+name alone is NEVER enough.
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

  switch (s.type) {
    case 'canadian_nutrient_file':
    case 'usda_fooddata_central':
      need(!!s.name, 'INSUFFICIENT_SOURCE', 'source.name requis');
      need(!!s.recordId, 'SOURCE_RECORD_ID_MISSING', 'source.recordId requis');
      need(!!s.accessedAt, 'SOURCE_ACCESS_DATE_MISSING', 'source.accessedAt requis');
      need(!!s.servingDescription, 'SOURCE_SERVING_MISSING', 'source.servingDescription requis');
      need(!!s.nutrientsBasis, 'SOURCE_BASIS_MISSING', 'source.nutrientsBasis requis');
      break;
    case 'manufacturer_label': {
      const brand = s.brand || food.portion?.brand;
      need(!!brand, 'INSUFFICIENT_SOURCE', 'brand requis pour manufacturer_label');
      need(!!s.productName, 'INSUFFICIENT_SOURCE', 'productName requis');
      need(!!s.labelServingSize, 'SOURCE_SERVING_MISSING', 'labelServingSize requis');
      need(!!s.accessedAt, 'SOURCE_ACCESS_DATE_MISSING', 'accessedAt requis');
      need(!!s.evidenceRef, 'SOURCE_EVIDENCE_MISSING', 'evidenceRef requis');
      need(!!s.servingDescription, 'SOURCE_SERVING_MISSING', 'servingDescription requis');
      break;
    }
    case 'manufacturer_website':
      need(!!(s.brand || s.productName), 'INSUFFICIENT_SOURCE', 'brand ou productName requis');
      need(!!s.url, 'SOURCE_URL_OR_RECORD_MISSING', 'url requis');
      need(!!s.accessedAt, 'SOURCE_ACCESS_DATE_MISSING', 'accessedAt requis');
      need(!!s.servingDescription, 'SOURCE_SERVING_MISSING', 'servingDescription requis');
      break;
    case 'peer_reviewed_reference':
      need(!!s.name, 'INSUFFICIENT_SOURCE', 'source.name requis');
      need(!!(s.recordId || s.url || s.doi), 'SOURCE_URL_OR_RECORD_MISSING', 'recordId, DOI ou URL requis');
      need(!!s.accessedAt, 'SOURCE_ACCESS_DATE_MISSING', 'accessedAt requis');
      need(!!s.servingDescription, 'SOURCE_SERVING_MISSING', 'servingDescription requis');
      break;
    case 'other_authoritative':
      need(!!s.name, 'INSUFFICIENT_SOURCE', 'source.name requis');
      need(!!(s.url || s.recordId), 'SOURCE_URL_OR_RECORD_MISSING', 'URL ou recordId requis');
      need(!!s.accessedAt, 'SOURCE_ACCESS_DATE_MISSING', 'accessedAt requis');
      need(!!s.notes, 'INSUFFICIENT_SOURCE', 'notes justifiant le caractère authoritative requises');
      break;
    default:
      push(alerts, 'ERROR', 'INSUFFICIENT_SOURCE', `Type de source inconnu: ${s.type}`);
  }

  // type+name only is never enough: if no other field filled beyond type/name, block
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

  const openErrors = alerts.filter((a) => a.severity === 'ERROR');
  return { ok: openErrors.length === 0, alerts, authoritative: openErrors.length === 0 };
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

  if (portion.amount == null || !(Number(portion.amount) > 0)) {
    push(alerts, 'ERROR', 'MISSING_AMOUNT_UNIT', 'Quantité absente ou non positive');
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

  for (const [key, label] of [
    ['proteinG', 'protéines'],
    ['carbsG', 'glucides'],
    ['declaredKcal', 'calories déclarées'],
  ]) {
    if (n[key] == null) push(alerts, 'ERROR', 'MISSING_REQUIRED', `${label} manquante(s)`);
    else if (Number(n[key]) < 0) push(alerts, 'ERROR', 'NEGATIVE_VALUE', `${label} négative(s)`);
  }

  if (n.fatG == null) push(alerts, 'ERROR', 'MISSING_TOTAL_FAT', 'Lipides totaux absents');
  else if (Number(n.fatG) < 0) push(alerts, 'ERROR', 'NEGATIVE_VALUE', 'Lipides totaux négatifs');

  if (n.fiberG != null && Number(n.fiberG) < 0) {
    push(alerts, 'ERROR', 'NEGATIVE_VALUE', 'Fibres négatives');
  }
  if (portion.grams != null && Number(portion.grams) < 0) {
    push(alerts, 'ERROR', 'NEGATIVE_VALUE', 'Grammes négatifs');
  }

  if (String(portion.unit).toLowerCase() === 'scoop' && (portion.grams == null || !Number.isFinite(Number(portion.grams)))) {
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
  const declared = n.declaredKcal;
  let absDiff = null;
  let pctDiff = null;
  if (calc != null && declared != null) {
    absDiff = Math.abs(Number(declared) - calc);
    pctDiff = calc === 0 ? (Number(declared) === 0 ? 0 : 100) : (absDiff / Math.abs(calc)) * 100;
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

  if (n.fiberG != null && n.carbsG != null && Number(n.fiberG) > Number(n.carbsG)) {
    push(alerts, 'WARNING', 'FIBER_GT_CARBS', 'Fibres supérieures aux glucides');
  }

  const fatSum = fatFromComponents(n);
  if (n.fatG != null && fatSum != null && fatSum > Number(n.fatG) + 0.05) {
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
  const openBlocking = resultAlerts.some(
    (a) => a.severity === 'ERROR' && a.resolutionStatus !== 'resolved_documented'
  );
  if (openBlocking) return false;
  if (!hasAuthoritativeSource(food)) return false;
  if (hasStatusMismatch(food)) return false;
  const portion = food.portion || {};
  const names = food.names || {};
  if (!names.fr || !names.en) return false;
  if (!portion.labelFr || !portion.labelEn || portion.amount == null || !portion.unit) return false;
  if (food.nutrients?.fatG == null) return false;
  return true;
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

  const blockingErrorCount = items.reduce((a, i) => a + i.errorCount, 0);
  const warningCount = items.reduce((a, i) => a + i.warningCount, 0);
  const foodsWithBlockingErrors = items.filter((i) => i.errorCount > 0).length;
  // ALL foods with at least one warning (whether or not they also have errors)
  const foodsWithWarnings = items.filter((i) => i.warningCount > 0).length;
  const foodsWithWarningsOnly = items.filter((i) => i.errorCount === 0 && i.warningCount > 0).length;
  const auditCleanFoods = items.filter((i) => i.errorCount === 0 && i.warningCount === 0).length;
  const verifiedFoods = (foods || []).filter((f) => isVerifiedFood(f)).length;

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
      verifiedFoods,
      unverifiedFoods: (foods || []).length - verifiedFoods,
      blockingErrorCount,
      foodsWithBlockingErrors,
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
