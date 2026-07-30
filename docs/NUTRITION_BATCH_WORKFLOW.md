# Workflow des lots nutritionnels approuvés

Ce dépôt applique les corrections nutritionnelles via un **moteur de lots JSON**,
sans modifier le calculateur ni les aliments hors périmètre.

## Prérequis

```bash
npm ci
npm run schema:check
npm run sources:cnf:sync
```

Les données CNF normalisées sont dans :

- `src/sources/normalized/cnf-2026-foods.json`
- `src/sources/normalized/cnf-2026-metadata.json`

## 1. Créer un nouveau lot JSON

Copier le modèle :

```bash
copy src\data\approved-batches\template-batch.json src\data\approved-batches\mon-lot.json
```

Renseigner `batchId`, `approvedBy`, `approvedAt`, `status: approved_for_implementation`,
et le `scope` (comptages + `allowedFoodIds`).

## 2. Choisir les IDs

- `operation: "update"` : l’ID doit déjà exister dans `food-equivalents.json`
- `operation: "add"` : l’ID doit être absent
- Tous les IDs du lot doivent figurer dans `scope.allowedFoodIds`
- Pendant un pilote actif, seuls les IDs autorisés du `nutrition-pilot-config.json` peuvent changer

## 3. Ajouter ou mettre à jour

Chaque entrée exige :

- `lockedIdentity` bilingue + `preparationState`
- `canonicalPortion`
- `classification`
- soit un `sourcePlan` CNF, soit un `manufacturerLabel`

## 4b. Verrouillage expectedRecordId

Pour tout aliment CNF des lots futurs, renseigner :

```json
"expectedRecordId": "1498"
```

Le moteur sélectionne exactement ce record, vérifie mustContain / mustNotContain,
et échoue avec :

- `EXPECTED_CNF_RECORD_MISSING`
- `EXPECTED_CNF_RECORD_NOT_FOUND`
- `EXPECTED_CNF_RECORD_INCOMPATIBLE`
- `EXPECTED_CNF_RECORD_MISMATCH`

## 4c. Garde-fou de périmètre du lot

```bash
npm run nutrition:batch:scope -- src/data/approved-batches/mon-lot.json
```

Produit `scope-baseline.json` et `scope-check-final.json` sous `reports/batches/<batchId>/`.

Exemple minimal :

```json
"sourcePlan": {
  "adapter": "cnf_2026",
  "matchKeywordsEn": ["blueberry", "raw"],
  "mustContainConcepts": ["blueberry", "raw"],
  "mustNotContainConcepts": ["frozen", "wild"],
  "ambiguityRule": "Choisir l'entrée cultivée/générique crue."
}
```

Conversion :

`valeurPortion = valeurPar100g × portionGrammes / 100`

## 5. Source fabricant (produit de marque)

Fournir `manufacturerLabel` avec URL, date, `labelServing` (amount/unit et grams optionnels),
valeurs originales, puis soit :

- `derivedUnroundedForCanonicalPortion` + `storedForCanonicalPortion` (poudres, barres, wraps, liquides), ou
- `derivedUnroundedPer100Ml` + `storedPer100Ml` (bouteilles RTD historiques Fairlife).

Conversion canonique (ordre strict) :

1. même unité normalisée (`g`, `ml`, `scoop`, `tbsp`, `wrap`, `bar`, pluriels inclus) → ratio des amounts;
2. sinon ratio des grammes si les deux poids sont disponibles;
3. sinon échec explicite (`MANUFACTURER_CONVERSION_UNSUPPORTED`).

`null` = nutriment non déclaré; `0` = zéro réellement déclaré. Ne jamais convertir `null` en `0`
(`MANUFACTURER_UNKNOWN_COERCED_TO_ZERO`).

Créer une preuve :

```bash
node scripts/write-fairlife-evidence.mjs
node scripts/write-now-mct-evidence.mjs
node scripts/write-other-protein-manufacturer-evidence.mjs
node scripts/write-dairy-manufacturer-evidence.mjs
```

Schéma : `src/data/manufacturer-evidence.schema.json`

## 6. Valider

```bash
npm run nutrition:batch:validate -- src/data/approved-batches/mon-lot.json
```

## 7. Prévisualiser

```bash
npm run nutrition:batch:preview -- src/data/approved-batches/mon-lot.json
```

Sorties :

- `reports/batches/<batchId>/preview.html`
- `reports/batches/<batchId>/preview.json`
- `reports/batches/<batchId>/preview.csv`

## 8. Corriger le lot

Si la validation échoue (sélection CNF, comptages, schéma), corriger **uniquement**
le JSON du lot, puis revalider.

## 9. Dry-run

```bash
npm run nutrition:batch:apply -- --dry-run src/data/approved-batches/mon-lot.json
```

Aucun fichier de production n’est modifié.

## 10. Appliquer

```bash
npm run nutrition:batch:apply -- src/data/approved-batches/mon-lot.json
```

Le moteur :

1. crée un backup
2. applique via `applyFoodChange`
3. documente les résolutions 4-4-9 nécessaires
4. crée des transactions `verify`
5. écrit atomiquement banque + version
6. relance l’audit et `pilot:check`

## 11. Auditer

```bash
npm run data:audit
npm run pilot:check
```

## 12. Archiver

Conserver :

- le JSON du lot dans `src/data/approved-batches/`
- les sélections CNF dans `src/data/source-selections/`
- les preuves fabricant dans `src/sources/manufacturer/`
- les rapports dans `reports/batches/<batchId>/`

Marquer éventuellement `status: applied` dans le JSON du lot.

---

## Exemples complets

### Aliment générique CNF

Voir `fruits-blueberries` dans
`src/data/approved-batches/pilot-nutrition-validation-6-foods.json`.

### Produit de marque

Voir `autres-sources-proteinees-core-power-fairlife` (chocolat) dans le même fichier.

### Nouvel aliment

Voir `autres-sources-proteinees-core-power-fairlife-elite-vanilla-42g`
(`operation: "add"`).

### Résolution calorique

Si l’audit signale un écart 4-4-9 légitime, le moteur ajoute une
`auditResolutions` citant le `recordId` CNF ou l’URL fabricant, puis vérifie.

---

## Commandes du prochain lot

```bash
npm run sources:cnf:sync
npm run nutrition:batch:validate -- src/data/approved-batches/NEXT.json
npm run nutrition:batch:preview -- src/data/approved-batches/NEXT.json
npm run nutrition:batch:apply -- --dry-run src/data/approved-batches/NEXT.json
npm run test:nutrition
npm run nutrition:batch:apply -- src/data/approved-batches/NEXT.json
npm run data:audit
npm run pilot:check
```

Aucun changement de code n’est requis si le lot respecte le schéma
`approved-nutrition-batch.schema.json`.
