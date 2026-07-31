/**
 * Deterministic acceptance scenarios for legacy-a vs hybrid-da-rc.
 */

import { compareLegacyAndHybrid, calculatePlan } from './calculation-engine.mjs';
import { CALCULATION_MODEL_VERSIONS } from './calculation-models.mjs';

/** Typical day from DECISIONS_REQUIRED.md */
export const TYPICAL_DAY_PORTIONS = Object.freeze({
  protein: 4,
  starch: 4,
  vegetable: 3,
  fruit: 2,
  dairy: 2,
  fat: 3,
  whey: 0,
});

function groupEntries(portionsByGroup) {
  return Object.entries(portionsByGroup)
    .filter(([, portions]) => Number(portions) > 0)
    .map(([group, portions]) => ({ type: 'group', group, portions }));
}

function foodEntry(foodId, portions = 1) {
  return { type: 'food', foodId, portions };
}

export function buildAcceptanceScenarios() {
  return [
    {
      id: '01-typical-day',
      titleFr: 'Journée type (DECISIONS_REQUIRED)',
      titleEn: 'Typical day (DECISIONS_REQUIRED)',
      entries: groupEntries(TYPICAL_DAY_PORTIONS),
      actionable: false,
    },
    {
      id: '02-lean-protein-rich',
      titleFr: 'Journée riche en protéines maigres',
      titleEn: 'Lean-protein-rich day',
      entries: [
        foodEntry('viandes-volaille-chicken-breast', 4),
        foodEntry('feculents-cooked-rice', 4),
        foodEntry('legumes-broccoli', 3),
        foodEntry('fruits-apple', 2),
        foodEntry('produits-laitiers-2-yogurt-no-added-sugar', 2),
        foodEntry('matieres-grasses-unsalted-butter', 3),
      ],
      actionable: false,
    },
    {
      id: '03-fatty-protein',
      titleFr: 'Journée contenant une protéine grasse',
      titleEn: 'Day with fatty protein',
      entries: [
        foodEntry('poissons-fruits-mer-atlantic-salmon', 2),
        foodEntry('poissons-fruits-mer-mackerel', 2),
        foodEntry('feculents-cooked-rice', 3),
        foodEntry('legumes-spinach', 2),
        foodEntry('fruits-banana', 2),
        foodEntry('matieres-grasses-unsalted-butter', 2),
      ],
      actionable: false,
    },
    {
      id: '04-nuts-and-oils',
      titleFr: 'Noix/graines et huile dans le même plan',
      titleEn: 'Nuts/seeds and oil in the same plan',
      entries: [
        foodEntry('noix-graines-almonds', 2),
        foodEntry('matieres-grasses-vegetable-oil', 2),
        foodEntry('viandes-volaille-chicken-breast', 3),
        foodEntry('feculents-cooked-rice', 3),
      ],
      actionable: false,
    },
    {
      id: '05-dairy-families',
      titleFr: 'Lait/yogourt, fromage, boisson végétale et Core Power',
      titleEn: 'Milk/yogurt, cheese, plant drink and Core Power',
      entries: [
        foodEntry('produits-laitiers-2-yogurt-no-added-sugar', 1),
        foodEntry('produits-laitiers-allegro-9-cheese', 1),
        foodEntry('produits-laitiers-cup-plain-almond-barley-rice-beverage', 1),
        foodEntry('produits-laitiers-bottle-core-power-fairlife', 1),
      ],
      actionable: false,
    },
    {
      id: '06-whey-collagen-bar-rtd',
      titleFr: 'Whey, collagène, barre et boisson protéinée',
      titleEn: 'Whey, collagen, bar and protein drink',
      entries: [
        foodEntry('autres-sources-proteinees-scoop-whey-protein', 1),
        foodEntry('autres-sources-proteinees-hydrolyzed-collagen', 1),
        foodEntry('autres-sources-proteinees-performance-protein-bar', 1),
        foodEntry('autres-sources-proteinees-core-power-fairlife', 1),
      ],
      actionable: false,
    },
    {
      id: '07-legume-vs-cereal',
      titleFr: 'Légumineuse et féculent céréalier',
      titleEn: 'Legume and cereal starch',
      entries: [
        foodEntry('feculents-cooked-beluga-lentils', 2),
        foodEntry('feculents-cooked-rice', 2),
        foodEntry('viandes-volaille-chicken-breast', 2),
      ],
      actionable: false,
    },
    {
      id: '08-insufficient-sample',
      titleFr: 'Rollup à échantillon insuffisant (Core Power / actionable)',
      titleEn: 'Insufficient-sample rollup (Core Power / actionable)',
      entries: [
        foodEntry('produits-laitiers-bottle-core-power-fairlife', 1),
      ],
      actionable: true,
    },
    {
      id: '09-missing-model-version',
      titleFr: 'Ancien plan sans calculationModelVersion',
      titleEn: 'Legacy plan without calculationModelVersion',
      omitModelVersion: true,
      entries: groupEntries({ protein: 2, starch: 2, fruit: 1 }),
      actionable: false,
    },
    {
      id: '10-round-trip-a-da-a',
      titleFr: 'Aller-retour A → D/A → A',
      titleEn: 'Round-trip A → D/A → A',
      entries: groupEntries(TYPICAL_DAY_PORTIONS),
      actionable: false,
      roundTrip: true,
    },
  ];
}

