/**
 * Non-approved intermediate rollup proposal for candidate D.
 * Does NOT modify production data or calculator MOYENNES.
 *
 * Classification uses exchangeProfileId + displayCategory + calculationGroup.
 * Never classifies by ambiguous foodId substrings (e.g. "bar"⊂"barley", "oat"⊂"goat").
 */

import { analyzeCohort, DEFAULT_TOLERANCES, NUTRIENT_KEYS } from './exchange-profile-analysis.mjs';
import { formatStatNumber } from './descriptive-stats.mjs';

const MIN_SAMPLE = 3;

/**
 * Explicit refusals — machine-readable mutually exclusive rollup families.
 * `a`/`b` kept for backward-compatible pairwise checks; `mutuallyExclusiveRollups` is authoritative.
 */
export const FORBIDDEN_MERGES = [
  {
    id: 'nuts_vs_oils',
    a: 'rollup-nuts-seeds',
    b: 'rollup-oils-spreads',
    mutuallyExclusiveRollups: ['rollup-nuts-seeds', 'rollup-nut-seed-butter', 'rollup-oils-spreads'],
    reason: 'Noix/graines ≠ huiles',
  },
  {
    id: 'lean_vs_fatty_protein',
    a: 'rollup-protein-lean',
    b: 'rollup-protein-fatty',
    mutuallyExclusiveRollups: ['rollup-protein-lean', 'rollup-protein-moderate-fat', 'rollup-protein-fatty'],
    reason: 'Protéines maigres ≠ grasses',
  },
  {
    id: 'dairy_family_splits',
    a: 'rollup-dairy-milk-yogurt',
    b: 'rollup-dairy-plant-drink',
    mutuallyExclusiveRollups: [
      'rollup-dairy-milk-yogurt',
      'rollup-dairy-fresh-cheese',
      'rollup-dairy-cheese',
      'rollup-dairy-plant-drink',
      'rollup-dairy-protein-rtd',
    ],
    reason: 'Lait/yogourt ≠ fromages frais ≠ fromages ≠ boissons végétales ≠ boissons protéinées laitières',
  },
  {
    id: 'whey_collagen_bars_rtd',
    a: 'rollup-whey-powders',
    b: 'rollup-protein-bars',
    mutuallyExclusiveRollups: [
      'rollup-whey-powders',
      'rollup-collagen-incomplete',
      'rollup-protein-bars',
      'rollup-protein-rtd',
      'rollup-dairy-protein-rtd',
    ],
    reason: 'Whey ≠ collagène ≠ barres ≠ boissons protéinées (protéine ou laitier)',
  },
  {
    id: 'legumes_vs_cereal_starches',
    a: 'rollup-starch-legume',
    b: 'rollup-starch-cereal',
    mutuallyExclusiveRollups: ['rollup-starch-legume', 'rollup-starch-cereal'],
    reason: 'Légumineuses ≠ pains/riz/pâtes',
  },
];

/**
 * Deterministic protein fat-class rules (exchangeProfileId only).
 * Patterns are plain strings (JSON-serializable); compiled to RegExp at runtime.
 * Order: fatty → moderate → lean (default for remaining protein profiles).
 */
export const PROTEIN_FAT_CLASS_RULES = {
  fattyProfilePatterns: [
    '(?:^|-)fatty(?:-|$)',
    'high-fat',
    'with-skin',
    'ribs',
    'ground-beef-regular',
    'ground-beef-medium',
    '^protein-lamb$',
    '^protein-duck$',
    'pork-standard',
    'pork-ribs',
    'processed-meat-high-fat',
  ],
  moderateProfilePatterns: [
    'moderate-fat',
    'processed-seafood',
    'processed-poultry',
  ],
  /** Explicit lean keepers that must never be pulled into fatty by loose tokens. */
  documentedLeanProfiles: [
    'protein-ground-beef-extra-lean',
    'protein-ground-beef-lean',
    'protein-pork-lean',
    'protein-game-lean',
    'protein-lean-fish',
    'protein-shellfish-lean',
    'protein-mollusk-lean',
    'protein-canned-fish-lean',
    'protein-chicken-dark-meat',
  ],
};

function compilePatterns(patterns) {
  return (patterns || []).map((pattern) => new RegExp(pattern));
}

