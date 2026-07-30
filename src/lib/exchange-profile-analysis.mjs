import { mean, median, stddev, nutrientSeries } from './group-statistics.mjs';
import { mad, percentile, roundHalfAwayFromZero } from './descriptive-stats.mjs';

export const NUTRIENT_KEYS = ['proteinG', 'carbsG', 'fiberG', 'fatG', 'declaredKcal'];
export const DEFAULT_TOLERANCES = { proteinG: 2, carbsG: 4, fiberG: 2, fatG: 2, declaredKcal: 15 };

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isVerified = (food) => food?.status === 'verified' || food?.verification?.status === 'verified';
const nutrientObject = (food) => Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, isNumber(food?.nutrients?.[key]) ? food.nutrients[key] : null]));

export function loadLegacyReferences(categoryMapping) {
  const source = categoryMapping?.calculatorLegacyMoyennes;
  const result = {};
  for (const [legacyId, group] of Object.entries(source?.mappingToCalculationGroup || {})) {
    const row = source?.MOYENNES?.[legacyId];
    if (!row) continue;
    result[group] = {
      proteinG: isNumber(row.p) ? row.p : null,
      carbsG: isNumber(row.g) ? row.g : null,
      fatG: isNumber(row.l) ? row.l : null,
      fiberG: null,
      declaredKcal: null,
      source: 'calculatorLegacyMoyennes',
      label: 'business_rule_not_statistical_mean',
    };
  }
  return result;
}

function normalizedDistance(food, center) {
  let score = 0;
  let used = 0;
  for (const key of NUTRIENT_KEYS) {
    const value = food?.nutrients?.[key];
    const target = center[key];
    if (!isNumber(value) || !isNumber(target)) continue;
    score += Math.abs(value - target) / Math.max(Math.abs(target), DEFAULT_TOLERANCES[key], 1);
    used += 1;
  }
  return used ? score / used : 0;
}

function deltaProfile(profile, legacyRef) {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [
    key,
    isNumber(profile?.[key]) && isNumber(legacyRef?.[key]) ? profile[key] - legacyRef[key] : null,
  ]));
}

export function analyzeCohort(foods, { level, id, legacyRef = null, tolerances = DEFAULT_TOLERANCES } = {}) {
  const all = [...(foods || [])];
  const verified = all.filter(isVerified);
  const center = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, median(nutrientSeries(verified, key))]));
  const scored = verified.map((food) => ({
    food,
    distanceScore: normalizedDistance(food, center),
  })).sort((a, b) => b.distanceScore - a.distanceScore || String(a.food.id).localeCompare(String(b.food.id)));
  const medoidEntry = [...scored].sort((a, b) => a.distanceScore - b.distanceScore || String(a.food.id).localeCompare(String(b.food.id)))[0] || null;
  const medoidNutrients = medoidEntry ? nutrientObject(medoidEntry.food) : Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null]));
  const nutrientStats = {};
  for (const key of NUTRIENT_KEYS) {
    const values = nutrientSeries(verified, key);
    nutrientStats[key] = {
      totalCount: all.length,
      verifiedCount: verified.length,
      numericCount: values.length,
      nullCount: verified.length - values.length,
      nullFoodIds: verified.filter((food) => !isNumber(food?.nutrients?.[key])).map((food) => food.id).sort(),
      mean: mean(values),
      median: median(values),
      p25: percentile(values, 0.25),
      p75: percentile(values, 0.75),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      stddev: stddev(values),
      mad: mad(values),
    };
  }
  const outside = legacyRef ? verified.filter((food) => NUTRIENT_KEYS.some((key) => {
    const value = food?.nutrients?.[key];
    return isNumber(value) && isNumber(legacyRef[key]) && Math.abs(value - legacyRef[key]) > (tolerances[key] ?? DEFAULT_TOLERANCES[key]);
  })).map((food) => food.id).sort() : [];
  const meanProfile = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, nutrientStats[key].mean]));
  const medianProfile = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, nutrientStats[key].median]));
  return {
    level,
    id,
    totalCount: all.length,
    verifiedCount: verified.length,
    nutrients: nutrientStats,
    fiveFurthest: scored.slice(0, 5).map(({ food, distanceScore }) => ({ id: food.id, nameFr: food.names?.fr ?? null, distanceScore })),
    medoid: medoidEntry ? {
      id: medoidEntry.food.id,
      nameFr: medoidEntry.food.names?.fr ?? null,
      nameEn: medoidEntry.food.names?.en ?? null,
      nutrients: medoidNutrients,
    } : null,
    legacyComparison: legacyRef ? {
      ref: legacyRef,
      deltas: {
        mean: deltaProfile(meanProfile, legacyRef),
        median: deltaProfile(medianProfile, legacyRef),
        medoid: deltaProfile(medoidNutrients, legacyRef),
      },
    } : null,
    foodsOutsideLegacyTolerance: { count: outside.length, ids: outside },
  };
}

