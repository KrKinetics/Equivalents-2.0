/**
 * Pure Coach plan contracts: banque/meal totals, completeness, reconciliation.
 * No DOM, storage, filesystem, or PDF side effects.
 */

import { CATS, MEAL_COUNT } from './plan-structure.mjs';
import { createEmptyJourData } from './clients.mjs';
import { kcalFromMacros } from '../calculations/macros.mjs';

/** Legacy calculator category averages (unchanged values). */
export const MOYENNES = {
  pro: { p: 9, g: 0, l: 2 },
  fec: { p: 3, g: 18, l: 1 },
  leg: { p: 2, g: 7, l: 0 },
  fru: { p: 1, g: 15, l: 2 },
  lai: { p: 7, g: 10, l: 2 },
  lip: { p: 1, g: 2, l: 6 },
  whey: { p: 22, g: 2, l: 2 },
};

/** Explicit client-PDF variance thresholds (planned vs target). */
export const PDF_VARIANCE_THRESHOLDS = Object.freeze({
  kcal: 50,
  pro: 5,
  glu: 5,
  lip: 5,
});

export function getPortionTotals(portions) {
  let pro = 0;
  let glu = 0;
  let lip = 0;
  for (const cat of CATS) {
    const v = portions[cat] || 0;
    pro += v * MOYENNES[cat].p;
    glu += v * MOYENNES[cat].g;
    lip += v * MOYENNES[cat].l;
  }
  return { pro, glu, lip, kcal: kcalFromMacros(pro, glu, lip) };
}

export function computeBanqueTotals(banque) {
  let pro = 0;
  let glu = 0;
  let lip = 0;
  for (const cat of CATS) {
    const val = parseFloat(banque?.[cat]) || 0;
    pro += val * MOYENNES[cat].p;
    glu += val * MOYENNES[cat].g;
    lip += val * MOYENNES[cat].l;
  }
  pro = Math.round(pro);
  glu = Math.round(glu);
  lip = Math.round(lip);
  return { pro, glu, lip, kcal: kcalFromMacros(pro, glu, lip) };
}

function getRepValueFromData(repartition, mealIdx, cat) {
  const idx = mealIdx * CATS.length + CATS.indexOf(cat);
  return parseFloat(repartition?.[idx]) || 0;
}

export function evaluatePlanCompleteness({ jourData, targets, targetsReady = true }) {
  const errors = [];
  const warnings = [];
  const data = jourData || createEmptyJourData();
  const t = targets || { kcal: 0, pro: 0, glu: 0, lip: 0 };

  if (!targetsReady || t.kcal === 0) errors.push('Profil incomplet (cibles).');

  let banqueTotal = 0;
  for (const cat of CATS) banqueTotal += parseFloat(data.banque?.[cat]) || 0;
  if (banqueTotal === 0) errors.push('Banque vide.');

  const banqueTotals = computeBanqueTotals(data.banque);
  if (t.kcal > 0 && banqueTotal > 0) {
    const ecartKcal = banqueTotals.kcal - t.kcal;
    const ecartPro = banqueTotals.pro - t.pro;
    const ecartGlu = banqueTotals.glu - t.glu;
    const ecartLip = banqueTotals.lip - t.lip;
    if (Math.abs(ecartKcal) > 50 || Math.abs(ecartPro) > 5 || Math.abs(ecartGlu) > 5 || Math.abs(ecartLip) > 5) {
      warnings.push('Écart banque/cibles.');
    }
  }

  const restants = [];
  for (const cat of CATS) {
    const cible = parseFloat(data.banque?.[cat]) || 0;
    let sum = 0;
    for (let m = 0; m < MEAL_COUNT; m++) sum += getRepValueFromData(data.repartition, m, cat);
    const rest = Math.round((cible - sum) * 10) / 10;
    if (cible > 0 && rest !== 0) restants.push(cat);
  }
  if (restants.length) errors.push(`Répartition incomplète (${restants.join(', ')}).`);

  let hasMealFood = false;
  for (let i = 0; i < MEAL_COUNT * CATS.length; i++) {
    if ((parseFloat(data.repartition?.[i]) || 0) > 0) hasMealFood = true;
  }
  if (banqueTotal > 0 && !hasMealFood) errors.push('Repas non distribués.');

  return {
    errors,
    warnings,
    canExport: errors.length === 0 && hasMealFood && banqueTotal > 0,
  };
}