function profileOf(foodOrProfile) {
  if (foodOrProfile && typeof foodOrProfile === 'object') {
    return String(foodOrProfile.exchangeProfileId || '');
  }
  return String(foodOrProfile || '');
}

export function classifyProteinFatClass(exchangeProfileId) {
  const profile = String(exchangeProfileId || '');
  if (PROTEIN_FAT_CLASS_RULES.documentedLeanProfiles.includes(profile)) {
    return 'lean';
  }
  if (compilePatterns(PROTEIN_FAT_CLASS_RULES.fattyProfilePatterns).some((re) => re.test(profile))) {
    return 'fatty';
  }
  if (compilePatterns(PROTEIN_FAT_CLASS_RULES.moderateProfilePatterns).some((re) => re.test(profile))) {
    return 'moderate';
  }
  return 'lean';
}

function isPlantDairyProfile(profile) {
  return (
    profile.startsWith('dairy-alternative-')
    || profile.startsWith('dairy-plant-')
    || /(?:^|-)plant(?:-drink|-beverage)?(?:-|$)/.test(profile)
  );
}

function isFreshCheeseProfile(profile) {
  return /cottage|ricotta|quark|fresh-cheese|fromage-frais/.test(profile);
}

function isAgedOrFirmCheeseProfile(profile) {
  if (isFreshCheeseProfile(profile)) return false;
  return /(?:^|-)cheese(?:-|$)|fromage/.test(profile);
}

/**
 * Map a food to a proposed intermediate rollup id.
 * Most specific rules first. Prefer exchangeProfileId tokens over foodId.
 *
 * @param {object|string} foodOrProfile food object (preferred) or legacy profile string
 * @param {string} [calculationGroup]
 * @param {string} [displayCategory]
 */
