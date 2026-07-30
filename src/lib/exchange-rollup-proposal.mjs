/**
 * Non-approved intermediate rollup proposal for candidate D.
 * Does NOT modify production data or calculator MOYENNES.
 */

import { analyzeCohort, DEFAULT_TOLERANCES, NUTRIENT_KEYS } from './exchange-profile-analysis.mjs';
import { formatStatNumber } from './descriptive-stats.mjs';

const MIN_SAMPLE = 3;

/** Explicit refusals — never merge these families. */
export const FORBIDDEN_MERGES = [
  { id: 'nuts_vs_oils', a: 'nuts_seeds', b: 'oils_spreads', reason: 'Noix/graines ≠ huiles' },
  { id: 'lean_vs_fatty_protein', a: 'protein_lean', b: 'protein_fatty', reason: 'Protéines maigres ≠ grasses' },
  { id: 'dairy_splits', a: 'dairy_milk_yogurt', b: 'dairy_cheese_or_plant', reason: 'Lait/yogourt ≠ fromages ≠ boissons végétales' },
  { id: 'whey_vs_collagen_bars', a: 'whey_powders', b: 'collagen_bars_rtd', reason: 'Whey ≠ collagène ≠ barres ≠ boissons protéinées' },
  { id: 'legumes_vs_cereal_starches', a: 'starch_legume', b: 'starch_cereal', reason: 'Légumineuses ≠ pains/riz/pâtes' },
];

/**
 * Map an exchangeProfileId to a proposed intermediate rollup id.
 * Heuristic only — decision document, not production.
 */
export function proposeRollupId(exchangeProfileId, calculationGroup, displayCategory) {
  const id = String(exchangeProfileId || '');
  if (id.startsWith('fruit-')) return 'rollup-fruit-standard';
  if (id.startsWith('vegetable-')) {
    if (id.includes('higher-carb') || id.includes('starchy')) return 'rollup-vegetable-higher-carb';
    if (id.includes('juice')) return 'rollup-vegetable-juice';
    return 'rollup-vegetable-non-starchy';
  }
  if (displayCategory === 'noix_graines' || id.startsWith('fat-nut') || id.startsWith('fat-seed')) {
    if (id.includes('butter')) return 'rollup-nut-seed-butter';
    return 'rollup-nuts-seeds';
  }
  if (
    id.startsWith('fat-oil')
    || id.includes('mayonnaise')
    || id.includes('butter-spread')
    || id.includes('mct')
    || (id.includes('olive') && displayCategory === 'matieres_grasses')
    || (id.includes('avocado') && displayCategory === 'matieres_grasses')
  ) {
    return 'rollup-oils-spreads';
  }
  if (displayCategory === 'matieres_grasses') {
    if (id.includes('cheese')) return 'rollup-fat-cheese-portion';
    if (id.includes('egg') || id.includes('chocolate')) return 'rollup-fat-other';
    return 'rollup-oils-spreads';
  }
  if (id.includes('whey')) return 'rollup-whey-powders';
  if (id.includes('collagen')) return 'rollup-collagen-incomplete';
  if (id.includes('bar')) return 'rollup-protein-bars';
  if (id.includes('ready-to-drink') || id.includes('rtd') || id.includes('protein-drink')) return 'rollup-protein-rtd';
  if (calculationGroup === 'dairy' || displayCategory === 'produits_laitiers') {
    if (id.includes('cheese') || id.includes('fromage')) return 'rollup-dairy-cheese';
    if (id.includes('plant') || id.includes('almond') || id.includes('soy') || id.includes('oat') || id.includes('rice') || id.includes('alternative')) {
      return 'rollup-dairy-plant-drink';
    }
    return 'rollup-dairy-milk-yogurt';
  }
  if (calculationGroup === 'starch' || displayCategory === 'feculents') {
    if (id.includes('legume') || id.includes('bean') || id.includes('lentil') || id.includes('chickpea') || id.includes('pea')) {
      return 'rollup-starch-legume';
    }
    return 'rollup-starch-cereal';
  }
  if (calculationGroup === 'protein') {
    if (id.includes('fatty') || id.includes('high-fat') || id.includes('processed-meat-high-fat')) return 'rollup-protein-fatty';
    if (id.includes('moderate-fat')) return 'rollup-protein-moderate-fat';
    return 'rollup-protein-lean';
  }
  return `rollup-other-${calculationGroup || 'unknown'}`;
}