export function analyzeAllLevels(foods, categoryMapping, groupsDoc) {
  const all = foods || [];
  const legacy = loadLegacyReferences(categoryMapping);
  const calculationGroup = {};
  const groupIds = new Set([...(groupsDoc?.groups || []).map((group) => group.id), ...all.map((food) => food.calculationGroup), 'whey']);
  for (const id of [...groupIds].filter(Boolean).sort()) {
    const group = groupsDoc?.groups?.find((entry) => entry.id === id);
    const tolerances = { ...DEFAULT_TOLERANCES, ...(group?.tolerances || {}), declaredKcal: group?.tolerances?.declaredKcal ?? group?.tolerances?.kcal ?? 15 };
    calculationGroup[id] = analyzeCohort(all.filter((food) => food.calculationGroup === id), { level: 'calculationGroup', id, legacyRef: legacy[id] || null, tolerances });
  }
  const displayCategory = {};
  for (const category of categoryMapping?.displayCategories || []) {
    const cohort = all.filter((food) => food.displayCategory === category.id);
    const legacyRef = legacy[category.defaultCalculationGroup] || null;
    displayCategory[category.id] = analyzeCohort(cohort, { level: 'displayCategory', id: category.id, legacyRef });
  }
  const exchangeProfileId = {};
  for (const id of [...new Set(all.map((food) => food.exchangeProfileId).filter(Boolean))].sort()) {
    const cohort = all.filter((food) => food.exchangeProfileId === id);
    const group = cohort[0]?.calculationGroup;
    exchangeProfileId[id] = analyzeCohort(cohort, { level: 'exchangeProfileId', id, legacyRef: legacy[group] || null });
  }
  const exchangeProfileDistributionByGroup = {};
  for (const group of Object.keys(calculationGroup)) {
    exchangeProfileDistributionByGroup[group] = Object.fromEntries([...new Set(all.filter((food) => food.calculationGroup === group).map((food) => food.exchangeProfileId || '(none)'))]
      .sort().map((profile) => [profile, all.filter((food) => food.calculationGroup === group && (food.exchangeProfileId || '(none)') === profile).length]));
  }
  const heterogeneityNotes = Object.entries(exchangeProfileDistributionByGroup)
    .filter(([, profiles]) => Object.keys(profiles).length > 1)
    .map(([group, profiles]) => `${group}: ${Object.entries(profiles).map(([id, count]) => `${id} (${count})`).join(', ')}`);
  return {
    calculationGroup,
    displayCategory,
    exchangeProfileId,
    exchangeProfileDistributionByGroup,
    heterogeneityNotes,
    meta: {
      totalFoods: all.length,
      verifiedFoods: all.filter(isVerified).length,
      exchangeProfileCount: Object.keys(exchangeProfileId).length,
    },
  };
}

const roundedProfile = (cohort, source) => Object.fromEntries(NUTRIENT_KEYS.map((key) => {
  const value = source === 'medoid' ? cohort?.medoid?.nutrients?.[key] : cohort?.nutrients?.[key]?.median;
  const decimals = ['proteinG', 'fatG', 'fiberG'].includes(key) ? 1 : 0;
  return [key, roundHalfAwayFromZero(value, decimals)];
}));

