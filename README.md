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
| `src/data/food-equivalents.schema.json` | Schéma formel (Ajv, `additionalProperties: false` sur structures contrôlées) |
| `src/data/calculation-groups.json` | Groupes + `approvalCriteria` (minVerifiedCount null = non approuvé) |
| `src/data/category-mapping.json` | Catégories visibles ↔ groupes |
| `src/data/nutrition-data-version.json` | Version / hash / statut dataset |
| `src/lib/food-audit-core.mjs` | Moteur d’audit unique (Node + UI) |
| `src/lib/source-validators.mjs` | Dates ISO, URI HTTP(S), DOI, basis, champs significatifs |
| `src/lib/food-change.mjs` | `applyFoodChange` — historique + invalidation `verified` |
| `src/lib/dataset-governance.mjs` | Exports périmés, semver, garde-fous `data:apply` |
| `src/lib/food-status.mjs` | Statut canonique `verification.status` |
| `tools/food-data-review.html` | Interface coach de révision |
| `reports/` | Rapports d’audit / classification |
| `backups/` | Sauvegardes horodatées (jamais utilisées par `npm test`) |
| `releases/data/` | Archives immuables créées par `data:approve` |

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
# Export périmé (dernier recours) — backup + raison obligatoire
npm run data:apply -- --allow-stale --reason "…" chemin/vers/export.json

# Approbation explicite du dataset (CLI) — refusée tant que non prêt
npm run data:approve -- --by "Nom" --bump patch
npm run data:approve -- --by "Nom" --bump minor --summary "…"
npm run data:approve -- --by "Nom" --bump major

# Rapports d’aide à la décision
npm run data:report:classification
npm run data:report:prep

# Tests isolés (ne modifient pas les fichiers de production)
npm test
npm run test:browser
npm run test:all

