# Rapport de validation — KR Kinetics × Elevate Fitness (double marque)

## Résultats

| Contrôle | Résultat |
|---|---|
| `npm test` | PASS (330 pass, 1 skipped) |
| `npm run test:browser` | PASS (32/32) |
| `npm run nutrition:final-audit` | PASS (`ok: true`, 287 aliments) |
| `npm run test:science-audit` | PASS (64 checks) |
| `npm run test:science-ui` | PASS |
| `npm run test:dual-brand` | PASS (inclus dans `test:browser`) |

## Hashes protégés

| Artefact | SHA-256 | Statut |
|---|---|---|
| `coach-calculator/coach-data.json` | `3647d051f1121c60e9bdf7fd67800071e22f1464a02334aed63d332333f4b06d` | inchangé |
| Guide KR PDF | `f418b4ff7d88541bff7e4b39f661b400638faa03677671940995c1bc5114f8fd` | inchangé |

## Double marque

- En-tête coach : grand logo KR à gauche + logo Elevate complet à droite
- Sélection exclusive de marque PDF (KR ou Elevate)
- PDF / guide Elevate : aucune mention « KR Kinetics », « logo-kr », « projet conjoint »
- Guide Elevate distinct (`elevate-fitness-equivalents-client-fr`)
- FR / EN, avec et sans jour de repos
- Captures 1440 / 768 / 390 px

## Contraintes conservées

- 287 aliments
- Mode A
- D/A désactivé