export function estimateTypicalDayImpact(profileByGroup) {
  const portions = { protein: 4, starch: 4, vegetable: 3, fruit: 2, dairy: 2, fat: 3, whey: 0 };
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null]));
  const unavailable = [];
  for (const [group, count] of Object.entries(portions)) {
    for (const key of NUTRIENT_KEYS) {
      const value = profileByGroup?.[group]?.[key];
      if (isNumber(value)) {
        totals[key] = (totals[key] ?? 0) + value * count;
      } else if (count) {
        unavailable.push(`${group}.${key}`);
      }
    }
  }
  return { portions, totals, unavailable };
}

function fmtMacro(profile) {
  if (!profile) return 'P — / G — / L —';
  const p = isNumber(profile.proteinG) ? profile.proteinG : '—';
  const g = isNumber(profile.carbsG) ? profile.carbsG : '—';
  const l = isNumber(profile.fatG) ? profile.fatG : '—';
  return `P ${p} / G ${g} / L ${l}`;
}

function dayLine(impact) {
  const t = impact?.totals || {};
  const p = isNumber(t.proteinG) ? t.proteinG : '—';
  const g = isNumber(t.carbsG) ? t.carbsG : '—';
  const l = isNumber(t.fatG) ? t.fatG : '—';
  const k = isNumber(t.declaredKcal) ? t.declaredKcal : '—';
  return `P ${p} g · G ${g} g · L ${l} g · ${k} kcal`;
}

