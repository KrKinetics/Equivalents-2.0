# Proposition de rollups d’échange (non approuvée)

> **APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS**  
> Document de décision seulement. Aucune donnée de production ni MOYENNES modifiées.

## Modèle retenu : HYBRIDE D/A DE TRANSITION

- **D** = architecture cible à long terme (profils d’échange + familles intermédiaires + pont calculateur).
- **A** = règle d’affaires temporaire du calculateur actuel et des plans existants.
- **B** = point de départ statistique uniquement à l’intérieur de familles comparables.
- **C** = ne pas utiliser comme modèle principal.
- Dataset demeure en `review`; `calculation-groups.json` non approuvé dans cette PR.

## Pourquoi ne pas brancher les 157 exchangeProfileId directement

- 157 profils d’échange, dont **122 singletons**.
- Relier chaque singleton au calculateur ferait exploser les options UI sans gain d’équivalence.
- Proposition : couche intermédiaire `exchangeRollupId` / `calculatorBridgeProfileId` (**28** familles proposées).

## Règles déterministes lean / moderate-fat / fatty

- **fatty** si le profil matche: fatty, high-fat, with-skin, ribs, ground-beef-regular/medium, lamb, duck, pork-standard, pork-ribs, processed-meat-high-fat.
- **moderate** si: moderate-fat, processed-seafood, processed-poultry.
- **lean** par défaut pour les autres profils protéine, y compris les lean documentés (extra-lean / lean ground beef, pork-lean, game-lean, lean fish/shellfish).
- Les barres = uniquement `protein-bar-*` (jamais une sous-chaîne `bar` qui matcherait `barley`).
- Les boissons végétales = `dairy-alternative-*` (jamais `includes('oat')` qui matcherait `goat`).
- Les boissons protéinées laitières = `dairy-protein-shake-*` → `rollup-dairy-protein-rtd` (jamais lait/yogourt ordinaire).

## Séparations obligatoires (refus d’une cible unique)

- **nuts_vs_oils** — Noix/graines ≠ huiles
  - Mutuellement exclusifs: `rollup-nuts-seeds`, `rollup-nut-seed-butter`, `rollup-oils-spreads`
- **lean_vs_fatty_protein** — Protéines maigres ≠ grasses
  - Mutuellement exclusifs: `rollup-protein-lean`, `rollup-protein-moderate-fat`, `rollup-protein-fatty`
- **dairy_family_splits** — Lait/yogourt ≠ fromages frais ≠ fromages ≠ boissons végétales ≠ boissons protéinées laitières
  - Mutuellement exclusifs: `rollup-dairy-milk-yogurt`, `rollup-dairy-fresh-cheese`, `rollup-dairy-cheese`, `rollup-dairy-plant-drink`, `rollup-dairy-protein-rtd`
- **whey_collagen_bars_rtd** — Whey ≠ collagène ≠ barres ≠ boissons protéinées (protéine ou laitier)
  - Mutuellement exclusifs: `rollup-whey-powders`, `rollup-collagen-incomplete`, `rollup-protein-bars`, `rollup-protein-rtd`, `rollup-dairy-protein-rtd`
- **legumes_vs_cereal_starches** — Légumineuses ≠ pains/riz/pâtes
  - Mutuellement exclusifs: `rollup-starch-legume`, `rollup-starch-cereal`

## Cas whey

Le groupe calculateur `whey` existe dans calculation-groups.json et dans les MOYENNES historiques, mais aucun aliment n’a actuellement `calculationGroup: "whey"`. Les produits whey portent des `exchangeProfileId` `protein-whey-*` tout en restant classés `calculationGroup: "protein"`. C’est pourquoi les statistiques B/C/D du groupe whey sont vides (0 observation), alors que des produits whey existent bien dans la banque.

Pont proposé (sans mutation production) : `exchangeRollupId=rollup-whey-powders → calculatorGroup=whey (future approval only)`.

## Familles proposées (28)

| exchangeRollupId | Aliments | Profils sources | Échantillon insuffisant (<3) | Pont calculateur | Médiane P/G/L |
| --- | ---: | ---: | --- | --- | --- |
| rollup-chestnut | 1 | 1 | oui | starch | P 1 / G 15.9 / L 0.7 |
| rollup-collagen-incomplete | 1 | 1 | oui | — | P 9 / G 0 / L 0 |
| rollup-dairy-cheese | 3 | 3 | non | dairy | P 9.6 / G 1.2 / L 2.5 |
| rollup-dairy-fresh-cheese | 4 | 4 | non | dairy | P 12.15 / G 4.7 / L 2.05 |
| rollup-dairy-milk-yogurt | 15 | 15 | non | dairy | P 8.5 / G 6.8 / L 1.65 |
| rollup-dairy-plant-drink | 6 | 6 | non | dairy | P 1.35 / G 9 / L 2.25 |
| rollup-dairy-protein-rtd | 1 | 1 | oui | dairy | P 13 / G 4 / L 2.3 |
| rollup-fat-cheese-portion | 3 | 1 | non | fat | P 3.5 / G 1.2 / L 4.4 |
| rollup-fat-chocolate | 2 | 1 | oui | fat | P 0.7 / G 4.9 / L 4.05 |
| rollup-fat-egg | 2 | 1 | oui | fat | P 4.3 / G 0.75 / L 5.3 |
| rollup-fruit-standard | 33 | 1 | non | fruit | P 0.9 / G 15 / L 0.2 |
| rollup-granola | 1 | 1 | oui | starch | P 4.5 / G 15.9 / L 7.3 |
| rollup-legume-spread | 1 | 1 | oui | fat | P 2.4 / G 4.7 / L 5.5 |
| rollup-nut-seed-butter | 5 | 2 | non | fat | P 1.9 / G 2.3 / L 5.4 |
| rollup-nuts-seeds | 22 | 5 | non | fat | P 1.8 / G 1.65 / L 4.9 |
| rollup-oils-spreads | 16 | 8 | non | fat | P 0 / G 0 / L 5.95 |
| rollup-protein-bars | 1 | 1 | oui | protein | P 10 / G 12 / L 3 |
| rollup-protein-fatty | 18 | 10 | non | protein | P 7.15 / G 0 / L 3.85 |
| rollup-protein-lean | 70 | 42 | non | protein | P 9.75 / G 0 / L 1.2 |
| rollup-protein-moderate-fat | 4 | 3 | non | protein | P 9.75 / G 0.65 / L 2.4 |
| rollup-protein-rtd | 4 | 3 | non | protein | P 10.05 / G 2.05 / L 0.85 |
| rollup-soy-legume-snack | 2 | 2 | oui | protein | P 8.75 / G 7.5 / L 4.95 |
| rollup-starch-cereal | 30 | 30 | non | starch | P 2.65 / G 17.55 / L 0.6 |
| rollup-starch-legume | 3 | 3 | non | starch | P 8.9 / G 23.7 / L 0.5 |
| rollup-vegetable-higher-carb | 6 | 1 | non | vegetable | P 1.25 / G 7.4 / L 0.1 |
| rollup-vegetable-juice | 2 | 1 | oui | vegetable | P 2.45 / G 10.3 / L 0.85 |
| rollup-vegetable-non-starchy | 28 | 6 | non | vegetable | P 1 / G 4.7 / L 0.2 |
| rollup-whey-powders | 3 | 3 | non | whey | P 12.5 / G 1 / L 0.5 |

## Statut

- `approved: false` pour tous les rollups.
- Aucune application automatique au calculateur.
- Les plans existants restent sur la règle d’affaires **A** jusqu’à décision ultérieure.