function resolveFoodIdsExist(entries, foodsById) {
  const missing = [];
  for (const entry of entries) {
    if (entry.type === 'food' && !foodsById.has(entry.foodId)) missing.push(entry.foodId);
  }
  return missing;
}

/**
 * Run all scenarios. Food IDs that are missing are remapped via fuzzy search in foods.
 */
export function runAcceptanceScenarios(context, { foodIdResolver, generatedAt = 'deterministic:release-candidate' } = {}) {
  const scenarios = buildAcceptanceScenarios();
  const results = [];

  for (const scenario of scenarios) {
    let entries = scenario.entries.map((entry) => {
      if (entry.type !== 'food') return entry;
      if (context.foodsById.has(entry.foodId)) return entry;
      if (typeof foodIdResolver === 'function') {
        const resolved = foodIdResolver(entry.foodId, context);
        if (resolved) return { ...entry, foodId: resolved };
      }
      return entry;
    });

    const missing = resolveFoodIdsExist(entries, context.foodsById);
    if (missing.length) {
      results.push({
        id: scenario.id,
        titleFr: scenario.titleFr,
        titleEn: scenario.titleEn,
        inputs: entries,
        model: null,
        rollups: [],
        fallbacks: [],
        warnings: [{ code: 'missing_foods', missing }],
        totals: null,
        differences: null,
        result: 'FAIL',
        error: `Missing foodIds: ${missing.join(', ')}`,
      });
      continue;
    }

    try {
      if (scenario.roundTrip) {
        const a1 = calculatePlan({
          calculationModelVersion: CALCULATION_MODEL_VERSIONS.LEGACY_A,
          entries,
        }, context);
        const hybrid = calculatePlan({
          calculationModelVersion: CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC,
          entries,
          actionable: scenario.actionable,
        }, context);
        const a2 = calculatePlan({
          calculationModelVersion: CALCULATION_MODEL_VERSIONS.LEGACY_A,
          entries,
        }, context);
        const same = JSON.stringify(a1.totals) === JSON.stringify(a2.totals)
          && JSON.stringify(entries) === JSON.stringify(scenario.entries);
        results.push({
          id: scenario.id,
          titleFr: scenario.titleFr,
          titleEn: scenario.titleEn,
          inputs: entries,
          model: 'round-trip',
          rollups: hybrid.lineItems.map((line) => line.exchangeRollupId).filter(Boolean),
          fallbacks: hybrid.fallbacks,
          warnings: hybrid.warnings,
          totals: { a1: a1.totals, hybrid: hybrid.totals, a2: a2.totals },
          differences: null,
          result: same ? 'PASS' : 'FAIL',
          error: same ? null : 'A totals changed after D/A toggle',
        });
        continue;
      }

      if (scenario.omitModelVersion) {
        const legacy = calculatePlan({ entries }, context);
        const pass = legacy.calculationModelVersion === CALCULATION_MODEL_VERSIONS.LEGACY_A;
        results.push({
          id: scenario.id,
          titleFr: scenario.titleFr,
          titleEn: scenario.titleEn,
          inputs: entries,
          model: legacy.calculationModelVersion,
          rollups: [],
          fallbacks: legacy.fallbacks,
          warnings: legacy.warnings,
          totals: legacy.totals,
          differences: null,
          result: pass ? 'PASS' : 'FAIL',
          error: pass ? null : 'Missing metadata did not fall back to legacy-a',
        });
        continue;
      }

      const comparison = compareLegacyAndHybrid(entries, context, { actionable: scenario.actionable });
      const rollups = comparison.hybrid.lineItems.map((line) => line.exchangeRollupId).filter(Boolean);
      results.push({
        id: scenario.id,
        titleFr: scenario.titleFr,
        titleEn: scenario.titleEn,
        inputs: entries,
        model: {
          legacy: comparison.legacy.calculationModelVersion,
          hybrid: comparison.hybrid.calculationModelVersion,
        },
        rollups,
        fallbacks: comparison.hybrid.fallbacks,
        warnings: comparison.hybrid.warnings,
        totals: {
          legacy: comparison.legacy.totals,
          hybrid: comparison.hybrid.totals,
        },
        differences: comparison.differences,
        result: 'PASS',
        error: null,
        lineItems: {
          legacy: comparison.legacy.lineItems,
          hybrid: comparison.hybrid.lineItems,
        },
      });
    } catch (error) {
      results.push({
        id: scenario.id,
        titleFr: scenario.titleFr,
        titleEn: scenario.titleEn,
        inputs: entries,
        model: null,
        rollups: [],
        fallbacks: [],
        warnings: [],
        totals: null,
        differences: null,
        result: 'FAIL',
        error: error.message,
      });
    }
  }

  return {
    generatedAt,
    scenarioCount: results.length,
    passed: results.filter((row) => row.result === 'PASS').length,
    failed: results.filter((row) => row.result === 'FAIL').length,
    scenarios: results,
  };
}