export function buildProfileCandidates(analysis) {
  const groups = Object.keys(analysis.calculationGroup).sort();
  const legacy = Object.fromEntries(groups.map((group) => [group, analysis.calculationGroup[group].legacyComparison?.ref
    ? Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, analysis.calculationGroup[group].legacyComparison.ref[key] ?? null]))
    : Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null]))]));
  const medians = Object.fromEntries(groups.map((group) => [group, roundedProfile(analysis.calculationGroup[group], 'median')]));
  const medoids = Object.fromEntries(groups.map((group) => [group, roundedProfile(analysis.calculationGroup[group], 'medoid')]));
  const medoidFoods = Object.fromEntries(groups.map((group) => [group, analysis.calculationGroup[group].medoid]));
  const outsideLegacy = Object.fromEntries(groups.map((group) => [group, analysis.calculationGroup[group].foodsOutsideLegacyTolerance?.count ?? 0]));
  const legacyDay = estimateTypicalDayImpact(legacy);
  const medianDay = estimateTypicalDayImpact(medians);
  const medoidDay = estimateTypicalDayImpact(medoids);
  const dayDelta = (a, b) => Object.fromEntries(NUTRIENT_KEYS.map((key) => [
    key,
    isNumber(a?.totals?.[key]) && isNumber(b?.totals?.[key]) ? Number((a.totals[key] - b.totals[key]).toFixed(2)) : null,
  ]));
  const base = (id, values, overrides = {}) => ({
    id,
    advantages: [],
    risks: [],
    clientImpact: 'À valider avant toute communication client',
    existingPlansImpact: 'Les plans existants restent inchangés tant que le calculateur n’est pas reconnecté',
    technicalComplexity: 'faible',
    calculatorCompatibility: 'à valider',
    pdfCompatibility: 'compatible avec aperçu SoT (sans ligne moyenne non approuvée)',
    migrationsNeeded: [],
    testsNeeded: ['régression calculateur', 'comparaison PDF FR/EN', 'garde de périmètre nutritionnelle'],
    cursorRecommendation: 'RECOMMANDATION CURSOR — proposition analytique, pas une décision approuvée',
    proposedValues: values,
    typicalDayImpact: estimateTypicalDayImpact(values),
    ...overrides,
  });
  return {
    A: base('legacy_compatibility', legacy, {
      label: 'Candidat A — Legacy compatibility',
      advantages: [
        'Conserve le comportement actuel du calculateur',
        'Aucune migration de plans existants',
        'Décrit clairement les cibles comme règles d’affaires (pas comme moyennes statistiques)',
      ],
      risks: [
        'Les cibles historiques divergent des médianes/médoïdes vérifiés',
        `${Object.values(outsideLegacy).reduce((a, b) => a + b, 0)} aliment(s) hors tolérance historique au total (tous groupes)`,
        'Risque de maintenir une équivalence trop large sur des groupes hétérogènes',
      ],
      clientImpact: 'Aucun changement immédiat pour les clients tant que le calculateur reste sur ces cibles',
      existingPlansImpact: 'Plans inchangés',
      calculatorCompatibility: 'maximale',
      migrationsNeeded: ['Documenter que MOYENNES = règles d’affaires', 'Ne pas les présenter comme moyennes statistiques'],
      cursorRecommendation: 'RECOMMANDATION CURSOR — utile comme solution de repli courte durée, pas comme modèle final si l’on veut refléter les 287 valeurs vérifiées; ceci n’est pas une décision.',
      dayVsLegacy: dayDelta(legacyDay, legacyDay),
    }),
    B: base('verified_medians', medians, {
      label: 'Candidat B — Verified medians',
      advantages: [
        'Robuste aux valeurs extrêmes',
        'Fondé uniquement sur les aliments vérifiés',
        'Politique d’arrondi documentée (P/L/F à 0,1 g; G et kcal entiers)',
      ],
      risks: [
        'Profil synthétique pouvant ne correspondre à aucun aliment réel',
        'Changement de cibles pour le calculateur et les plans futurs',
      ],
      clientImpact: 'Les portions « moyennes » affichées/calculées changeraient selon les écarts ci-dessous',
      existingPlansImpact: `Écart journée type vs legacy: ${dayLine({ totals: dayDelta(medianDay, legacyDay) })} (médiane − legacy)`,
      technicalComplexity: 'moyenne',
      calculatorCompatibility: 'requiert mise à jour contrôlée des MOYENNES après décision humaine',
      migrationsNeeded: ['Mettre à jour MOYENNES après approbation', 'Recalculer plans types', 'Mettre à jour textes du guide'],
      cursorRecommendation: 'RECOMMANDATION CURSOR — bon compromis statistique si l’on accepte un profil synthétique; ceci n’est pas une décision.',
      roundingPolicy: {
        proteinG: 1,
        fatG: 1,
        fiberG: 1,
        carbsG: 0,
        declaredKcal: 0,
        method: 'roundHalfAwayFromZero',
      },
      dayVsLegacy: dayDelta(medianDay, legacyDay),
    }),
    C: base('verified_medoids', medoids, {
      label: 'Candidat C — Verified medoids',
      advantages: [
        'Chaque cible correspond à un aliment réel',
        'Évite un profil synthétique inexistant',
        'Sélection déterministe (distance normalisée au vecteur médian)',
      ],
      risks: [
        'Le médoïde peut changer lors d’ajouts futurs',
        'Un seul aliment peut mal représenter un groupe hétérogène',
      ],
      clientImpact: 'Cibles ancrées dans un aliment représentatif nommé',
      existingPlansImpact: `Écart journée type vs legacy: ${dayLine({ totals: dayDelta(medoidDay, legacyDay) })} (médoïde − legacy)`,
      technicalComplexity: 'moyenne',
      calculatorCompatibility: 'requiert mapping aliment → cible groupe',
      migrationsNeeded: ['Publier l’aliment représentatif par groupe', 'Mettre à jour MOYENNES après approbation'],
      cursorRecommendation: 'RECOMMANDATION CURSOR — préférable à B lorsque la traçabilité « aliment réel » est prioritaire; ceci n’est pas une décision.',
      representativeFoods: medoidFoods,
      dayVsLegacy: dayDelta(medoidDay, legacyDay),
    }),
    D: base('exchange_profile_rollup', medians, {
      label: 'Candidat D — Exchange profile rollup',
      advantages: [
        'Utilise exchangeProfileId comme profil réel d’équivalence',
        'Évite d’équivaloir noix/huiles, maigre/gras, laitiers/fromages/boissons, whey/collagène/barres, légumineuses/céréales',
        'Pont explicite vers les groupes calculateur (pas d’explosion inutile d’options UI)',
      ],
      risks: [
        'Complexité métier et produit plus élevée',
        'Nécessite des décisions humaines par pont',
      ],
      clientImpact: 'Meilleure fidélité nutritionnelle; certaines options du calculateur pourraient être affinées',
      existingPlansImpact: 'Plans existants stables jusqu’à migration explicite; nouveaux plans plus précis',
      technicalComplexity: 'élevée',
      calculatorCompatibility: 'pont requis (groupes larges + exceptions)',
      pdfCompatibility: 'guide peut rester par displayCategory; moyennes seulement si profil approuvé',
      migrationsNeeded: [
        'Distinguer noix vs huiles',
        'Protéines maigres vs grasses',
        'Laitiers vs fromages vs boissons végétales',
        'Whey vs collagène vs barres',
        'Légumineuses vs féculents céréaliers',
      ],
      testsNeeded: ['tests de pont calculateur', 'non-équivalence des sous-profils', 'régression PDF', 'garde de périmètre'],
      cursorRecommendation: 'RECOMMANDATION CURSOR — modèle principal recommandé: conserver les groupes calculateur comme pont UI, mais n’approuver aucune cible unique sur les sous-profils signalés non équivalents; ceci n’est pas une décision approuvée.',
      nonEquivalentBridges: ['nuts_vs_oils', 'lean_vs_fatty_protein', 'dairy_cheese_plant_drinks', 'whey_collagen_bars', 'legumes_vs_cereal_starches'],
      proposedCalculatorBridge: {
        keepGroups: ['protein', 'starch', 'vegetable', 'fruit', 'dairy', 'fat', 'whey'],
        doNotShareSingleTargetAcross: [
          'fat-nut-seed vs fat-oil/fat-butter',
          'protein lean vs fatty cuts',
          'dairy milk/yogurt vs cheese vs plant drinks',
          'protein-whey* vs collagen vs bars',
          'starch-legume vs cereal starches',
        ],
      },
      dayVsLegacy: dayDelta(medianDay, legacyDay),
    }),
  };
}

