# Parité — inventaire baseline (avant restauration)

Date : 2026-07-31  
Branche de travail : `restore/full-coach-calculator`  
Base : `origin/refactor/nutrition-source-of-truth`  
Golden master : `references/calculateur-coach-original.html`  
SHA-256 golden master : `de02cd2da62e440c60415b521e4a5103422f2ab8a8c10b0aadd7401c7be5be02`

## Hashes protégés (avant)

Méthode : SHA-256 normalisé LF (`src/lib/rc-data-protection.mjs`)

| Fichier | SHA-256 |
|---|---|
| `src/data/food-equivalents.json` | `b4125e985418701ed4d9e4d51a6c8bfdb0685030bbd1e729e9fb89cef6daa3d3` |
| `src/data/nutrition-data-version.json` | `5d2c0a04fe73b1b6d7c26307e1e3bbbe90ca733ad799ff0f0be079bb0ebb09c5` |
| `src/data/category-mapping.json` | `efe4dcb4ffa304dbb3ac735b92c5602f4eb30452206c8afb521db598f743776c` |
| `src/data/calculation-groups.json` | `ec10ef42e64d1c260c3bf3d4e1d9a4e59ce8f8c0b26e9b37c065451a89a2f131` |
| `reports/exchange-profile-decision/exchange-rollup-proposal.json` | `1e4b0c7da55ff52d504e75ab88100880b70f18497ff774b46d0aa6cba1a81c0f` |

État : OK — aucun drift au démarrage.

## Inventaire golden master (fonctions obligatoires)

### 1. Profil athlète
- Nom complet (`nom_athlete`)
- Sauvegarder / charger liste / supprimer avec confirmation
- Export JSON / import JSON
- Clés `localStorage` : `athlete_<nom>`
- Migration legacy → profil v2 (jours entraînement + repos)

### 2. Données et objectifs
- Sexe, âge, poids (lb/kg), grandeur (cm / ft+in)
- Activité : sédentaire, léger, modéré, actif
- EER/TDEE IOM (formules homme/femme + PA)
- Objectifs : −20 %, −10 %, maintien, +10 %, +20 %
- 8 presets macros historiques + mode personnalisé (total 100 %)
- Protéine g/kg (défaut/min 2,0) ou % calories

### 3. Jours
- Jour entraînement / jour repos
- Toggle plan repos on/off
- Banques, répartitions, hydratation et timing indépendants
- Alertes d’incomplétude par jour

### 4. Banque (7 catégories, moteur A / MOYENNES)
- pro, fec, leg, fru, lai, lip, whey
- Auto (`suggererBanque`), manuel, reset
- Totaux et écarts P/G/L/kcal (±50 kcal / ±5 g)

### 5. Répartition (6 repas)
- Déjeuner, Collation AM, Dîner, Collation PM, Souper, Collation soirée
- Distribué / restant
- Modes Classique, Selon entraînement, Équilibré
- Heure d’entraînement + Pré/Post
- Récap nutritionnel par repas + édition manuelle

### 6. Export
- Hydratation 1 L / 1000 kcal + ajout manuel
- Notes coach
- Créateur PDF KR / Elevate
- Langue FR / EN
- Plan textuel + PDF client (html2canvas + jsPDF)
- Pied de page guide des équivalents

## Comparaison au code actuel (dépôt)

| Capacité golden master | Présent dans le dépôt avant restauration |
|---|---|
| Calculateur coach complet | **ABSENT** (seulement golden master dans le mandat) |
| Profils `athlete_*` | **ABSENT** |
| EER/TDEE + objectifs + presets | **ABSENT** (UI) |
| Banque 7 cat. + répartition 6 repas | **ABSENT** (UI) |
| PDF plan client | **ABSENT** (UI) |
| Moteur A MOYENNES | Présent (`category-mapping.json`, `calculation-engine.mjs`) |
| 287 aliments vérifiés | Présent (`food-equivalents.json`) |
| Guide équivalents PDF | Présent (`guide:preview`, RC) |
| Comparateur A/D-A simplifié | Présent (`reports/release-candidate`) — **non référence UI** |

## Décisions de restauration

1. Le golden master est le point de départ UI/comportement.
2. La RC simplifiée n’est pas reprise comme interface.
3. Les 287 aliments alimentent le guide / tableau d’équivalents, pas le flux portions.
4. D/A : feature flag **désactivé par défaut**, absent du PDF client.
5. Bug golden master signalé (conservé puis corrigé) : restauration repos utilise `jours.repartition` au lieu de `jours.repos.repartition` — correction obligatoire pour P-02/P-14.

## Signaux / éléments à conserver même s’ils semblent secondaires

- Créateur Elevate Fitness dans le PDF (présent dans le golden master)
- Preset interne `performance` (fallback timing)
- Non-distribution automatique de `pro` dans `repartirAutomatique`
- Emoji de statut / sections (densité opérationnelle du golden master)