# Génération PDF legacy (inchangée)
npm run generate
```

### Différence bootstrap / audit / révision / apply / approve

| Étape | Effet |
|-------|-------|
| **bootstrap** | Réimporte depuis `generate.js`/`i18n.js`. **Une seule fois.** |
| **audit** | Analyse + rapports. Ne touche pas aux nutriments. |
| **révision UI** | Corrige localement, exporte un JSON avec hashes. |
| **apply** | Valide schéma + gouvernance (dont `baseDataHash`), backup, remplace, relance l’audit. |
| **approve** | Si tous les garde-fous passent : bump semver, archive `releases/data/<version>/`, écrit atomiquement. |

### `data:import`

`npm run data:import` **existe** comme alias CLI, mais il est **volontairement bloqué** (déprécié). Ce n’est pas une commande absente : elle refuse d’importer le legacy. Utilisez `data:bootstrap` (one-time) ou `data:apply` (corrections).

`data:rebuild` a été retiré.

## Sources authoritative

`source.type` + `source.name` **ne suffisent jamais**.

Exigences communes quand les champs sont présents :

| Champ | Règle |
|-------|--------|
| `accessedAt` | Date ISO `YYYY-MM-DD` calendaire, **non future** |
| `url` | URI `http` ou `https` valide |
| `doi` | DOI `10.xxxx/…` ou URL `doi.org` |
| `nutrientsBasis` | Enum obligatoire pour CNF/USDA : `as_consumed`, `as_purchased`, `dry`, `cooked`, `label_serving`, `unknown` |

Par type :

- **canadian_nutrient_file / usda_fooddata_central** — `recordId` exploitable (pas `x`/`-`/`test`), `servingDescription` décrivant une portion/base en g, `nutrientsBasis` non null, `accessedAt` valide.
- **manufacturer_label** — `evidenceRef` (chemin, URL ou id), `brand`, `productName`, `labelServingSize` significatifs, `servingDescription` = portion d’étiquette.
- **manufacturer_website** — brand/productName + URL HTTPS + serving + date.
- **peer_reviewed_reference** — name + (recordId \| URL \| DOI) + serving + date.
- **other_authoritative** — name + (URL \| recordId) + date + notes justificatives.

## Résolutions d’audit (`auditResolutions`)

États : `open` | `invalid` | `stale` | `resolved_documented`.

`fieldsHash` est **obligatoire**. Une résolution `invalid` ou `stale` **ne retire jamais** une ERROR.

Schéma (propriétés inconnues interdites) :

```json
{
  "code": "...",
  "reason": "...",
  "approvedBy": "...",
  "approvedAt": "...",
  "sourceReferenceId": "...",
  "fieldsHash": "...",
  "createdAt": "...",
  "version": 1
}
```

## Invalidation automatique de `verified`

Toute modification de `names`, `portion`, `nutrients`, `source`, `displayCategory`, `calculationGroup`, `exchangeProfileId`, `classificationStatus` repasse l’aliment à `unverified` **immédiatement**, même si l’audit resterait « compatible ».

Conservés dans `history` : `verifiedAt` / `verifiedBy` précédents. Les champs actifs de vérification sont remis à `null`. `food.version` est incrémenté.

Seuls les changements administratifs sans effet données (note, export, affichage UI) peuvent conserver `verified`.

## Historique et transactions

Helper central : `applyFoodChange(food, change)`.

Chaque transaction inscrit : timestamp, utilisateur/rôle, action, chemin, ancienne/nouvelle valeur, raison, `versionBefore` / `versionAfter`.

Une seule incrémentation de `food.version` par transaction logique. L’UI regroupe les frappes (blur / debounce) pour éviter des centaines d’entrées.

`data:apply` refuse : diminution de version, troncature d’historique, disparition d’une vérification antérieure, modification matérielle sans bump de version (sauf `--migration-documented`).

## Protection contre les exports périmés

Meta d’export UI :

- `baseDataHash` — hash de la base chargée dans l’interface
- `exportDataHash` — hash du contenu exporté
- `exportedAt` / `exportedBy` / `sourceDatasetVersion`

À l’apply : le hash actuel de la base doit égaler `baseDataHash`. Sinon le fichier est **périmé** (refus clair, **pas** de `--force` automatique).

`--allow-stale --reason "…"` : backup, avertissement majeur, raison obligatoire, inscription dans `changeSummary`.

## Versionnement dataset

| Bump | Usage |
|------|--------|
| **patch** | Correction de valeur, traduction ou portion sans changement de schéma |
| **minor** | Nouveaux aliments, profils ou catégorie compatible |
| **major** | Changement incompatible du schéma ou de la logique des équivalents |

`data:approve --bump patch|minor|major` archive sous `releases/data/<version>/` : JSON, rapport d’audit, hash, `approvedBy`, `approvedAt`, `changeSummary`, `previousVersion`. Backup + écriture atomique.

## Sauvegarde

- Toute opération `--force` bootstrap, `data:apply`, `--allow-stale` ou `data:approve` crée un fichier dans `backups/`
- Conservez aussi des commits Git avant chaque campagne de correction

## Validation d’un aliment (`verified`)

Conditions **toutes** requises :

- Source authoritative **complète** selon le type (voir ci-dessus) — **pas** le legacy seul, **pas** type+name seuls
- Portion complète FR/EN, quantité, unité, lipides totaux
- Aucune ERROR ouverte (`resolved_documented` uniquement peut neutraliser une ERROR résoluble)
- Bouton **« Marquer verified »** uniquement — le menu ne propose que `unverified` / `rejected`

## Interface de révision

```bash
npx --yes serve .
# puis ouvrir /tools/food-data-review.html
```

- Import JSON : `auditDataset` avant init ; `DUPLICATE_ID` → refus, pas de `state.data` / `byId`
- Après export réussi : `originals` mis à jour, `dirty` vidé, `lastExportAt` / `lastExportHash`, `beforeunload` silencieux jusqu’à la prochaine modif

## Avertissement critique

**Ne jamais réimporter le legacy** une fois les corrections commencées, sauf restauration contrôlée avec `--force` après backup.

Ne pas :

- corriger silencieusement les nutriments dans les scripts ;
- modifier `MOYENNES` du calculateur depuis ce dépôt ;
- publier un guide « final » tant que le dataset n’est pas `approved`.

## Prochaine étape recommandée

1. Ouvrir `reports/food-equivalents-audit.html`  
2. Traiter les cas suspects + lipides totaux manquants  
3. Décider les `exchangeProfileId` via `reports/classification-review.html`  
4. Valider aliment par aliment avec sources CNF/USDA/étiquette  
5. Seulement ensuite brancher le générateur PDF et le calculateur