export function proposeRollupId(foodOrProfile, calculationGroup, displayCategory) {
  const food = typeof foodOrProfile === 'object' && foodOrProfile
    ? foodOrProfile
    : {
      exchangeProfileId: foodOrProfile,
      calculationGroup,
      displayCategory,
    };
  const profile = profileOf(food);
  const group = food.calculationGroup || calculationGroup || null;
  const category = food.displayCategory || displayCategory || null;

  // --- Explicit specialty products (before any broad includes) ---
  if (profile.startsWith('protein-bar-')) return 'rollup-protein-bars';
  if (profile.startsWith('protein-whey-')) return 'rollup-whey-powders';
  if (profile.includes('collagen')) return 'rollup-collagen-incomplete';
  if (profile.startsWith('dairy-protein-shake-')) return 'rollup-dairy-protein-rtd';
  if (
    profile.startsWith('protein-ready-to-drink')
    || profile.startsWith('protein-rtd')
    || /(?:^|-)protein-drink(?:-|$)/.test(profile)
  ) {
    return 'rollup-protein-rtd';
  }

  // --- Starches / grains (prevent barley→bars and chestnut/granola mishops) ---
  if (group === 'starch' || category === 'feculents' || profile.startsWith('starch-')) {
    if (profile.includes('chestnut')) return 'rollup-chestnut';
    if (profile.includes('granola')) return 'rollup-granola';
    if (
      profile.includes('legume')
      || /(?:^|-)(?:bean|lentil|chickpea|pea)(?:-|$)/.test(profile)
    ) {
      return 'rollup-starch-legume';
    }
    return 'rollup-starch-cereal';
  }

  // --- Fruit ---
  if (group === 'fruit' || category === 'fruits' || profile.startsWith('fruit-')) {
    return 'rollup-fruit-standard';
  }

  // --- Vegetables ---
  if (group === 'vegetable' || category === 'legumes' || profile.startsWith('vegetable-')) {
    if (profile.includes('higher-carb') || profile.includes('starchy')) return 'rollup-vegetable-higher-carb';
    if (profile.includes('juice')) return 'rollup-vegetable-juice';
    return 'rollup-vegetable-non-starchy';
  }

  // --- Dairy (animal vs plant vs cheeses) ---
  if (group === 'dairy' || category === 'produits_laitiers' || profile.startsWith('dairy-')) {
    if (isPlantDairyProfile(profile)) return 'rollup-dairy-plant-drink';
    if (isFreshCheeseProfile(profile)) return 'rollup-dairy-fresh-cheese';
    if (isAgedOrFirmCheeseProfile(profile)) return 'rollup-dairy-cheese';
    return 'rollup-dairy-milk-yogurt';
  }

  // --- Nuts display category specials (not automatic true-nut targets) ---
  if (
    profile.startsWith('fat-legume')
    || profile === 'fat-legume-spread'
    || /hummus|houmous/.test(profile)
  ) {
    return 'rollup-legume-spread';
  }
  if (
    profile.includes('edamame')
    || profile === 'protein-fat-soy-nut'
    || profile.startsWith('protein-plant-edamame')
  ) {
    return 'rollup-soy-legume-snack';
  }
  if (profile.includes('granola') || profile.startsWith('starch-fat-granola')) {
    return 'rollup-granola';
  }
  if (profile.includes('chestnut') || profile.startsWith('starch-chestnut')) {
    return 'rollup-chestnut';
  }
  if (profile.startsWith('fat-nut-butter') || profile.startsWith('fat-seed-butter') || /nut-butter|seed-butter/.test(profile)) {
    return 'rollup-nut-seed-butter';
  }
  if (profile.startsWith('fat-nut') || profile.startsWith('fat-seed')) {
    return 'rollup-nuts-seeds';
  }
  if (category === 'noix_graines') {
    // Remaining nuts/seeds display items that are true nut/seed profiles.
    return 'rollup-nuts-seeds';
  }

  // --- Added fats ---
  if (category === 'matieres_grasses' || (group === 'fat' && !profile.startsWith('fat-nut') && !profile.startsWith('fat-seed'))) {
    if (profile.startsWith('fat-egg') || profile === 'fat-egg') return 'rollup-fat-egg';
    if (profile.startsWith('fat-chocolate') || /(?:^|-)chocolate(?:-|$)/.test(profile)) return 'rollup-fat-chocolate';
    if (/(?:^|-)cheese(?:-|$)/.test(profile)) return 'rollup-fat-cheese-portion';
    if (
      profile.startsWith('fat-oil')
      || /mayonnaise|butter-spread|(?:^|-)mct(?:-|$)/.test(profile)
      || (/(?:^|-)olive(?:-|$)/.test(profile) && category === 'matieres_grasses')
      || (/(?:^|-)avocado(?:-|$)/.test(profile) && category === 'matieres_grasses')
    ) {
      return 'rollup-oils-spreads';
    }
    if (category === 'matieres_grasses') return 'rollup-oils-spreads';
  }

  // --- Protein (after specialty powders/bars) ---
  if (group === 'protein' || profile.startsWith('protein-')) {
    const fatClass = classifyProteinFatClass(profile);
    if (fatClass === 'fatty') return 'rollup-protein-fatty';
    if (fatClass === 'moderate') return 'rollup-protein-moderate-fat';
    return 'rollup-protein-lean';
  }

  // --- Residual fat group ---
  if (group === 'fat') {
    if (profile.startsWith('fat-egg')) return 'rollup-fat-egg';
    if (profile.startsWith('fat-chocolate')) return 'rollup-fat-chocolate';
    return 'rollup-oils-spreads';
  }

  return `rollup-other-${group || 'unknown'}`;
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
  if (rollupId === 'rollup-dairy-protein-rtd') {
    return {
      calculatorGroup: 'dairy',
      bridge: 'keep_dairy_with_protein_rtd_subtarget',
      note: 'Boisson protéinée laitière (ex. dairy-protein-shake-*): reste dans le pont dairy, distincte du lait/yogourt ordinaire.',
      productionChangeInThisPr: false,
    };
  }
  if (rollupId.startsWith('rollup-protein-') || rollupId === 'rollup-soy-legume-snack') {
    return { calculatorGroup: 'protein', bridge: 'keep_protein_group_with_sub_targets', productionChangeInThisPr: false };
  }
  if (
    rollupId.startsWith('rollup-nuts')
    || rollupId.startsWith('rollup-nut')
    || rollupId.startsWith('rollup-oils')
    || rollupId.startsWith('rollup-fat')
    || rollupId === 'rollup-legume-spread'
  ) {
    return { calculatorGroup: 'fat', bridge: 'keep_fat_group_with_sub_targets', productionChangeInThisPr: false };
  }
  if (rollupId.startsWith('rollup-dairy')) {
    return { calculatorGroup: 'dairy', bridge: 'keep_dairy_group_with_sub_targets', productionChangeInThisPr: false };
  }
  if (rollupId.startsWith('rollup-starch') || rollupId === 'rollup-chestnut' || rollupId === 'rollup-granola') {
    return { calculatorGroup: 'starch', bridge: 'keep_starch_group_with_sub_targets', productionChangeInThisPr: false };
  }
  if (rollupId.startsWith('rollup-vegetable')) {
    return { calculatorGroup: 'vegetable', bridge: 'keep_vegetable_group', productionChangeInThisPr: false };
  }
  if (rollupId.startsWith('rollup-fruit')) {
    return { calculatorGroup: 'fruit', bridge: 'keep_fruit_group', productionChangeInThisPr: false };
  }
  return { calculatorGroup: null, bridge: 'unassigned', productionChangeInThisPr: false };
}