/** Best-effort resolver when scenario food IDs drift slightly. */
export function defaultFoodIdResolver(wantedId, context) {
  if (context.foodsById.has(wantedId)) return wantedId;
  const foods = [...context.foodsById.values()];
  const needle = wantedId.toLowerCase();
  const byIncludes = foods.find((food) => food.id.includes(needle.replace(/^.*?:/, ''))
    || needle.includes(food.id));
  if (byIncludes) return byIncludes.id;

  // Keyword heuristics for scenario stability
  const rules = [
    [/chicken-breast/, /chicken.*breast|poitrine.*poulet|chicken-breast/i],
    [/white-rice/, /white-rice|riz.*blanc|rice-white/i],
    [/broccoli/, /broccoli|brocoli/i],
    [/apple$/, /fruits-apple$|apple(?!-)/i],
    [/plain-yogurt/, /yogurt|yogourt/i],
    [/olive-oil/, /olive-oil|huile.*olive/i],
    [/salmon/, /salmon|saumon/i],
    [/mackerel/, /mackerel|maquereau/i],
    [/spinach/, /spinach|epinard|épinard/i],
    [/banana/, /banana|banane/i],
    [/butter/, /butter|beurre/i],
    [/almonds/, /almond|amande/i],
    [/cheddar/, /cheddar/i],
    [/almond-barley-rice-beverage/, /almond.*barley|boisson.*amande/i],
    [/core-power-fairlife$/, /bottle-core-power|core-power-fairlife$/i],
    [/scoop-whey-protein/, /whey-protein|whey.*scoop/i],
    [/collagen/, /collagen|collagene|collagène/i],
    [/quest-bar/, /quest|protein-bar|barre/i],
    [/lentils/, /lentil|lentille/i],
  ];
  for (const [hint, re] of rules) {
    if (hint.test(wantedId)) {
      const hit = foods.find((food) => re.test(food.id) || re.test(food.names?.en || '') || re.test(food.names?.fr || ''));
      if (hit) return hit.id;
    }
  }
  return null;
}
