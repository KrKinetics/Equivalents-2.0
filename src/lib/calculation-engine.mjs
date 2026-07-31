/**
 * Pure, deterministic calculation engine for legacy-a and hybrid-da-rc.
 * No browser dependency. Never mutates plans or nutrition source files.
 */

import { formatStatNumber } from './descriptive-stats.mjs';
import {
  CALCULATION_MODEL_VERSIONS,
  resolveCalculationModelVersion,
} from './calculation-models.mjs';
import {
  NUTRIENT_KEYS,
  dominantStableRollupForGroup,
  getRollup,
  getRollupPreviewValue,
  resolveFoodAssignment,
} from './hybrid-rollup-adapter.mjs';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function emptyTotals() {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null]));
}

function addNutrients(totals, nutrients, portions) {
  const count = Number(portions) || 0;
  if (!count) return totals;
  for (const key of NUTRIENT_KEYS) {
    const value = nutrients?.[key];
    if (!isNumber(value)) continue;
    totals[key] = (totals[key] ?? 0) + value * count;
  }
  return totals;
}

function normalizeTotals(totals) {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, formatStatNumber(totals[key], 4)]),
  );
}

function legacyNutrientsForGroup(group, legacyRefs) {
  const ref = legacyRefs?.[group];
  if (!ref) {
    return {
      proteinG: null,
      carbsG: null,
      fiberG: null,
      fatG: null,
      declaredKcal: null,
    };
  }
  return {
    proteinG: ref.proteinG ?? null,
    carbsG: ref.carbsG ?? null,
    fiberG: ref.fiberG ?? null,
    fatG: ref.fatG ?? null,
    declaredKcal: ref.declaredKcal ?? null,
  };
}

function resolveEntryMeta(entry, context) {
  const { foodsById, rollupIndex } = context;
  if (entry.type === 'group') {
    return {
      type: 'group',
      group: entry.group,
      foodId: null,
      exchangeRollupId: null,
      portions: entry.portions,
    };
  }
  if (entry.type === 'food') {
    const food = foodsById.get(entry.foodId);
    if (!food) throw new Error(`Unknown foodId ${entry.foodId}`);
    const assignment = resolveFoodAssignment(entry.foodId, rollupIndex);
    return {
      type: 'food',
      group: food.calculationGroup,
      foodId: entry.foodId,
      exchangeProfileId: assignment.exchangeProfileId,
      exchangeRollupId: assignment.exchangeRollupId,
      portions: entry.portions,
      nameFr: food.names?.fr ?? entry.foodId,
      nameEn: food.names?.en ?? entry.foodId,
    };
  }
  if (entry.type === 'rollup') {
    const rollup = getRollup(entry.exchangeRollupId, rollupIndex);
    return {
      type: 'rollup',
      group: rollup.calculatorBridge?.calculatorGroup ?? null,
      foodId: null,
      exchangeRollupId: entry.exchangeRollupId,
      portions: entry.portions,
    };
  }
  throw new Error(`Unsupported entry type: ${entry?.type}`);
}

function calculateLegacyLine(meta, context) {
  let group = meta.group;
  // Food-level A uses the food's calculationGroup (bit-for-bit with current business rule).
  if (meta.type === 'food' && meta.foodId) {
    group = context.foodsById.get(meta.foodId)?.calculationGroup ?? group;
  }
  if (meta.type === 'rollup' && meta.exchangeRollupId) {
    group = getRollup(meta.exchangeRollupId, context.rollupIndex)?.calculatorBridge?.calculatorGroup ?? group;
  }
  const nutrients = legacyNutrientsForGroup(group, context.legacyRefs);
  return {
    model: CALCULATION_MODEL_VERSIONS.LEGACY_A,
    group,
    exchangeRollupId: meta.exchangeRollupId,
    foodId: meta.foodId,
    portions: meta.portions,
    nutrients,
    status: 'legacy_business_rule',
    insufficientSample: false,
    fallbackApplied: false,
    warnings: [],
    source: 'calculatorLegacyMoyennes',
  };
}

