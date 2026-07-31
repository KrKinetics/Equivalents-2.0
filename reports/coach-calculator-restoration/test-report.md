# Rapport des tests — restauration calculateur coach

**Date :** 2026-07-31  
**Branche :** `restore/full-coach-calculator`

## Commandes

```bash
npm test
npm run test:browser   # inclut coach-calculator.browser.test.mjs
npm run coach:capture
```

## Résultats `npm test`

- **322** pass
- **0** fail
- **1** skipped
- durée ≈ 19 s

Les tests coach moteur (`tests/coach-calculator-engine.test.mjs`, 21 cas) sont inclus dans `npm test`.

## Tests navigateur coach

Fichier : `tests/coach-calculator.browser.test.mjs`

| Test | Résultat |
|---|---|
| logos, 287 foods, DA disabled | PASS |
| save / reload / delete dossier without loss | PASS |
| select among multiple client dossiers | PASS |
| export/import JSON and legacy profile compatibility | PASS |
| training/rest days, distribution modes, hydration, plan text | PASS |
| client equivalents guide 287 + no forbidden markers | PASS |
| responsive viewports | PASS |

## Protection données nutritionnelles

- `protected-hashes-before.json` : ok
- `protected-hashes-after.json` : ok, `changed: []`
- test `protected nutrition files match RC baseline hashes` : PASS

## Artifacts owner

Voir `capture-summary.json` et `KR_KINETICS_FULL_COACH_CALCULATOR_OWNER_REVIEW.zip`.
