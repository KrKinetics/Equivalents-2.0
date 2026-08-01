# Rapport de validation — KR Kinetics × Elevate Fitness (double marque)

## Résultats

| Contrôle | Résultat |
|---|---|
| `npm test` | PASS — 330 pass, 1 skipped |
| `npm run test:browser` | PASS — 32/32 |
| `npm run nutrition:final-audit` | PASS — `ok: true`, 287 aliments |
| `npm run test:science-audit` | PASS — 64 checks |
| `npm run test:science-ui` | PASS |
| `npm run test:dual-brand` | PASS — 8 PDF scénarios + repos réel |

## Hashes protégés

| Artefact | SHA-256 | Statut |
|---|---|---|
| `coach-calculator/coach-data.json` | `3647d051f1121c60e9bdf7fd67800071e22f1464a02334aed63d332333f4b06d` | inchangé |
| Guide KR PDF | `f418b4ff7d88541bff7e4b39f661b400638faa03677671940995c1bc5114f8fd` | inchangé |

## Scénarios PDF (exigés)

| Fichier | Pages | Contenu vérifié |
|---|---|---|
| `xavier-plan-kr-fr.pdf` | 1 | Jour Entraînement seulement |
| `xavier-plan-kr-en.pdf` | 1 | notes EN; pas de phrase FR d’hydratation |
| `xavier-plan-kr-fr-with-rest.pdf` | 2 | Jour Repos (cyclage des glucides); protéines 2/1/2,5/1/3/1,5; note repos FR |
| `xavier-plan-kr-en-with-rest.pdf` | 2 | Rest Day; protéines réparties; note repos EN |
| `xavier-plan-elevate-fr.pdf` | 1 | exclusif Elevate |
| `xavier-plan-elevate-en.pdf` | 1 | notes EN; exclusif Elevate |
| `xavier-plan-elevate-fr-with-rest.pdf` | 2 | même scénario repos; exclusif Elevate |
| `xavier-plan-elevate-en-with-rest.pdf` | 2 | même scénario repos EN; exclusif Elevate |

## Corrections reprises

- Titre : ÉVALUATION DES HABITUDES & PLANIFICATION ALIMENTAIRE
- Préréglages macros en restant G/L (protéines fixées en section 2)
- Cible alimentaire après arrondi des macros
- Cible initiale de liquides — repère automatique
- Hint créateur : marque exclusive PDF/guide
- Bouton guide dynamique selon la marque
- Plan complet — ajustements à confirmer
- Notes reproduites telles quelles (indication UI)
- Jour de repos : banque + répartition réelles, restant à placer = 0

## Contraintes conservées

- 287 aliments
- Mode A
- D/A désactivé
