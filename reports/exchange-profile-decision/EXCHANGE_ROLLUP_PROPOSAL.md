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
- Proposition : couche intermédiaire `exchangeRollupId` / `calculatorBridgeProfileId` (21 familles proposées).

## Séparations obligatoires (refus d’une cible unique)

- **nuts_vs_oils** — Noix/graines ≠ huiles
- **lean_vs_fatty_protein** — Protéines maigres ≠ grasses
- **dairy_splits** — Lait/yogourt ≠ fromages ≠ boissons végétales
- **whey_vs_collagen_bars** — Whey ≠ collagène ≠ barres ≠ boissons protéinées
- **legumes_vs_cereal_starches** — Légumineuses ≠ pains/riz/pâtes

## Cas whey

Le groupe calculateur `whey` existe dans calculation-groups.json et dans les MOYENNES historiques, mais aucun aliment n’a actuellement `calculationGroup: "whey"`. Les produits whey portent des `exchangeProfileId` `protein-whey-*` tout en restant classés `calculationGroup: "protein"`. C’est pourquoi les statistiques B/C/D du groupe whey sont vides (0 observation), alors que des produits whey existent bien dans la banque.

Pont proposé (sans mutation production) : `exchangeRollupId=rollup-whey-powders → calculatorGroup=whey (future approval only)`.

## Familles proposées

| exchangeRollupId | Aliments | Profils sources | Échantillon insuffisant (<3) | Pont calculateur | Médiane P/G/L |
| --- | ---: | ---: | --- | --- | --- |
| rollup-collagen-incomplete | 1 | 1 | oui | — | P 9 / G 0 / L 0 |
| rollup-dairy-cheese | 3 | 3 | non | dairy | P 9.6 / G 1.2 / L 2.5 |
| rollup-dairy-milk-yogurt | 19 | 19 | non | dairy | P 10.8 / G 5.7 / L 1.65 |
| rollup-dairy-plant-drink | 7 | 7 | non | dairy | P 1.7 / G 10.3 / L 2.3 |
| rollup-fat-cheese-portion | 3 | 1 | non | fat | P 3.5 / G 1.2 / L 4.4 |
| rollup-fat-other | 4 | 2 | non | fat | P 1.75 / G 2.75 / L 4.65 |
| rollup-fruit-standard | 33 | 1 | non | fruit | P 0.9 / G 15 / L 0.2 |
| rollup-nut-seed-butter | 5 | 2 | non | fat | P 1.9 / G 2.3 / L 5.4 |
| rollup-nuts-seeds | 27 | 10 | non | fat | P 1.8 / G 2 / L 4.9 |
| rollup-oils-spreads | 16 | 8 | non | fat | P 0 / G 0 / L 5.95 |
| rollup-protein-bars | 2 | 2 | oui | protein | P 5.85 / G 16.6 / L 1.65 |
| rollup-protein-fatty | 11 | 3 | non | protein | P 7.1 / G 0 / L 3.5 |
| rollup-protein-lean | 79 | 51 | non | protein | P 9.3 / G 0 / L 1.3 |
| rollup-protein-moderate-fat | 2 | 1 | oui | protein | P 10.6 / G 0 / L 2.4 |
| rollup-protein-rtd | 4 | 3 | non | protein | P 10.05 / G 2.05 / L 0.85 |
| rollup-starch-cereal | 29 | 29 | non | starch | P 2.7 / G 17.4 / L 0.6 |
| rollup-starch-legume | 3 | 3 | non | starch | P 8.9 / G 23.7 / L 0.5 |
| rollup-vegetable-higher-carb | 6 | 1 | non | vegetable | P 1.25 / G 7.4 / L 0.1 |
| rollup-vegetable-juice | 2 | 1 | oui | vegetable | P 2.45 / G 10.3 / L 0.85 |
| rollup-vegetable-non-starchy | 28 | 6 | non | vegetable | P 1 / G 4.7 / L 0.2 |
| rollup-whey-powders | 3 | 3 | non | whey | P 12.5 / G 1 / L 0.5 |

## Statut

- `approved: false` pour tous les rollups.
- Aucune application automatique au calculateur.
- Les plans existants restent sur la règle d’affaires **A** jusqu’à décision ultérieure.