function calculateHybridLine(meta, context, { actionable }) {
  const warnings = [];
  let rollupId = meta.exchangeRollupId;
  let usedDominant = false;

  if (!rollupId && meta.type === 'group') {
    const dominant = dominantStableRollupForGroup(meta.group, context.rollupIndex);
    if (!dominant) {
      const legacy = calculateLegacyLine(meta, context);
      return {
        ...legacy,
        model: CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC,
        fallbackApplied: true,
        fallbackReason: 'no_stable_rollup_for_group',
        warnings: [{
          code: 'group_fallback_legacy_a',
          messageFr: `Aucun rollup stable pour le groupe ${meta.group} — retour explicite aux règles actuelles.`,
          messageEn: `No stable rollup for group ${meta.group} — explicit fallback to current rules.`,
        }],
      };
    }
    rollupId = dominant.exchangeRollupId;
    usedDominant = true;
    warnings.push({
      code: 'dominant_rollup_preview',
      messageFr: `Aperçu via le rollup dominant « ${rollupId} » pour le groupe ${meta.group}. Sélectionnez des aliments pour plus de précision.`,
      messageEn: `Preview via dominant rollup “${rollupId}” for group ${meta.group}. Select foods for more precision.`,
    });
  }

  if (!rollupId && meta.type === 'food') {
    rollupId = resolveFoodAssignment(meta.foodId, context.rollupIndex).exchangeRollupId;
  }

  if (!rollupId) {
    throw new Error(`Unable to resolve rollup for entry ${JSON.stringify(meta)}`);
  }

  const rollup = getRollup(rollupId, context.rollupIndex);
  const preview = getRollupPreviewValue(rollup, { actionable });

  if (preview.fallbackToLegacy) {
    const legacy = calculateLegacyLine({ ...meta, exchangeRollupId: rollupId, group: meta.group || preview.calculatorGroup }, context);
    return {
      ...legacy,
      model: CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC,
      exchangeRollupId: rollupId,
      insufficientSample: true,
      fallbackApplied: true,
      fallbackReason: 'insufficient_sample_actionable',
      status: 'insufficient_sample_provisional_fallback_legacy_a',
      warnings: [...warnings, ...preview.warnings],
      previewNutrients: preview.nutrients,
      usedDominantRollup: usedDominant,
    };
  }

  return {
    model: CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC,
    group: preview.calculatorGroup ?? meta.group,
    exchangeRollupId: rollupId,
    foodId: meta.foodId,
    portions: meta.portions,
    nutrients: preview.nutrients,
    status: preview.status,
    insufficientSample: preview.insufficientSample,
    fallbackApplied: false,
    warnings: [...warnings, ...preview.warnings],
    source: 'exchange_rollup_median_b_rounded',
    usedDominantRollup: usedDominant,
  };
}

/**
 * Calculate a plan.
 * @param {object} plan
 * @param {object} context { legacyRefs, rollupIndex, foodsById }
 * @param {object} [options]
 */
export function calculatePlan(plan, context, options = {}) {
  const model = resolveCalculationModelVersion(plan);
  const actionable = options.actionable === true || plan?.actionable === true;
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  const lineItems = [];
  const totals = emptyTotals();
  const warnings = [];
  const fallbacks = [];

  for (const entry of entries) {
    const meta = resolveEntryMeta(entry, context);
    const line = model === CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC
      ? calculateHybridLine(meta, context, { actionable })
      : calculateLegacyLine(meta, context);

    addNutrients(totals, line.nutrients, line.portions);
    lineItems.push({
      ...meta,
      ...line,
      nameFr: meta.nameFr,
      nameEn: meta.nameEn,
    });
    for (const warning of line.warnings || []) warnings.push(warning);
    if (line.fallbackApplied) {
      fallbacks.push({
        entry: meta,
        reason: line.fallbackReason,
        exchangeRollupId: line.exchangeRollupId,
      });
    }
  }

  return {
    calculationModelVersion: model,
    actionable,
    totals: normalizeTotals(totals),
    lineItems,
    warnings,
    fallbacks,
    provisional: model === CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC,
    productionApproved: false,
  };
}

/** Side-by-side A vs D/A for the same entries (inputs preserved). */
export function compareLegacyAndHybrid(entries, context, options = {}) {
  const base = { entries, actionable: options.actionable === true };
  const legacy = calculatePlan({ ...base, calculationModelVersion: CALCULATION_MODEL_VERSIONS.LEGACY_A }, context, options);
  const hybrid = calculatePlan({ ...base, calculationModelVersion: CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC }, context, options);
  const differences = Object.fromEntries(NUTRIENT_KEYS.map((key) => {
    const a = legacy.totals[key];
    const b = hybrid.totals[key];
    if (!isNumber(a) || !isNumber(b)) return [key, null];
    return [key, formatStatNumber(b - a, 4)];
  }));
  return { legacy, hybrid, differences };
}

/** Bit-for-bit helper: legacy totals for group portion map. */
export function calculateLegacyGroupDay(portionsByGroup, context) {
  const entries = Object.entries(portionsByGroup || {})
    .filter(([, portions]) => Number(portions) > 0)
    .map(([group, portions]) => ({ type: 'group', group, portions }));
  return calculatePlan({
    calculationModelVersion: CALCULATION_MODEL_VERSIONS.LEGACY_A,
    entries,
  }, context);
}
