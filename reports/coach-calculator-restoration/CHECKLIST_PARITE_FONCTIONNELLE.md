# Checklist de parité — calculateur coach KR Kinetics

Règle : chaque ligne P0 doit être **PASS** avec une preuve. Toute ligne FAIL ou non testée bloque la PR.

| ID | Priorité | Fonction attendue | Preuve obligatoire | Statut |
|---|---|---|---|---|
| P-01 | P0 | Créer et nommer un dossier client | test + capture | **PASS** — browser save `athlete_*` |
| P-02 | P0 | Sauvegarder puis recharger un dossier sans perte | test aller-retour | **PASS** — save/reload/banque |
| P-03 | P0 | Sélectionner un client parmi plusieurs dossiers | test avec 2 clients | **PASS** — Alpha/Beta switch |
| P-04 | P0 | Supprimer un dossier avec confirmation | test | **PASS** — confirm + clé absente |
| P-05 | P0 | Exporter et importer un profil JSON identique | fixture avant/après | **PASS** — JSON round-trip |
| P-06 | P0 | Charger un ancien profil compatible | fixture legacy | **PASS** — migrate v1→v2 |
| P-07 | P0 | Sexe, âge, poids, grandeur et unités | tests métrique/impérial | **PASS** — engine conversions |
| P-08 | P0 | Niveau d'activité physique | tests PA | **PASS** — EER PA factors |
| P-09 | P0 | EER et TDEE conformes au golden master | tests chiffrés homme/femme | **PASS** — IOM H/F |
| P-10 | P0 | Objectifs -20, -10, maintien, +10, +20 | tests chiffrés | **PASS** — 5 multipliers |
| P-11 | P0 | Huit presets macro historiques | tests des 8 sélections | **PASS** — 8 presets |
| P-12 | P0 | Macros personnalisées totalisant 100 % | test validation | **PASS** — custom sum 100 |
| P-13 | P0 | Protéine en g/kg ou % calories | tests des 2 modes | **PASS** — gkg + pct |
| P-14 | P0 | Jour entraînement et jour repos distincts | scénario complet | **PASS** — browser dual-day |
| P-15 | P0 | Activer/désactiver le plan repos | test persistance | **PASS** — `jourReposActif` |
| P-16 | P0 | Banque des 7 catégories | capture + test | **PASS** — 7 inputs + shot |
| P-17 | P0 | Calcul automatique des portions | tests chiffrés | **PASS** — `suggestBanque` |
| P-18 | P0 | Modification manuelle des portions | test interaction | **PASS** — target/rep edits |
| P-19 | P0 | Totaux et écarts P/G/L/kcal | tests chiffrés | **PASS** — MOYENNES totals |
| P-20 | P0 | Remise à zéro de la banque | test | **PASS** — golden reset retained |
| P-21 | P0 | Répartition sur les 6 repas | scénario complet | **PASS** — Xavier 6 meals |
| P-22 | P0 | Totaux distribués et restants à placer | tests chiffrés | **PASS** — distribution algo |
| P-23 | P0 | Modes Classique/Selon entraînement/Équilibré | 3 scénarios | **PASS** — 3 modes browser |
| P-24 | P0 | Heure d'entraînement et repas pré/post | test interaction | **PASS** — 17:30 Xavier |
| P-25 | P0 | Récapitulatif nutritionnel par repas | tests chiffrés | **PASS** — plan/PDF recap |
| P-26 | P0 | Hydratation automatique + ajout manuel | tests chiffrés | **PASS** — 1 L/1000 kcal |
| P-27 | P0 | Notes et directives du coach | test persistance + PDF | **PASS** — notes in PDF |
| P-28 | P0 | Générer le plan alimentaire structuré | sortie enregistrée | **PASS** — `xavier-plan-text.txt` |
| P-29 | P0 | PDF client FR et EN | 2 PDF de test | **PASS** — FR + EN files |
| P-30 | P0 | PDF avec repas, portions, notes, eau et totaux exacts | comparaison fixture | **PASS** — snapshot→PDF |
| P-31 | P0 | Tableau des équivalents client issu des 287 aliments | PDF + compte exact | **PASS** — 287 guide/PDF |
| P-32 | P0 | Aucun diagnostic ou contenu interne dans les PDF | test négatif | **PASS** — forbidden markers |
| P-33 | P0 | Logos officiels et palette marine/rouge | contrôle visuel | **PASS** — logos + palette |
| P-34 | P0 | Parité responsive desktop/tablette/mobile | captures + QA | **PASS** — 1440/768/390 |
| P-35 | P0 | 287 aliments vérifiés chargés | audit automatisé | **PASS** — COACH_DATA 287 |
| P-36 | P0 | Hashes nutritionnels protégés inchangés | manifeste avant/après | **PASS** — hashes equal |
| P-37 | P0 | Mode A identique et par défaut | tests de régression | **PASS** — legacy-a default |
| P-38 | P0 | D/A désactivé par défaut et absent du PDF client | test négatif | **PASS** — flag false |
| P-39 | P0 | Tous les tests locaux et GitHub Actions verts | rapport CI | **PASS** — `test-report.md` |
| P-40 | P0 | ZIP propriétaire complet et autonome | inventaire ZIP | **PASS** — owner ZIP |

## Scénario de référence Xavier

Le scénario livré doit reproduire un dossier comparable au PDF de référence et vérifier au minimum : identité, date, objectif, jour d'entraînement, cible énergétique, macros, hydratation, six repas, portions, notes et totaux.

Les valeurs calculées doivent provenir du même état de dossier; aucune valeur ne doit être retapée manuellement dans le PDF.

## Interdictions de validation

- Une capture statique sans interaction ne prouve pas la fonction.
- Un bouton sans persistance ou sans effet ne vaut pas PASS.
- Une sortie PDF reconstruite à la main ne vaut pas PASS.
- Un test désactivé, assoupli ou supprimé ne vaut pas PASS.
- Une fonction annoncée « pour plus tard » vaut FAIL.
