/**
 * Bridge: exchangeProfileId → exchangeRollupId → calculator group.
 * Uses the merged proposal exactly; never writes production approvals.
 */

import { roundHalfAwayFromZero } from './descriptive-stats.mjs';
import { FORBIDDEN_MERGES } from './exchange-rollup-proposal.mjs';
import { loadLegacyReferences } from './exchange-profile-analysis.mjs';

export const ROUNDING_POLICY = Object.freeze({
  proteinG: 1,
  fatG: 1,
  fiberG: 1,
  carbsG: 0,
  declaredKcal: 0,
  method: 'roundHalfAwayFromZero',
});

export const NUTRIENT_KEYS = Object.freeze(['proteinG', 'carbsG', 'fiberG', 'fatG', 'declaredKcal']);

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function roundPreviewNutrients(profile) {
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const value = profile?.[key];
    if (value == null) {
      out[key] = null;
      continue;
    }
    if (!isNumber(value)) {
      out[key] = null;
      continue;
    }
    const decimals = ROUNDING_POLICY[key] ?? 0;
    out[key] = roundHalfAwayFromZero(value, decimals);
  }
  return out;
}

/**
 * Build lookup indexes from the authoritative rollup proposal JSON.
 */
export function buildRollupIndex(proposal) {
  if (!proposal?.assignments || !proposal?.rollups) {
    throw new Error('Invalid exchange-rollup-proposal: missing assignments/rollups');
  }
  const byFoodId = new Map();
  const byRollupId = new Map();
  const foodsPerRollup = new Map();

  for (const rollup of proposal.rollups) {
    byRollupId.set(rollup.exchangeRollupId, rollup);
    foodsPerRollup.set(rollup.exchangeRollupId, []);
  }
  for (const row of proposal.assignments) {
    if (byFoodId.has(row.foodId)) {
      throw new Error(`Duplicate rollup assignment for foodId ${row.foodId}`);
    }
    byFoodId.set(row.foodId, row);
    const list = foodsPerRollup.get(row.exchangeRollupId);
    if (!list) throw new Error(`Assignment references unknown rollup ${row.exchangeRollupId}`);
    list.push(row.foodId);
  }

  return {
    proposal,
    byFoodId,
    byRollupId,
    foodsPerRollup,
    meta: proposal.meta,
    forbiddenMerges: proposal.forbiddenMerges || FORBIDDEN_MERGES,
  };
}

export function resolveFoodAssignment(foodId, index) {
  const row = index.byFoodId.get(foodId);
  if (!row) throw new Error(`No rollup assignment for foodId ${foodId}`);
  return row;
}

export function getRollup(exchangeRollupId, index) {
  const rollup = index.byRollupId.get(exchangeRollupId);
  if (!rollup) throw new Error(`Unknown exchangeRollupId ${exchangeRollupId}`);
  return rollup;
}

/**
 * Dominant stable rollup for a calculator group (largest foodCount, stable only).
 * Used when hybrid mode receives a coarse group slot without a food/rollup pick.
 */
export function dominantStableRollupForGroup(calculatorGroup, index) {
  const candidates = [...index.byRollupId.values()]
    .filter((rollup) => rollup.calculatorBridge?.calculatorGroup === calculatorGroup)
    .filter((rollup) => rollup.insufficientSample !== true && (rollup.foodCount ?? 0) >= 3)
    .sort((a, b) => (b.foodCount - a.foodCount)
      || String(a.exchangeRollupId).localeCompare(String(b.exchangeRollupId)));
  return candidates[0] || null;
}

export function getRollupPreviewValue(rollup, { actionable = false } = {}) {
  const rounded = roundPreviewNutrients(rollup.medianProfile || {});
  const insufficient = rollup.insufficientSample === true || (rollup.foodCount ?? 0) < 3;
  const status = insufficient ? 'insufficient_sample_provisional' : 'stable_provisional';
  const warnings = [];
  if (insufficient) {
    warnings.push({
      code: 'insufficient_sample',
      messageFr: 'Échantillon insuffisant — valeur provisoire',
      messageEn: 'Insufficient sample — provisional value',
    });
  } else {
    warnings.push({
      code: 'provisional_unapproved',
      messageFr: 'Valeurs provisoires non approuvées',
      messageEn: 'Provisional values not approved',
    });
  }

  let fallbackToLegacy = false;
  if (insufficient && actionable) {
    fallbackToLegacy = true;
    warnings.push({
      code: 'actionable_fallback_legacy_a',
      messageFr: 'Plan exploitable : retour explicite aux règles actuelles (mode A) car l’échantillon est insuffisant.',
      messageEn: 'Actionable plan: explicit fallback to current rules (mode A) because the sample is insufficient.',
    });
  }

  return {
    exchangeRollupId: rollup.exchangeRollupId,
    calculatorGroup: rollup.calculatorBridge?.calculatorGroup ?? null,
    nutrients: rounded,
    insufficientSample: insufficient,
    status,
    approved: false,
    fallbackToLegacy,
    warnings,
  };
}

