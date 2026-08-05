/**
 * Server portions / averages — wraps pure engine.
 * Returns computed results; does not expose formula source code.
 */

import {
  MOYENNES,
  computeBanqueTotals,
  suggestBanque,
  scorePortions,
  distribuerPortions,
  computePlannedTotalsFromRepartition,
  reconcilePlanTotals,
  getPortionTotals,
  roundHalf,
} from '../../../lib/coach-calculator-engine.mjs';

/**
 * @param {{
 *   action: 'moyennes'|'banque_totals'|'suggest'|'score'|'distribute'|'planned_totals'|'reconcile'|'portion_totals',
 *   banque?: object,
 *   targets?: object,
 *   portions?: object,
 *   total?: number,
 *   weights?: number[],
 *   repartition?: unknown,
 *   reconcileInput?: object,
 * }} input
 */
export function calculatePortions(input) {
  const action = String(input?.action || '').trim();

  switch (action) {
    case 'moyennes':
      // Category averages required by the UI for per-row display labels.
      // Values are the same public MOYENNES table used historically in the calculator.
      return { moyennes: { ...MOYENNES } };

    case 'banque_totals':
      return { totals: computeBanqueTotals(input.banque || {}) };

    case 'suggest': {
      const banque = suggestBanque(input.targets || {});
      return {
        banque,
        score: banque ? scorePortions(banque, input.targets || {}) : null,
      };
    }

    case 'score':
      return { score: scorePortions(input.portions || {}, input.targets || {}) };

    case 'distribute': {
      const portions = distribuerPortions(input.total, input.weights || []);
      return {
        portions,
        sum: portions.reduce((a, b) => a + b, 0),
      };
    }

    case 'planned_totals':
      return { totals: computePlannedTotalsFromRepartition(input.repartition) };

    case 'reconcile':
      return { reconcile: reconcilePlanTotals(input.reconcileInput || input) };

    case 'portion_totals':
      return { totals: getPortionTotals(input.portions || {}) };

    default:
      return { error: 'bad_request' };
  }
}

export {
  MOYENNES,
  computeBanqueTotals,
  suggestBanque,
  scorePortions,
  distribuerPortions,
  computePlannedTotalsFromRepartition,
  reconcilePlanTotals,
  getPortionTotals,
  roundHalf,
};
