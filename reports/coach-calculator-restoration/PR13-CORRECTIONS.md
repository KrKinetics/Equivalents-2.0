# PR #13 — Corrections ciblées (audit owner ZIP)

## 1. Logo PDF FR/EN

- Logo horizontal officiel embarqué en **data URI base64** dans le HTML imprimé
- Affiché en blanc (`filter: brightness(0) invert(1)`) sur bandeau marine `#071B41`
- Attente explicite du chargement/décodage des images avant html2canvas / Puppeteer PDF
- Test navigateur : aucune image brisée (`naturalWidth > 0`) avant génération

## 2. Jour de repos non configuré

- Si le toggle repos est actif mais **aucune répartition** n’est renseignée, la page repos est **omise** du PDF client
- Le plan textuel indique clairement l’omission (pas de total 0 kcal présenté comme plan valide)
- Export PDF autorisé en 1 page dans ce cas
- Tests : repos vide → 1 page ; repos configuré → 2 pages

## 3. Réconciliation des totaux

Origine de l’écart documentée :
- **Cible** = formule macro (grammes arrondis → kcal)
- **Banque** = portions × moyennes, arrondi global P/G/L puis kcal
- **Planifié** = arrondi P/G/L **par repas** puis somme (source principale banque ≠ planifié)

Le PDF affiche désormais cible, total planifié, variance (kcal + macros), banque en référence, et une note d’origine. Seuils explicites : `kcal ≤ 50`, `P/G/L ≤ 5 g`.

## 4. Polissage mobile (390 px)

- Cibles tactiles ≥ 44 px, textes essentiels ≥ 14 px
- Indication visible de défilement horizontal sur les tableaux (`.table-h-scroll`)
- Workflow desktop inchangé

## Contraintes respectées

- Hashes nutritionnels protégés inchangés
- 287 aliments, mode A, D/A désactivé
- PR #13 demeure en brouillon — non fusionnée
