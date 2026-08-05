/**
 * Refuse PDFs that look valid but carry an empty/inconsistent calculated plan.
 */

import {
  computeBanqueTotals,
  computePlannedTotalsFromRepartition,
  evaluatePlanCompleteness,
  isJourClientPlanConfigured,
} from '../../../lib/coach-calculator-engine.mjs';

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function dayHasPositiveBanque(day) {
  const banque = day?.banque || {};
  return Object.values(banque).some((v) => number(v) > 0);
}

function dayHasPositiveTargets(targets) {
  return number(targets?.kcal) > 0;
}

/**
 * @param {{
 *   training: object,
 *   rest?: object|null,
 *   include_rest?: boolean,
 * }} payload
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function assertPlanReadyForPdf(payload) {
  const training = payload?.training;
  if (!training || typeof training !== 'object') {
    return { ok: false, status: 422, error: 'inconsistent_plan' };
  }

  const trainingTargets = training.targets || {};
  const trainingConfigured = isJourClientPlanConfigured(training);
  const trainingBanque = dayHasPositiveBanque(training);
  const trainingTargetsOk = dayHasPositiveTargets(trainingTargets);

  // PDF requires a distributed meal plan — never render an empty "valid" PDF.
  if (!trainingConfigured) {
    return { ok: false, status: 409, error: 'plan_not_ready' };
  }

  if (trainingConfigured) {
    const banqueTotals = computeBanqueTotals(training.banque || {});
    const plannedTotals = computePlannedTotalsFromRepartition(training.repartition);
    if (banqueTotals.kcal > 0 && plannedTotals.kcal <= 0) {
      return { ok: false, status: 422, error: 'inconsistent_plan' };
    }
    if (
      Object.values(training.banque || {}).some((v) => number(v) > 0)
      && !Object.values(plannedTotals).some((v) => number(v) > 0)
    ) {
      return { ok: false, status: 422, error: 'inconsistent_plan' };
    }
    const completeness = evaluatePlanCompleteness({
      jourData: training,
      targets: trainingTargets,
      targetsReady: trainingTargetsOk,
    });
    // Soft: allow export with banque/target warnings, but not empty meals.
    if (!completeness.canExport && completeness.errors.some((e) => /Répartition|Repas/i.test(e))) {
      return { ok: false, status: 409, error: 'plan_not_ready' };
    }
  }

  if (payload?.include_rest && payload?.rest) {
    const rest = payload.rest;
    const restConfigured = isJourClientPlanConfigured(rest);
    const restBanque = dayHasPositiveBanque(rest);
    const restTargetsOk = dayHasPositiveTargets(rest.targets || {});
    if ((restBanque || restTargetsOk) && !restConfigured) {
      return { ok: false, status: 409, error: 'plan_not_ready' };
    }
    if (restConfigured) {
      const plannedTotals = computePlannedTotalsFromRepartition(rest.repartition);
      const banqueTotals = computeBanqueTotals(rest.banque || {});
      if (banqueTotals.kcal > 0 && plannedTotals.kcal <= 0) {
        return { ok: false, status: 422, error: 'inconsistent_plan' };
      }
    }
  }

  return { ok: true };
}