function cleanNutrientStats(stats) {
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const n = stats[key];
    const p75 = formatStatNumber(n.p75);
    const p25 = formatStatNumber(n.p25);
    out[key] = {
      numericCount: n.numericCount,
      nullCount: n.nullCount,
      mean: formatStatNumber(n.mean),
      median: formatStatNumber(n.median),
      p25,
      p75,
      min: formatStatNumber(n.min),
      max: formatStatNumber(n.max),
      stddev: formatStatNumber(n.stddev),
      mad: formatStatNumber(n.mad),
    };
  }
  return out;
}

function assertAssignmentIntegrity(assignments, foods) {
  const foodIds = assignments.map((a) => a.foodId);
  if (foodIds.length !== foods.length) {
    throw new Error(`Rollup assignments cover ${foodIds.length} foods, expected ${foods.length}`);
  }
  if (new Set(foodIds).size !== foodIds.length) {
    throw new Error('Duplicate foodId in rollup assignments');
  }
  const byProfile = new Map();
  for (const row of assignments) {
    const list = byProfile.get(row.exchangeProfileId) || [];
    list.push(row.exchangeRollupId);
    byProfile.set(row.exchangeProfileId, list);
  }
  for (const [profile, rollups] of byProfile) {
    const unique = [...new Set(rollups)];
    if (unique.length > 1) {
      throw new Error(`exchangeProfileId ${profile} mapped to incompatible rollups: ${unique.join(', ')}`);
    }
  }
}

/**
 * @param {object[]} foods
 * @param {object} analysis from analyzeAllLevels
 */