export function proposeCalculatorBridge(rollupId) {
  if (rollupId === 'rollup-whey-powders') {
    return {
      calculatorGroup: 'whey',
      bridge: 'map_rollup_whey_powders_to_calculator_whey',
      note: 'Les aliments whey sont aujourd’hui classés calculationGroup=protein; le groupe calculateur whey est vide. Pont proposé sans mutation production.',
      productionChangeInThisPr: false,
    };
  }
  if (rollupId.startsWith('rollup-protein-')) return { calculatorGroup: 'protein', bridge: 'keep_protein_group', productionChangeInThisPr: false };
  if (rollupId.startsWith('rollup-nuts') || rollupId.startsWith('rollup-nut') || rollupId.startsWith('rollup-oils') || rollupId.startsWith('rollup-fat')) {
    return { calculatorGroup: 'fat', bridge: 'keep_fat_group_with_sub_targets', productionChangeInThisPr: false };
  }
  if (rollupId.startsWith('rollup-dairy')) return { calculatorGroup: 'dairy', bridge: 'keep_dairy_group_with_sub_targets', productionChangeInThisPr: false };
  if (rollupId.startsWith('rollup-starch')) return { calculatorGroup: 'starch', bridge: 'keep_starch_group_with_sub_targets', productionChangeInThisPr: false };
  if (rollupId.startsWith('rollup-vegetable')) return { calculatorGroup: 'vegetable', bridge: 'keep_vegetable_group', productionChangeInThisPr: false };
  if (rollupId.startsWith('rollup-fruit')) return { calculatorGroup: 'fruit', bridge: 'keep_fruit_group', productionChangeInThisPr: false };
  return { calculatorGroup: null, bridge: 'unassigned', productionChangeInThisPr: false };
}

function cleanNutrientStats(stats) {
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const n = stats[key];
    out[key] = {
      numericCount: n.numericCount,
      nullCount: n.nullCount,
      mean: formatStatNumber(n.mean),
      median: formatStatNumber(n.median),
      p25: formatStatNumber(n.p25),
      p75: formatStatNumber(n.p75),
      min: formatStatNumber(n.min),
      max: formatStatNumber(n.max),
      stddev: formatStatNumber(n.stddev),
      mad: formatStatNumber(n.mad),
    };
  }
  return out;
}

/**
 * @param {object[]} foods
 * @param {object} analysis from analyzeAllLevels
 */
export function buildExchangeRollupProposal(foods, analysis) {
  const assignments = [];
  for (const food of foods || []) {
    const rollupId = proposeRollupId(food.exchangeProfileId, food.calculationGroup, food.displayCategory);
    assignments.push({
      foodId: food.id,
      exchangeProfileId: food.exchangeProfileId,
      calculationGroup: food.calculationGroup,
      displayCategory: food.displayCategory,
      exchangeRollupId: rollupId,
      calculatorBridgeProfileId: rollupId,
    });
  }

  const byRollup = {};
  for (const row of assignments) {
    byRollup[row.exchangeRollupId] = byRollup[row.exchangeRollupId] || [];
    byRollup[row.exchangeRollupId].push(foods.find((f) => f.id === row.foodId));
  }

  const rollups = Object.keys(byRollup).sort().map((rollupId) => {
    const cohortFoods = byRollup[rollupId].filter(Boolean);
    const cohort = analyzeCohort(cohortFoods, { level: 'exchangeRollupId', id: rollupId, legacyRef: null });
    const exchangeProfiles = [...new Set(cohortFoods.map((f) => f.exchangeProfileId))].sort();
    const bridge = proposeCalculatorBridge(rollupId);
    return {
      exchangeRollupId: rollupId,
      calculatorBridgeProfileId: rollupId,
      foodCount: cohortFoods.length,
      verifiedCount: cohort.verifiedCount,
      exchangeProfileIds: exchangeProfiles,
      exchangeProfileCount: exchangeProfiles.length,
      insufficientSample: cohortFoods.length < MIN_SAMPLE,
      proposedTolerances: { ...DEFAULT_TOLERANCES },
      nutrients: cleanNutrientStats(cohort.nutrients),
      medianProfile: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, formatStatNumber(cohort.nutrients[k].median)])),
      dispersion: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, {
        mad: formatStatNumber(cohort.nutrients[k].mad),
        stddev: formatStatNumber(cohort.nutrients[k].stddev),
        iqr: formatStatNumber(
          (cohort.nutrients[k].p75 != null && cohort.nutrients[k].p25 != null)
            ? cohort.nutrients[k].p75 - cohort.nutrients[k].p25
            : null,
        ),
      }])),
      calculatorBridge: bridge,
      approved: false,
      status: 'proposal_only_not_production',
    };
  });

  const singletonProfiles = Object.values(analysis.exchangeProfileId || {}).filter((c) => c.totalCount === 1).length;
  const wheyFoods = (foods || []).filter((f) => String(f.exchangeProfileId || '').includes('whey'));
  const wheyObservation = {
    calculatorGroupWheyFoodCount: analysis.calculationGroup?.whey?.totalCount ?? 0,
    foodsWithWheyExchangeProfile: wheyFoods.length,
    foodsWithWheyExchangeProfileButProteinGroup: wheyFoods.filter((f) => f.calculationGroup === 'protein').length,
    explanationFr:
      'Le groupe calculateur `whey` existe dans calculation-groups.json et dans les MOYENNES historiques, mais aucun aliment n’a actuellement `calculationGroup: "whey"`. Les produits whey portent des `exchangeProfileId` `protein-whey-*` tout en restant classés `calculationGroup: "protein"`. C’est pourquoi les statistiques B/C/D du groupe whey sont vides (0 observation), alors que des produits whey existent bien dans la banque.',
    explanationEn:
      'Calculator group `whey` exists in calculation-groups.json and legacy MOYENNES, but no food currently has `calculationGroup: "whey"`. Whey products use `exchangeProfileId` values `protein-whey-*` while remaining classified as `calculationGroup: "protein"`. That is why B/C/D stats for the whey calculator group have zero observations even though whey products exist.',
    proposedBridge: {
      productionChangeInThisPr: false,
      map: 'exchangeRollupId=rollup-whey-powders → calculatorGroup=whey (future approval only)',
      keepSeparatedFrom: ['rollup-collagen-incomplete', 'rollup-protein-bars', 'rollup-protein-rtd'],
    },
  };

  return {
    schemaVersion: '1.0.0',
    status: 'proposal_not_approved',
    decisionModel: 'hybrid_D_A_transition',
    policy: {
      longTermArchitecture: 'D',
      temporaryCalculatorBusinessRule: 'A',
      mediansB: 'starting_point_inside_comparable_families_only',
      medoidsC: 'not_primary_model',
      forbiddenUniqueTargets: FORBIDDEN_MERGES.map((m) => m.id),
      doNotModifyProductionInThisPr: true,
    },
    meta: {
      totalFoods: foods.length,
      exchangeProfileCount: Object.keys(analysis.exchangeProfileId || {}).length,
      singletonExchangeProfiles: singletonProfiles,
      rollupCount: rollups.length,
      minSampleForStableRollup: MIN_SAMPLE,
      insufficientSampleRollupCount: rollups.filter((r) => r.insufficientSample).length,
    },
    forbiddenMerges: FORBIDDEN_MERGES,
    wheyObservation,
    rollups,
    assignments,
  };
}

