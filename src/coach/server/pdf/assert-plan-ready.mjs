/**
 * Validate the minimum state required to render a useful plan PDF.
 * Partial meal distributions are intentional coach workflow and are allowed.
 */

import {
  computeBanqueTotals,
  computePlannedTotalsFromRepartition,
  isJourClientPlanConfigured,
} from '../../../lib/coach-calculator-engine.mjs';

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function assertConfiguredDayCoherent(day) {
  const plannedTotals = computePlannedTotalsFromRepartition(day?.repartition);
  const banqueTotals = computeBanqueTotals(day?.banque || {});

  if (banqueTotals.kcal > 0 && plannedTotals.kcal <= 0) {
    return { ok: false, status: 422, error: 'inconsistent_plan' };
  }
  if (
    Object.values(day?.banque || {}).some((v) => number(v) > 0)
    && !Object.values(plannedTotals).some((v) => number(v) > 0)
  ) {
    return { ok: false, status: 422, error: 'inconsistent_plan' };
  }
  return { ok: true };
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

  // A PDF still needs at least one real meal line. Once that minimum exists,
  // missing categories/portions are accepted because coaches adjust plans live.
  if (!isJourClientPlanConfigured(training)) {
    return { ok: false, status: 409, error: 'plan_not_ready' };
  }

  const trainingCoherence = assertConfiguredDayCoherent(training);
  if (!trainingCoherence.ok) return trainingCoherence;

  // Rest day is optional/in-progress. If it has portions, validate them; if it
  // is empty, never block export of the valid training day.
  if (payload?.include_rest && payload?.rest && isJourClientPlanConfigured(payload.rest)) {
    const restCoherence = assertConfiguredDayCoherent(payload.rest);
    if (!restCoherence.ok) return restCoherence;
  }

  return { ok: true };
}