export function buildDecisionsMarkdown(analysis, candidates) {
  const groups = Object.keys(analysis.calculationGroup).sort();
  const valueTable = (candidate) => groups.map((group) => {
    const proposed = candidate.proposedValues[group];
    const legacy = analysis.calculationGroup[group].legacyComparison?.ref;
    const med = analysis.calculationGroup[group].nutrients;
    const medoid = analysis.calculationGroup[group].medoid;
    const outside = analysis.calculationGroup[group].foodsOutsideLegacyTolerance?.count ?? 0;
    return `| ${group} | ${fmtMacro(legacy)} | ${fmtMacro({
      proteinG: med.proteinG.mean,
      carbsG: med.carbsG.mean,
      fatG: med.fatG.mean,
    })} | ${fmtMacro({
      proteinG: med.proteinG.median,
      carbsG: med.carbsG.median,
      fatG: med.fatG.median,
    })} | ${fmtMacro(medoid?.nutrients)} · ${medoid?.nameFr || '—'} | ${fmtMacro(proposed)} | ${outside} |`;
  }).join('\n');

  const outlierLines = groups.flatMap((group) => {
    const cohort = analysis.calculationGroup[group];
    return (cohort.fiveFurthest || []).slice(0, 3).map((food) => `- **${group}**: ${food.nameFr || food.id} (score ${Number(food.distanceScore).toFixed(2)})`);
  }).join('\n');

  const hetero = (analysis.heterogeneityNotes || []).map((note) => `- ${note}`).join('\n') || '- Aucune';

  return `# Décisions requises — profils d’échange

> **APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS.**  
> Document de décision pour une personne non développeuse.  
> Les chiffres ci-dessous sont des **propositions d’analyse**, jamais une approbation.

## 1. État actuel

- **${analysis.meta.totalFoods} aliments** dans la source de vérité, dont **${analysis.meta.verifiedFoods} vérifiés**.
- Statut du jeu de données: **review** (non publié / non approuvé).
- **${analysis.meta.exchangeProfileCount} exchangeProfileId** distincts.
- Groupes calculateur présents: ${groups.join(', ')}.
- Les groupes de calcul restent \`approved: false\` avec \`referenceProfile\` et \`minVerifiedCount\` encore null.
- Le générateur PDF production utilise encore l’objet DATA legacy; l’aperçu de cette PR lit uniquement la source de vérité.
- Les MOYENNES du calculateur n’ont **pas** été modifiées.

## 2. Ce qui bloque l’approbation officielle

1. Aucun \`referenceProfile\` approuvé par groupe.
2. \`minVerifiedCount\` non défini.
3. Jeu de données encore en \`review\`.
4. Pas de choix humain entre les modèles A/B/C/D.
5. Groupes trop hétérogènes pour une seule cible d’équivalence sans pont explicite (voir section 7).
6. Impact client / plans existants non encore signé.

## 3. Comparaison des quatre modèles

| Modèle | Idée | Compat. calculateur | Complexité | Changement clients | Changement plans |
| --- | --- | --- | --- | --- | --- |
| **A Legacy** | Garder les cibles historiques comme **règles d’affaires** | Maximale | Faible | Aucun immédiat | Aucun |
| **B Médianes** | Médianes vérifiées arrondies | Mise à jour requise | Moyenne | Cibles changent | Futurs plans affectés |
| **C Médoïdes** | Aliment réel le plus central | Mise à jour requise | Moyenne | Cibles ancrées à un aliment | Futurs plans affectés |
| **D Rollup** | Profils d’échange + pont calculateur | Pont explicite | Élevée | Plus fidèle | Migration contrôlée |

### Avantages / risques (résumé)

- **A** — ${candidates.A.advantages.join('; ')}. Risques: ${candidates.A.risks.join('; ')}.
- **B** — ${candidates.B.advantages.join('; ')}. Risques: ${candidates.B.risks.join('; ')}.
- **C** — ${candidates.C.advantages.join('; ')}. Risques: ${candidates.C.risks.join('; ')}.
- **D** — ${candidates.D.advantages.join('; ')}. Risques: ${candidates.D.risks.join('; ')}.

## 4. Valeurs exactes proposées

Convention d’affichage: **P = protéines (g) / G = glucides (g) / L = lipides (g)**.

### Candidat A (règles historiques)

| Groupe | Proposition A |
| --- | --- |
${groups.map((g) => `| ${g} | ${fmtMacro(candidates.A.proposedValues[g])} |`).join('\n')}

### Candidat B (médianes arrondies)

| Groupe | Proposition B |
| --- | --- |
${groups.map((g) => `| ${g} | ${fmtMacro(candidates.B.proposedValues[g])} |`).join('\n')}

Politique d’arrondi B: protéines/lipides/fibres à **0,1 g**; glucides et kcal à l’**entier** (\`roundHalfAwayFromZero\`).

### Candidat C (médoïdes réels)

| Groupe | Proposition C | Aliment représentatif |
| --- | --- |
${groups.map((g) => `| ${g} | ${fmtMacro(candidates.C.proposedValues[g])} | ${candidates.C.representativeFoods?.[g]?.nameFr || '—'} |`).join('\n')}

### Candidat D (rollup)

Mêmes cibles numériques de départ que B pour le pont large, **plus** interdiction d’une cible unique sur les ponts non équivalents listés en section 7.

## 5. Écarts avec les anciennes MOYENNES

Lecture du tableau: pour chaque groupe, on compare **A (historique)** · **moyenne statistique** · **médiane** · **médoïde** · **proposition du candidat** · aliments hors tolérance historique.

Tolérances diagnostiques utilisées: P±2 g, G±4 g, L±2 g, fibres±2 g, kcal±15.

### Vue A / stats / B

| Groupe | A historique | Moyenne | Médiane | Médoïde | Prop. B | Hors tolérance |
| --- | --- | --- | --- | --- | --- | --- |
${valueTable(candidates.B)}

> La moyenne et la médiane sont des **statistiques**; A est une **règle d’affaires**. Ne pas les confondre.

## 6. Exemples concrets — journée alimentaire type

Portions utilisées pour l’estimation: **4 protéines, 4 féculents, 3 légumes, 2 fruits, 2 laitiers, 3 lipides, 0 whey**.

| Modèle | Totaux estimés (journée type) |
| --- | --- |
| A Legacy | ${dayLine(candidates.A.typicalDayImpact)} |
| B Médianes | ${dayLine(candidates.B.typicalDayImpact)} |
| C Médoïdes | ${dayLine(candidates.C.typicalDayImpact)} |
| D Rollup (pont large = B) | ${dayLine(candidates.D.typicalDayImpact)} |

Écart B vs A (médiane − legacy): ${dayLine({ totals: candidates.B.dayVsLegacy })}  
Écart C vs A (médoïde − legacy): ${dayLine({ totals: candidates.C.dayVsLegacy })}

Les kcal/fibres absentes des règles historiques restent **non inventées** (affichées « — », jamais transformées en 0).

## 7. Profils ou aliments problématiques

### Hétérogénéité des exchangeProfileId dans les groupes larges

${hetero}

### Points d’attention métier (non équivalents)

- **Noix/graines vs huiles** — même grand groupe lipides, profils d’échange distincts.
- **Protéines maigres vs grasses** — poissons/viandes hétérogènes en lipides.
- **Produits laitiers / fromages / boissons végétales** — densités P/G/L très différentes.
- **Whey / collagène / barres / boissons protéinées** — ne pas fusionner sous une seule cible « whey » ou « protéine ».
- **Légumineuses vs pains/riz/pâtes** — féculents non interchangeables 1:1 sans nuance.

### Aliments les plus éloignés du centre (aperçu)

${outlierLines}

## 8. Recommandation principale

**${candidates.D.cursorRecommendation}**

En pratique, cela signifie:
1. Garder les groupes calculateur comme pont UI.
2. Ne pas approuver automatiquement une moyenne/médiane comme règle d’affaires.
3. Traiter séparément les ponts non équivalents avant toute publication « finale ».

## 9. Solution de repli

**${candidates.A.cursorRecommendation}**

Repli opérationnel: conserver A (legacy) pour le calculateur pendant la revue humaine, tout en publiant seulement l’aperçu SoT **sans** lignes de moyennes non approuvées.

## 10. Cases de décision (à cocher par le propriétaire)

- [ ] **Décision modèle**: A / B / C / D / hybride: ___________
- [ ] J’approuve les valeurs groupe par groupe listées en section 4: ___________
- [ ] J’autorise (ou refuse) une cible unique pour noix+huiles: ___________
- [ ] J’autorise (ou refuse) une cible unique protéines maigres+grasses: ___________
- [ ] J’autorise (ou refuse) une cible unique laitiers+fromages+boissons végétales: ___________
- [ ] J’autorise (ou refuse) une cible unique whey+collagène+barres: ___________
- [ ] J’autorise (ou refuse) une cible unique légumineuses+féculents céréaliers: ___________
- [ ] Impact journée type accepté (section 6): oui / non / avec ajustements ___________
- [ ] Autoriser la mise à jour ultérieure des MOYENNES du calculateur: oui / non
- [ ] Autoriser l’approbation ultérieure de \`calculation-groups.json\`: oui / non
- [ ] Approbateur / date: ____________________________

> Rappel: cocher ces cases **ici** ne modifie aucun fichier de production. Une PR séparée d’approbation sera requise.
`;
}
