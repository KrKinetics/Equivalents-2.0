# Equivalents 2.0 — KR Kinetics

Source unique des équivalents alimentaires (données), outils d’audit et générateur PDF legacy.

Branche de travail actuelle : `refactor/nutrition-source-of-truth`.

## État actuel

- **207 aliments** bilingues importés depuis le guide legacy (`generate.js` + `i18n.js`)
- **0 verified** — validation manuelle non commencée
- Guide PDF final **non reconnecté** à la nouvelle source
- Calculateur / `MOYENNES` **non modifiés**
- Dataset status : `draft` tant que des erreurs bloquantes existent
- Compteurs d’audit (sémantique) :
  - `foodsWithBlockingErrors` = aliments avec ≥1 ERROR ouverte
  - `foodsWithWarnings` = aliments avec ≥1 WARNING (même s’ils ont aussi une ERROR)
  - `foodsWithWarningsOnly` = WARNING sans ERROR
  - `auditCleanFoods` = aucune ERROR et aucun WARNING
  - `blockingErrorCount` = nombre total d’alertes ERROR (pas le nombre d’aliments)

## Architecture

| Chemin | Rôle |
|--------|------|
| `generate.js` / `i18n.js` | Générateur PDF **legacy** (toujours la source visuelle actuelle) |
| `src/data/food-equivalents.json` | **Source de vérité** des aliments |
| `src/data/food-equivalents.schema.json` | Schéma formel (validé via Ajv) |
| `src/data/calculation-groups.json` | Groupes + `approvalCriteria` (minVerifiedCount null = non approuvé) |
| `src/data/category-mapping.json` | Catégories visibles ↔ groupes |
| `src/data/nutrition-data-version.json` | Version / hash / statut dataset |
| `src/lib/legacy-portion-parser.mjs` | Parseur de portions / noms |
| `src/lib/food-audit-core.mjs` | Moteur d’audit unique (Node + UI) |
| `src/lib/food-status.mjs` | Statut canonique `verification.status` |
| `src/lib/group-statistics.mjs` | Statistiques de dispersion (pas d’auto-approbation) |
| `src/lib/schema-validate.mjs` | Validation Ajv avant `data:apply` |
| `tools/food-data-review.html` | Interface coach de révision |
| `reports/` | Rapports d’audit / classification |
| `backups/` | Sauvegardes horodatées (jamais utilisées par `npm test`) |

### Trois niveaux de classification

1. `displayCategory` — navigation / présentation du guide  
2. `exchangeProfileId` — profil d’échange nutritionnel réel (à décider)  
3. `calculationGroup` — compatibilité temporaire avec le calculateur (`protein`, `starch`, …)

## Commandes npm

```bash
# ONE-TIME ONLY — refuse d’écraser sauf --force (backup auto)
npm run data:bootstrap
npm run data:bootstrap -- --force

# Audit lecture seule des nutriments (met à jour rapports + version meta/hash)
npm run data:audit

# Appliquer un JSON exporté depuis l’UI de révision
npm run data:apply -- chemin/vers/food-equivalents.corrected.json
npm run data:apply -- --dry-run chemin/vers/food-equivalents.corrected.json

# Approbation explicite du dataset (refusée tant que les données ne sont pas prêtes)
npm run data:approve -- --by "Nom"

# Rapports d’aide à la décision
npm run data:report:classification
npm run data:report:prep

# Tests isolés (ne modifient pas les fichiers de production)
npm test

# Génération PDF legacy (inchangée)
npm run generate
```

### Différence bootstrap / audit / révision / apply

| Étape | Effet |
|-------|-------|
| **bootstrap** | Réimporte depuis `generate.js`/`i18n.js`. **Une seule fois.** |
| **audit** | Analyse + rapports. Ne touche pas aux nutriments. |
| **révision UI** | Corrige localement, exporte un JSON. |
| **apply** | Valide le schéma, backup, remplace la source, relance l’audit. |

`data:import` et `data:rebuild` sont **retirés / bloqués** volontairement.

## Sauvegarde

- Toute opération `--force` bootstrap ou `data:apply` crée un fichier dans `backups/`
- Conservez aussi des commits Git avant chaque campagne de correction

## Validation d’un aliment (`verified`)

Conditions **toutes** requises :

- Source authoritative (`source.type` + `source.name`) — **pas** le legacy seul
- Portion complète FR/EN, quantité, unité, lipides totaux
- Aucune ERROR ouverte (les résolutions 4-4-9 documentées restent visibles)
- Bouton **« Marquer verified »** uniquement — le menu ne propose que `unverified` / `rejected`

Si un aliment verified redevient invalide après édition → repasse automatiquement à `unverified`.

### Types de source permis

`canadian_nutrient_file`, `usda_fooddata_central`, `manufacturer_label`, `manufacturer_website`, `peer_reviewed_reference`, `other_authoritative`

## Approbation d’une version dataset

1. Corriger / vérifier les aliments  
2. `npm run data:audit` → statut `review` si 0 erreur bloquante  
3. Action explicite d’approbation (pas encore automatisée en CLI) → `approved`  
4. Toute modification post-approbation via `data:apply` ramène à `review`

Champs version : `version`, `status`, `dataHash`, `shortHash`, `lastAuditedAt`, `lastModifiedAt`, `approvedAt`, `approvedBy`, `previousVersion`, `changeSummary`

## Avertissement critique

**Ne jamais réimporter le legacy** une fois les corrections commencées, sauf restauration contrôlée avec `--force` après backup.

Ne pas :

- corriger silencieusement les nutriments dans les scripts ;
- modifier `MOYENNES` du calculateur depuis ce dépôt ;
- publier un guide « final » tant que le dataset n’est pas `approved`.

## Interface de révision

```bash
npx --yes serve .
# puis ouvrir /tools/food-data-review.html
```

## Prochaine étape recommandée

1. Ouvrir `reports/food-equivalents-audit.html`  
2. Traiter les cas suspects + lipides totaux manquants  
3. Décider les `exchangeProfileId` via `reports/classification-review.html`  
4. Valider aliment par aliment avec sources CNF/USDA/étiquette  
5. Seulement ensuite brancher le générateur PDF et le calculateur