export function assertUniqueFullCoverage(index, expectedFoodCount = 287, expectedRollupCount = 28) {
  const foodIds = [...index.byFoodId.keys()];
  if (foodIds.length !== expectedFoodCount) {
    throw new Error(`Expected ${expectedFoodCount} assignments, found ${foodIds.length}`);
  }
  if (index.byRollupId.size !== expectedRollupCount) {
    throw new Error(`Expected ${expectedRollupCount} rollups, found ${index.byRollupId.size}`);
  }
  const unique = new Set(foodIds);
  if (unique.size !== foodIds.length) {
    throw new Error('Duplicate food assignments detected');
  }
  return true;
}

export function assertMandatorySpecialCases(index) {
  const cases = [];
  const core = index.byFoodId.get('produits-laitiers-bottle-core-power-fairlife');
  cases.push({
    id: 'core-power-26',
    pass: core?.exchangeRollupId === 'rollup-dairy-protein-rtd'
      && core?.exchangeProfileId === 'dairy-protein-shake-core-power-26',
    detail: core,
  });

  const wheyFoods = [...index.byFoodId.values()].filter((row) => String(row.exchangeProfileId).startsWith('protein-whey-'));
  cases.push({
    id: 'whey-to-whey-powders',
    pass: wheyFoods.length > 0 && wheyFoods.every((row) => row.exchangeRollupId === 'rollup-whey-powders'),
    detail: { count: wheyFoods.length },
  });
  const wheyRollup = index.byRollupId.get('rollup-whey-powders');
  cases.push({
    id: 'whey-bridge-group',
    pass: wheyRollup?.calculatorBridge?.calculatorGroup === 'whey',
    detail: wheyRollup?.calculatorBridge,
  });

  const barley = index.byFoodId.get('feculents-cooked-barley');
  cases.push({
    id: 'barley-not-protein-bars',
    pass: barley?.exchangeRollupId === 'rollup-starch-cereal'
      && barley?.exchangeRollupId !== 'rollup-protein-bars',
    detail: barley,
  });

  const goat = index.byFoodId.get('produits-laitiers-goat-milk-whole');
  cases.push({
    id: 'goat-milk-not-plant-drink',
    pass: goat?.exchangeRollupId === 'rollup-dairy-milk-yogurt'
      && goat?.exchangeRollupId !== 'rollup-dairy-plant-drink',
    detail: goat,
  });

  for (const foodId of [
    'produits-laitiers-cottage-cheese',
    'produits-laitiers-partly-skimmed-ricotta',
    'produits-laitiers-quark-fat-free-plain',
  ]) {
    const row = index.byFoodId.get(foodId);
    cases.push({
      id: `fresh-cheese-${foodId}`,
      pass: row?.exchangeRollupId === 'rollup-dairy-fresh-cheese',
      detail: row,
    });
  }

  const fatty = [...index.byFoodId.values()].filter((row) => row.exchangeRollupId === 'rollup-protein-fatty');
  cases.push({
    id: 'fatty-never-lean',
    pass: fatty.length > 0 && fatty.every((row) => row.exchangeRollupId !== 'rollup-protein-lean'),
    detail: { count: fatty.length },
  });

  const failed = cases.filter((row) => !row.pass);
  if (failed.length) {
    throw new Error(`Mandatory special cases failed: ${failed.map((row) => row.id).join(', ')}`);
  }
  return cases;
}

export function assertForbiddenMergesRespected(index) {
  const merges = index.forbiddenMerges || FORBIDDEN_MERGES;
  for (const merge of merges) {
    const set = new Set(merge.mutuallyExclusiveRollups || [merge.a, merge.b]);
    for (const rollupId of set) {
      if (!index.byRollupId.has(rollupId)) {
        throw new Error(`Forbidden merge ${merge.id} references missing rollup ${rollupId}`);
      }
    }
  }
  return true;
}

export function buildLegacyContext(categoryMapping) {
  return loadLegacyReferences(categoryMapping);
}