/**
 * A day is "configured" for the client PDF only when meal distribution
 * contains at least one non-zero portion (banque alone is not enough).
 */
export function isJourClientPlanConfigured(jourData) {
  const data = jourData || createEmptyJourData();
  for (let i = 0; i < MEAL_COUNT * CATS.length; i += 1) {
    if ((parseFloat(data.repartition?.[i]) || 0) > 0) return true;
  }
  return false;
}

/**
 * Planned totals from meal distribution, mirroring getJourSnapshot rounding:
 * each meal rounds P/G/L before summing, then kcal is derived from the sums.
 * This is the documented source of banque vs planned divergence.
 */
export function computePlannedTotalsFromRepartition(repartition) {
  let totalPro = 0;
  let totalGlu = 0;
  let totalLip = 0;
  for (let i = 0; i < MEAL_COUNT; i += 1) {
    let rPro = 0;
    let rGlu = 0;
    let rLip = 0;
    for (const cat of CATS) {
      const val = getRepValueFromData(repartition, i, cat);
      rPro += val * MOYENNES[cat].p;
      rGlu += val * MOYENNES[cat].g;
      rLip += val * MOYENNES[cat].l;
    }
    const rKcal = kcalFromMacros(rPro, rGlu, rLip);
    if (rKcal > 0) {
      totalPro += Math.round(rPro);
      totalGlu += Math.round(rGlu);
      totalLip += Math.round(rLip);
    }
  }
  return {
    pro: totalPro,
    glu: totalGlu,
    lip: totalLip,
    kcal: kcalFromMacros(totalPro, totalGlu, totalLip),
  };
}

function deltaMacros(a, b) {
  return {
    kcal: (a?.kcal || 0) - (b?.kcal || 0),
    pro: (a?.pro || 0) - (b?.pro || 0),
    glu: (a?.glu || 0) - (b?.glu || 0),
    lip: (a?.lip || 0) - (b?.lip || 0),
  };
}

function withinVarianceThresholds(delta, thresholds = PDF_VARIANCE_THRESHOLDS) {
  return (
    Math.abs(delta.kcal) <= thresholds.kcal
    && Math.abs(delta.pro) <= thresholds.pro
    && Math.abs(delta.glu) <= thresholds.glu
    && Math.abs(delta.lip) <= thresholds.lip
  );
}

/**
 * Reconcile target / banque / planned totals for client PDF display.
 * Origin of differences:
 * - target: macro formula (rounded grams → kcal)
 * - banque: portions × MOYENNES, macros rounded once, then kcal
 * - planned: per-meal macros rounded then summed (can differ from banque)
 */
export function reconcilePlanTotals({ targets, banqueTotals, plannedTotals, thresholds = PDF_VARIANCE_THRESHOLDS }) {
  const target = {
    kcal: targets?.kcal || 0,
    pro: targets?.pro || 0,
    glu: targets?.glu || 0,
    lip: targets?.lip || 0,
  };
  const banque = {
    kcal: banqueTotals?.kcal || 0,
    pro: banqueTotals?.pro || 0,
    glu: banqueTotals?.glu || 0,
    lip: banqueTotals?.lip || 0,
  };
  const planned = {
    kcal: plannedTotals?.kcal || 0,
    pro: plannedTotals?.pro || 0,
    glu: plannedTotals?.glu || 0,
    lip: plannedTotals?.lip || 0,
  };
  const varianceVsTarget = deltaMacros(planned, target);
  const banqueVsTarget = deltaMacros(banque, target);
  const plannedVsBanque = deltaMacros(planned, banque);
  return {
    target,
    banque,
    planned,
    varianceVsTarget,
    banqueVsTarget,
    plannedVsBanque,
    thresholds: { ...thresholds },
    withinThreshold: withinVarianceThresholds(varianceVsTarget, thresholds),
    origin:
      'Cible = formule macro; banque = portions × moyennes (arrondi global); '
      + 'planifié = arrondi P/G/L par repas puis somme (source de l’écart banque/planifié).',
  };
}