export function buildExchangeRollupProposal(foods, analysis) {
  const assignments = [];
  for (const food of foods || []) {
    const rollupId = proposeRollupId(food);
    assignments.push({
      foodId: food.id,
      exchangeProfileId: food.exchangeProfileId,
      calculationGroup: food.calculationGroup,
      displayCategory: food.displayCategory,
      exchangeRollupId: rollupId,
      calculatorBridgeProfileId: rollupId,
    });
  }
  assertAssignmentIntegrity(assignments, foods || []);

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
    const nutrients = cleanNutrientStats(cohort.nutrients);
    return {
      exchangeRollupId: rollupId,
      calculatorBridgeProfileId: rollupId,
      foodCount: cohortFoods.length,
      verifiedCount: cohort.verifiedCount,
      exchangeProfileIds: exchangeProfiles,
      exchangeProfileCount: exchangeProfiles.length,
      insufficientSample: cohortFoods.length < MIN_SAMPLE,
      proposedTolerances: { ...DEFAULT_TOLERANCES },
      nutrients,
      medianProfile: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, nutrients[k].median])),
      dispersion: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, {
        mad: nutrients[k].mad,
        stddev: nutrients[k].stddev,
        iqr: formatStatNumber(
          (nutrients[k].p75 != null && nutrients[k].p25 != null)
            ? nutrients[k].p75 - nutrients[k].p25
            : null,
        ),
      }])),
      calculatorBridge: bridge,
      approved: false,
      status: 'proposal_only_not_production',
    };
  });

  const singletonProfiles = Object.values(analysis.exchangeProfileId || {}).filter((c) => c.totalCount === 1).length;
  const wheyFoods = (foods || []).filter((f) => String(f.exchangeProfileId || '').startsWith('protein-whey-'));
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
      keepSeparatedFrom: [
        'rollup-collagen-incomplete',
        'rollup-protein-bars',
        'rollup-protein-rtd',
        'rollup-dairy-protein-rtd',
      ],
    },
  };

  return {
    schemaVersion: '1.2.0',
    status: 'proposal_not_approved',
    decisionModel: 'hybrid_D_A_transition',
    policy: {
      longTermArchitecture: 'D',
      temporaryCalculatorBusinessRule: 'A',
      mediansB: 'starting_point_inside_comparable_families_only',
      medoidsC: 'not_primary_model',
      forbiddenUniqueTargets: FORBIDDEN_MERGES.map((m) => m.id),
      doNotModifyProductionInThisPr: true,
      classificationNotes: {
        proteinFatClass: {
          fattyProfilePatterns: [...PROTEIN_FAT_CLASS_RULES.fattyProfilePatterns],
          moderateProfilePatterns: [...PROTEIN_FAT_CLASS_RULES.moderateProfilePatterns],
          documentedLeanProfiles: [...PROTEIN_FAT_CLASS_RULES.documentedLeanProfiles],
          evaluationOrder: ['documentedLeanProfiles', 'fattyProfilePatterns', 'moderateProfilePatterns', 'defaultLean'],
        },
        neverUseAmbiguousFoodIdSubstrings: ['bar⊂barley', 'oat⊂goat'],
        dairyProteinShakeRule: 'exchangeProfileId dairy-protein-shake-* → rollup-dairy-protein-rtd (never milk/yogurt)',
      },
    },
    meta: {
      totalFoods: foods.length,
      assignedFoods: assignments.length,
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

## Pourquoi ne pas brancher les ${proposal.meta.exchangeProfileCount} exchangeProfileId directement

- ${proposal.meta.exchangeProfileCount} profils d’échange, dont **${proposal.meta.singletonExchangeProfiles} singletons**.
- Relier chaque singleton au calculateur ferait exploser les options UI sans gain d’équivalence.
- Proposition : couche intermédiaire \`exchangeRollupId\` / \`calculatorBridgeProfileId\` (**${proposal.meta.rollupCount}** familles proposées).

## Règles déterministes lean / moderate-fat / fatty

- **fatty** si le profil matche: fatty, high-fat, with-skin, ribs, ground-beef-regular/medium, lamb, duck, pork-standard, pork-ribs, processed-meat-high-fat.
- **moderate** si: moderate-fat, processed-seafood, processed-poultry.
- **lean** par défaut pour les autres profils protéine, y compris les lean documentés (extra-lean / lean ground beef, pork-lean, game-lean, lean fish/shellfish).
- Les barres = uniquement \`protein-bar-*\` (jamais une sous-chaîne \`bar\` qui matcherait \`barley\`).
- Les boissons végétales = \`dairy-alternative-*\` (jamais \`includes('oat')\` qui matcherait \`goat\`).
- Les boissons protéinées laitières = \`dairy-protein-shake-*\` → \`rollup-dairy-protein-rtd\` (jamais lait/yogourt ordinaire).

## Séparations obligatoires (refus d’une cible unique)

${proposal.forbiddenMerges.map((m) => `- **${m.id}** — ${m.reason}\n  - Mutuellement exclusifs: \`${(m.mutuallyExclusiveRollups || []).join('`, `')}\``).join('\n')}

## Cas whey

${proposal.wheyObservation.explanationFr}

Pont proposé (sans mutation production) : \`${proposal.wheyObservation.proposedBridge.map}\`.

## Familles proposées (${proposal.meta.rollupCount})

| exchangeRollupId | Aliments | Profils sources | Échantillon insuffisant (<${proposal.meta.minSampleForStableRollup}) | Pont calculateur | Médiane P/G/L |
| --- | ---: | ---: | --- | --- | --- |
${rows}

## Statut

- \`approved: false\` pour tous les rollups.
- Aucune application automatique au calculateur.
- Les plans existants restent sur la règle d’affaires **A** jusqu’à décision ultérieure.
`;
}
