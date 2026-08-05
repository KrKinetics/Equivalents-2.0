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
  macroPercentagesFromGrams,
  kcalFromMacros,
  buildAutoRepartition,
} from '../../../lib/coach-calculator-engine.mjs';

function withPercentages(totals) {
  const t = totals || { pro: 0, glu: 0, lip: 0, kcal: 0 };
  const percentages = macroPercentagesFromGrams(t.pro || 0, t.glu || 0, t.lip || 0);
  return { totals: t, percentages };
}

/**
 * @param {{
 *   action: 'moyennes'|'banque_totals'|'suggest'|'score'|'distribute'|'planned_totals'|'reconcile'|'portion_totals'|'macro_percentages'|'auto_repartition',
 *   banque?: object,
 *   targets?: object,
 *   portions?: object,
 *   total?: number,
 *   weights?: number[],
 *   repartition?: unknown,
 *   reconcileInput?: object,
 *   mode?: string,
 *   heureEntrainement?: string|null,
 *   pro?: number,
 *   glu?: number,
 *   lip?: number,
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
      return withPercentages(computeBanqueTotals(input.banque || {}));

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

    case 'auto_repartition': {
      const built = buildAutoRepartition({
        banque: input.banque || {},
        mode: input.mode || 'classique',
        heureEntrainement: input.heureEntrainement,
      });
      if (!built) return { error: 'bad_request' };
      const planned = withPercentages(computePlannedTotalsFromRepartition(built.repartition));
      const banqueTotals = withPercentages(computeBanqueTotals(input.banque || {}));
      return {
        repartition: built.repartition,
        mode: built.mode,
        plannedTotals: planned.totals,
        percentages: planned.percentages,
        banqueTotals: banqueTotals.totals,
      };
    }

    case 'planned_totals':
      return withPercentages(computePlannedTotalsFromRepartition(input.repartition));

    case 'macro_percentages': {
      const pro = Number(input?.pro) || 0;
      const glu = Number(input?.glu) || 0;
      const lip = Number(input?.lip) || 0;
      return {
        percentages: macroPercentagesFromGrams(pro, glu, lip),
        kcal: kcalFromMacros(pro, glu, lip),
      };
    }

    case 'reconcile':
      return { reconcile: reconcilePlanTotals(input.reconcileInput || input) };

    case 'portion_totals':
      return withPercentages(getPortionTotals(input.portions || {}));

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
  buildAutoRepartition,
};
