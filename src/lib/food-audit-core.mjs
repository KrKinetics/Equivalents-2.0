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
import { comparePortions } from './legacy-portion-parser.mjs';

const SUSPECT_CASES = [
  {
    match: /poitrine de poulet|chicken breast/i,
    reason: 'Suspect: 48 kcal, 8 g protein, 7 g fat (Atwater ~99 kcal)',
  },
  {
    match: /blancs d['’]œuf|egg whites/i,
    reason: 'Suspect: 36 kcal, 2.5 g protein, 1 g carbs (protein unrealistically low)',
  },
  {
    match: /yogourt grec \(100 g\)|greek yogurt \(100 g\)|100 ml.*greek yogurt|100 ml de Yogourt grec/i,
    reason: 'Suspect: 67 kcal, 1 g protein, 3 g carbs, 0 g fat',
  },
  {
    match: /pomme de terre.*douce|sweet potato/i,
    reason: 'Suspect: 82 kcal, 3 g protein, 1 g carbs',
  },
  {
    match: /quinoa/i,
    reason: 'Suspect: 116 kcal, 8 g protein, 1 g carbs',
  },
  {
    match: /lactos[eé]rum|\bwhey\b/i,
    reason: 'Suspect: guide ½ scoop ≈ 9 g protein vs calculator 1 scoop = 22 g protein',
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

function isResolved(food, code) {
  const list = food.auditResolutions || [];
  return list.some(
    (r) =>
      r &&
      r.code === code &&
      r.reason &&
      r.approvedBy &&
      r.approvedAt &&
      r.sourceReferenceId
  );
}

function hasAuthoritativeSource(food) {
  const s = food.source || {};
  if (!s.type || !SOURCE_TYPES.includes(s.type)) return false;
  if (!s.name) return false;
  if (s.type === 'manufacturer_label') {
    return !!(s.brand || food.portion?.brand) && !!(s.servingDescription || food.portion?.labelFr);
  }
  return true;
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
  const verification = food.verification || {};

  if (!food.id) push(alerts, 'ERROR', 'MISSING_ID', 'Identifiant manquant');
  if ((idCounts.get(food.id) || 0) > 1) {
    push(alerts, 'ERROR', 'DUPLICATE_ID', `Identifiant dupliqué: ${food.id}`);
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

  const status = food.status || verification.status;
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

  const portionDiffs = comparePortions(portion);
  if (portionDiffs.length) {
    push(
      alerts,
      'WARNING',
      'PORTION_FR_EN_DIFF',
      `Portion différente FR/EN: ${portionDiffs.map((d) => `${d.field}(${d.fr}≠${d.en})`).join(', ')}`
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
      const resolved = isResolved(food, 'KCAL_DIFF_HIGH');
      push(
        alerts,
        'ERROR',
        'KCAL_DIFF_HIGH',
        `Différence calorique élevée: déclaré ${declared} vs Atwater ${calc.toFixed(1)} (Δ ${absDiff.toFixed(1)} / ${pctDiff.toFixed(1)}%)`,
        { resolutionStatus: resolved ? 'resolved_documented' : 'open' }
      );
    } else if (pctDiff >= 10) {
      const resolved = isResolved(food, 'KCAL_DIFF_MODERATE');
      push(
        alerts,
        'WARNING',
        'KCAL_DIFF_MODERATE',
        `Différence calorique modérée: déclaré ${declared} vs Atwater ${calc.toFixed(1)} (${pctDiff.toFixed(1)}%)`,
        { resolutionStatus: resolved ? 'resolved_documented' : 'open' }
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
    if (sc.match.test(hay)) {
      push(alerts, 'ERROR', 'SUSPECT_CASE', sc.reason);
    }
  }

  if (/lactos[eé]rum|\bwhey\b/i.test(hay)) {
    push(
      alerts,
      'WARNING',
      'GUIDE_VS_CALCULATOR',
      `Whey: guide ${n.proteinG} g prot. / ${portion.labelFr} vs calculateur MOYENNES.whey 22 g prot. / scoop`
    );
  }

  // Validation source rules (blocking for verified pathway)
  const legacyOnly = !hasAuthoritativeSource(food);
  if (legacyOnly) {
    push(
      alerts,
      'WARNING',
      'LEGACY_SOURCE_ONLY',
      'Seule la source legacy du guide est présente — insuffisante pour verified'
    );
  }

  if ((status === 'verified' || verification.status === 'verified') && legacyOnly) {
    push(
      alerts,
      'ERROR',
      'INSUFFICIENT_SOURCE',
      'Source de validation insuffisante (legacy ne suffit pas / source.type requis)'
    );
  }

  const openErrors = alerts.filter((a) => a.severity === 'ERROR' && a.resolutionStatus !== 'resolved_documented');
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
    status: status || 'unverified',
    portionLabelFr: portion.labelFr,
    portionLabelEn: portion.labelEn,
    amount: portion.amount,
    unit: portion.unit,
    grams: portion.grams,
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
  const portion = food.portion || {};
  const names = food.names || {};
  if (!names.fr || !names.en) return false;
  if (!portion.labelFr || !portion.labelEn || portion.amount == null || !portion.unit) return false;
  if (food.nutrients?.fatG == null) return false;
  const source = food.source || {};
  if (!source.accessedAt && !food.verification?.verifiedAt) {
    // accessedAt recommended; require name+type already checked in hasAuthoritativeSource
  }
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
  const foodsWithWarnings = items.filter((i) => i.errorCount === 0 && i.warningCount > 0).length;
  const auditCleanFoods = items.filter((i) => i.maxSeverity === 'OK').length;
  const verifiedFoods = (foods || []).filter(
    (f) => f.status === 'verified' || f.verification?.status === 'verified'
  ).length;

  const alertCountsByCode = {};
  for (const item of items) {
    for (const a of item.alerts) {
      alertCountsByCode[a.code] = (alertCountsByCode[a.code] || 0) + 1;
    }
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
      auditCleanFoods,
      // aliases kept for transition clarity
      blockingErrors: blockingErrorCount,
      foodsWithErrors: foodsWithBlockingErrors,
      foodsWithWarningsOnly: foodsWithWarnings,
      foodsOk: auditCleanFoods,
    },
    alertCountsByCode,
    items,
  };
}

export { SUSPECT_CASES, hasAuthoritativeSource };