export function buildRollupProposalMarkdown(proposal) {
  const rows = proposal.rollups.map((r) =>
    `| ${r.exchangeRollupId} | ${r.foodCount} | ${r.exchangeProfileCount} | ${r.insufficientSample ? 'oui' : 'non'} | ${r.calculatorBridge.calculatorGroup || '—'} | P ${r.medianProfile.proteinG ?? '—'} / G ${r.medianProfile.carbsG ?? '—'} / L ${r.medianProfile.fatG ?? '—'} |`).join('\n');
  return `# Proposition de rollups d’échange (non approuvée)

> **APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS**  
> Document de décision seulement. Aucune donnée de production ni MOYENNES modifiées.

## Modèle retenu : HYBRIDE D/A DE TRANSITION

- **D** = architecture cible à long terme (profils d’échange + familles intermédiaires + pont calculateur).
- **A** = règle d’affaires temporaire du calculateur actuel et des plans existants.
- **B** = point de départ statistique uniquement à l’intérieur de familles comparables.
- **C** = ne pas utiliser comme modèle principal.
- Dataset demeure en \`review\`; \`calculation-groups.json\` non approuvé dans cette PR.

## Pourquoi ne pas brancher les 157 exchangeProfileId directement

- ${proposal.meta.exchangeProfileCount} profils d’échange, dont **${proposal.meta.singletonExchangeProfiles} singletons**.
- Relier chaque singleton au calculateur ferait exploser les options UI sans gain d’équivalence.
- Proposition : couche intermédiaire \`exchangeRollupId\` / \`calculatorBridgeProfileId\` (${proposal.meta.rollupCount} familles proposées).

## Séparations obligatoires (refus d’une cible unique)

${proposal.forbiddenMerges.map((m) => `- **${m.id}** — ${m.reason}`).join('\n')}

## Cas whey

${proposal.wheyObservation.explanationFr}

Pont proposé (sans mutation production) : \`${proposal.wheyObservation.proposedBridge.map}\`.

## Familles proposées

| exchangeRollupId | Aliments | Profils sources | Échantillon insuffisant (<${proposal.meta.minSampleForStableRollup}) | Pont calculateur | Médiane P/G/L |
| --- | ---: | ---: | --- | --- | --- |
${rows}

## Statut

- \`approved: false\` pour tous les rollups.
- Aucune application automatique au calculateur.
- Les plans existants restent sur la règle d’affaires **A** jusqu’à décision ultérieure.
`;
}
