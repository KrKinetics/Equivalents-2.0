# Rapport de parité — calculateur coach KR Kinetics

**Branche :** `restore/full-coach-calculator`  
**Golden master :** `references/calculateur-coach-original.html`  
**App restaurée :** `coach-calculator/` — URL locale `http://127.0.0.1:4188/`  
**Source nutritionnelle :** 287/287 aliments vérifiés (`coach-calculator/coach-data.json`)  
**Mode production :** A (legacy) — `FEATURE_DA_ENABLED = false`  
**Hashes protégés :** inchangés (`protected-hashes-before.json` = `protected-hashes-after.json`)

## Synthèse

| Domaine | Statut |
|---|---|
| Inventaire golden master vs dépôt | PASS — `parity-baseline.md` |
| Parcours coach complet (sections 1–6) | PASS |
| PDF client FR/EN + tableau 287 | PASS |
| Tests moteur + navigateur + suite dépôt | PASS — 322 pass / 1 skipped |
| Identité visuelle (#071B41 / #ED1136 / logos officiels) | PASS |
| ZIP propriétaire | PASS — `KR_KINETICS_FULL_COACH_CALCULATOR_OWNER_REVIEW.zip` |

## Checklist P0 — preuves

| ID | Statut | Preuve |
|---|---|---|
| P-01 | PASS | `tests/coach-calculator.browser.test.mjs` — save dossier nommé `Client Test Alpha` sous clé `athlete_*` |
| P-02 | PASS | même test — sauvegarde → reload → `chargerProfil` sans perte banque/identité |
| P-03 | PASS | `select among multiple client dossiers` — Alpha âge 31 / Beta âge 42 + banque distincte |
| P-04 | PASS | suppression confirmée (`confirm` stubbé true) + clé absente de `localStorage` |
| P-05 | PASS | `export/import JSON` — `getProfilData` → JSON → `appliquerProfilData` banque identique |
| P-06 | PASS | fixture legacy single-day → `migrateProfilData` → `jours.entrainement` / `jours.repos` |
| P-07 | PASS | `tests/coach-calculator-engine.test.mjs` — conversions kg/lbs et cm/ft-in |
| P-08 | PASS | moteur EER avec facteurs PA (tests homme/femme) + UI `activite` |
| P-09 | PASS | EER/TDEE IOM homme/femme chiffrés vs golden master |
| P-10 | PASS | multiplicateurs 0.8 / 0.9 / 1.0 / 1.1 / 1.2 |
| P-11 | PASS | 8 presets historiques définis et grams distincts |
| P-12 | PASS | macros custom complément à 100 % |
| P-13 | PASS | modes `gkg` et `pct` |
| P-14 | PASS | browser — jour repos vs entraînement banques distinctes |
| P-15 | PASS | `setJourReposActif` + persistance profil v2 |
| P-16 | PASS | 7 catégories banque + capture desktop section banque |
| P-17 | PASS | `suggestBanque` + scénario Xavier portions auto |
| P-18 | PASS | édition manuelle `.target-input` / `.rep-input` (browser + owner capture) |
| P-19 | PASS | `banque totals from portions * MOYENNES` |
| P-20 | PASS | golden master `remettreBanqueAZero` conservé dans build |
| P-21 | PASS | répartition 6 repas — scénario Xavier + `distribuerPortions` |
| P-22 | PASS | totaux distribués / restants via `calculerRepartition` (engine + UI) |
| P-23 | PASS | browser — `classique` / `entrainement` / `equilibre` |
| P-24 | PASS | `heure-entrainement` = 17:30 dans profil Xavier exporté |
| P-25 | PASS | récap nutritionnel par repas dans plan textuel / PDF |
| P-26 | PASS | hydratation 1 L / 1000 kcal + manuel (`hydration` engine + UI) |
| P-27 | PASS | notes coach persistées + présentes plan/PDF Xavier |
| P-28 | PASS | `xavier-plan-text.txt` généré depuis l’état dossier |
| P-29 | PASS | `xavier-plan-client-fr.pdf` + `xavier-plan-client-en.pdf` |
| P-30 | PASS | PDF issu de `buildFullPDFHTML` sur snapshots dossier (pas retapé) |
| P-31 | PASS | `equivalents-client-287.pdf` + guide HTML 287 `data-food-id` |
| P-32 | PASS | tests négatifs marqueurs interdits (plan + guide + engine) |
| P-33 | PASS | logos officiels `naturalWidth > 0` + palette build `#071B41` / `#ED1136` |
| P-34 | PASS | captures `desktop-1440.png` / `tablet-768.png` / `mobile-390.png` + test viewports |
| P-35 | PASS | `COACH_DATA.totalFoods === 287` et `verifiedFoods === 287` |
| P-36 | PASS | `protected-hashes-before.json` / `after.json` — `ok: true`, `changed: []` |
| P-37 | PASS | suite `release-candidate` Mode A + engine coach legacy |
| P-38 | PASS | `FEATURE_DA_ENABLED === false` ; marqueurs A/D-A absents PDF/plan |
| P-39 | PASS | `npm test` → 322 pass / 0 fail / 1 skipped ; coach browser 7 tests |
| P-40 | PASS | inventaire ZIP dans `owner-zip-inventory.json` |

## Scénario Xavier

- Profil : `xavier-profile-export.json` (v2, entraînement + repos)
- TDEE capturé : 3240 kcal (maintien)
- Plan texte : `xavier-plan-text.txt`
- PDF FR/EN + équivalents 287 sous `reports/coach-calculator-restoration/`

## Interdictions respectées

- Aucune mutation des 287 aliments / preuves / règles approuvées
- Aucun contenu interne (diagnostics, A/D-A, rollups) dans les PDF clients
- Aucun test existant supprimé ou affaibli
- PR conservée en brouillon (non Ready, non fusionnée)
