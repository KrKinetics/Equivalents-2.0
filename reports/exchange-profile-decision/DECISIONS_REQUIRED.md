# Décisions requises — profils d’échange

> **APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS / PREVIEW — UNAPPROVED EXCHANGE PROFILES**  
> Document de décision pour une personne non développeuse.  
> Les chiffres ci-dessous sont des **propositions d’analyse**, jamais une approbation de production.

## Décision du propriétaire (consignée)

**Modèle retenu : HYBRIDE D/A DE TRANSITION.**

- **D** = architecture cible à long terme (profils d’échange → familles `exchangeRollupId` → pont calculateur).
- **A** = règle d’affaires temporaire du calculateur actuel et des plans existants.
- **B** = point de départ statistique seulement dans des familles nutritionnellement comparables.
- **C** = ne doit pas devenir le modèle principal.
- Aucune MOYENNE de production modifiée dans cette PR.
- `calculation-groups.json` non approuvé; dataset demeure en **review**.

Refus explicite d’une cible unique pour :
1. noix/graines + huiles;
2. protéines maigres + protéines grasses;
3. lait/yogourt + fromages + boissons végétales;
4. whey + collagène + barres + boissons protéinées;
5. légumineuses + pains/riz/pâtes et autres féculents céréaliers.

Voir aussi `EXCHANGE_ROLLUP_PROPOSAL.md` (couche intermédiaire non approuvée).

## 1. État actuel

- **287 aliments** dans la source de vérité, dont **287 vérifiés**.
- Statut du jeu de données: **review** (non publié / non approuvé).
- **157 exchangeProfileId** distincts.
- Groupes calculateur présents: dairy, fat, fruit, protein, starch, vegetable, whey.
- Observations du groupe calculateur `whey`: **0** (voir section whey / rollup proposal — les produits whey sont classés `protein` via `protein-whey-*`).
- Les groupes de calcul restent `approved: false` avec `referenceProfile` et `minVerifiedCount` encore null.
- Le générateur PDF production utilise encore l’objet DATA legacy; l’aperçu de cette PR lit uniquement la source de vérité.
- Les MOYENNES du calculateur n’ont **pas** été modifiées.

## 2. Ce qui bloque l’approbation officielle

1. Aucun `referenceProfile` approuvé par groupe.
2. `minVerifiedCount` non défini.
3. Jeu de données encore en `review`.
4. Couche `exchangeRollupId` encore à l’état de proposition (non branchée).
5. Groupes trop hétérogènes pour une seule cible d’équivalence sans pont explicite (voir section 7).
6. Impact client / plans existants non encore migré hors de la règle A.

## 3. Comparaison des quatre modèles

| Modèle | Idée | Compat. calculateur | Complexité | Changement clients | Changement plans |
| --- | --- | --- | --- | --- | --- |
| **A Legacy** | Garder les cibles historiques comme **règles d’affaires** | Maximale | Faible | Aucun immédiat | Aucun |
| **B Médianes** | Médianes vérifiées arrondies | Mise à jour requise | Moyenne | Cibles changent | Futurs plans affectés |
| **C Médoïdes** | Aliment réel le plus central | Mise à jour requise | Moyenne | Cibles ancrées à un aliment | Futurs plans affectés |
| **D Rollup** | Profils d’échange + pont calculateur | Pont explicite | Élevée | Plus fidèle | Migration contrôlée |

### Avantages / risques (résumé)

- **A** — Conserve le comportement actuel du calculateur; Aucune migration de plans existants; Décrit clairement les cibles comme règles d’affaires (pas comme moyennes statistiques). Risques: Les cibles historiques divergent des médianes/médoïdes vérifiés; 108 aliment(s) hors tolérance historique au total (tous groupes); Risque de maintenir une équivalence trop large sur des groupes hétérogènes.
- **B** — Robuste aux valeurs extrêmes; Fondé uniquement sur les aliments vérifiés; Politique d’arrondi documentée (P/L/F à 0,1 g; G et kcal entiers). Risques: Profil synthétique pouvant ne correspondre à aucun aliment réel; Changement de cibles pour le calculateur et les plans futurs.
- **C** — Chaque cible correspond à un aliment réel; Évite un profil synthétique inexistant; Sélection déterministe (distance normalisée au vecteur médian). Risques: Le médoïde peut changer lors d’ajouts futurs; Un seul aliment peut mal représenter un groupe hétérogène.
- **D** — Utilise exchangeProfileId comme profil réel d’équivalence; Évite d’équivaloir noix/huiles, maigre/gras, laitiers/fromages/boissons, whey/collagène/barres, légumineuses/céréales; Pont explicite vers les groupes calculateur (pas d’explosion inutile d’options UI). Risques: Complexité métier et produit plus élevée; Nécessite des décisions humaines par pont.

## 4. Valeurs exactes proposées

Convention d’affichage: **P = protéines (g) / G = glucides (g) / L = lipides (g)**.

### Candidat A (règles historiques)

| Groupe | Proposition A |
| --- | --- |
| dairy | P 7 / G 10 / L 2 |
| fat | P 1 / G 2 / L 6 |
| fruit | P 1 / G 15 / L 2 |
| protein | P 9 / G 0 / L 2 |
| starch | P 3 / G 18 / L 1 |
| vegetable | P 2 / G 7 / L 0 |
| whey | P 22 / G 2 / L 2 |

### Candidat B (médianes arrondies)

| Groupe | Proposition B |
| --- | --- |
| dairy | P 8.5 / G 6 / L 2.3 |
| fat | P 1.3 / G 2 / L 5.3 |
| fruit | P 0.9 / G 15 / L 0.2 |
| protein | P 9.2 / G 0 / L 1.7 |
| starch | P 2.8 / G 18 / L 0.6 |
| vegetable | P 1.1 / G 5 / L 0.2 |
| whey | P — / G — / L — |

Politique d’arrondi B: protéines/lipides/fibres à **0,1 g**; glucides et kcal à l’**entier** (`roundHalfAwayFromZero`).

### Candidat C (médoïdes réels)

| Groupe | Proposition C | Aliment représentatif |
| --- | --- |
| dairy | P 9 / G 5 / L 2.5 | Lait Natrel Plus 2 % sans lactose |
| fat | P 1.2 / G 1 / L 5.2 | Noix de Grenoble |
| fruit | P 1 / G 15 / L 0.2 | Cerises douces fraîches, crues |
| protein | P 9.3 / G 0 / L 1.7 | Turbot européen cuit au four ou grillé |
| starch | P 2.6 / G 18 / L 0.8 | Millet cuit |
| vegetable | P 1.1 / G 5 / L 0.2 | Tomate rouge mûre, fraîche et crue |
| whey | P — / G — / L — | — |

### Candidat D (rollup)

Mêmes cibles numériques de départ que B pour le pont large, **plus** interdiction d’une cible unique sur les ponts non équivalents listés en section 7.

## 5. Écarts avec les anciennes MOYENNES

Lecture du tableau: pour chaque groupe, on compare **A (historique)** · **moyenne statistique** · **médiane** · **médoïde** · **proposition du candidat** · aliments hors tolérance historique.

Tolérances diagnostiques utilisées: P±2 g, G±4 g, L±2 g, fibres±2 g, kcal±15.

### Vue A / stats / B

| Groupe | A historique | Moyenne | Médiane | Médoïde | Prop. B | Hors tolérance |
| --- | --- | --- | --- | --- | --- | --- |
| dairy | P 7 / G 10 / L 2 | P 8.1345 / G 7.4607 / L 2.5786 | P 8.5 / G 5.6 / L 2.25 | P 9 / G 4.5 / L 2.5 · Lait Natrel Plus 2 % sans lactose | P 8.5 / G 6 / L 2.3 | 29 |
| fat | P 1 / G 2 / L 6 | P 1.4216 / G 1.6059 / L 5.4784 | P 1.3 / G 1.5 / L 5.3 | P 1.2 / G 1.1 / L 5.2 · Noix de Grenoble | P 1.3 / G 2 / L 5.3 | 9 |
| fruit | P 1 / G 15 / L 2 | P 0.9606 / G 15 / L 0.2909 | P 0.9 / G 15 / L 0.2 | P 1 / G 15.2 / L 0.2 · Cerises douces fraîches, crues | P 0.9 / G 15 / L 0.2 | 0 |
| protein | P 9 / G 0 / L 2 | P 9.1893 / G 1.168 / L 2.266 | P 9.2 / G 0 / L 1.7 | P 9.3 / G 0 / L 1.7 · Turbot européen cuit au four ou grillé | P 9.2 / G 0 / L 1.7 | 45 |
| starch | P 3 / G 18 / L 1 | P 3.5543 / G 18.5743 / L 1.0914 | P 2.8 / G 17.7 / L 0.6 | P 2.6 / G 17.8 / L 0.8 · Millet cuit | P 2.8 / G 18 / L 0.6 | 16 |
| vegetable | P 2 / G 7 / L 0 | P 1.4556 / G 5.5139 / L 0.2694 | P 1.1 / G 4.9 / L 0.2 | P 1.1 / G 4.8 / L 0.2 · Tomate rouge mûre, fraîche et crue | P 1.1 / G 5 / L 0.2 | 9 |
| whey | P 22 / G 2 / L 2 | P — / G — / L — | P — / G — / L — | P — / G — / L — · — | P — / G — / L — | 0 |

> La moyenne et la médiane sont des **statistiques**; A est une **règle d’affaires**. Ne pas les confondre.

## 6. Exemples concrets — journée alimentaire type

Portions utilisées pour l’estimation: **4 protéines, 4 féculents, 3 légumes, 2 fruits, 2 laitiers, 3 lipides, 0 whey**.

| Modèle | Totaux estimés (journée type) |
| --- | --- |
| A Legacy | P 73 g · G 149 g · L 38 g · — kcal |
| B Médianes | P 74 g · G 135 g · L 30.699999999999996 g · 1112 kcal |
| C Médoïdes | P 74.5 g · G 130 g · L 31.6 g · 1078 kcal |
| D Rollup (pont large = B) | P 74 g · G 135 g · L 30.699999999999996 g · 1112 kcal |

Écart B vs A (médiane − legacy): P 1 g · G -14 g · L -7.3 g · — kcal  
Écart C vs A (médoïde − legacy): P 1.5 g · G -19 g · L -6.4 g · — kcal

Les kcal/fibres absentes des règles historiques restent **non inventées** (affichées « — », jamais transformées en 0).

## 7. Profils ou aliments problématiques

### Hétérogénéité des exchangeProfileId dans les groupes larges

- dairy: dairy-alternative-almond-unsweetened (1), dairy-alternative-almond-vanilla (1), dairy-alternative-oat-quinoa (1), dairy-alternative-rice-unsweetened (1), dairy-alternative-soy-unsweetened (1), dairy-alternative-soy-vanilla (1), dairy-cheese-6-percent (1), dairy-cheese-allegro-9 (1), dairy-cheese-swiss-light (1), dairy-cottage-1 (1), dairy-cottage-2 (1), dairy-filtered-milk-fairlife-2 (1), dairy-goat-milk-whole (1), dairy-greek-yogurt-0 (1), dairy-greek-yogurt-2 (1), dairy-greek-yogurt-fruit-0 (1), dairy-high-protein-chocolate-milk (1), dairy-high-protein-milk-natrel-2 (1), dairy-kefir-fruit-low-fat (1), dairy-kefir-plain-low-fat (1), dairy-milk-2 (1), dairy-milk-skim (1), dairy-milk-whole (1), dairy-protein-shake-core-power-26 (1), dairy-quark-fat-free (1), dairy-ricotta-light (1), dairy-skyr-0 (1), dairy-yogurt-fat-free-plain (1), dairy-yogurt-low-fat-plain (1)
- fat: fat-avocado (1), fat-butter-spread (3), fat-cheese (3), fat-chocolate (2), fat-coconut (1), fat-dressing (1), fat-egg (2), fat-fish-oil (1), fat-legume-spread (1), fat-mayonnaise (2), fat-mct-oil (1), fat-mixed-nuts (1), fat-nut-butter (3), fat-nut-seed (13), fat-oil (5), fat-olive (2), fat-seed (5), fat-seed-butter (2), fat-seed-high-fibre (2)
- protein: protein-bar-high-fibre (1), protein-beef-fatty-steak (1), protein-beef-isolate (1), protein-beef-lean-steak (2), protein-beef-standard (1), protein-canned-chicken (1), protein-canned-fish (2), protein-canned-fish-lean (2), protein-casein-micellar (1), protein-chicken-dark-meat (2), protein-chicken-with-skin (1), protein-collagen-incomplete (1), protein-deli-ham (1), protein-duck (1), protein-egg-substitute-powder (1), protein-egg-white-cooked (1), protein-egg-white-wrap (1), protein-fat-soy-nut (1), protein-fatty-fish (8), protein-fish-moderate-fat (2), protein-game-lean (8), protein-ground-beef-extra-lean (1), protein-ground-beef-lean (1), protein-ground-beef-medium (1), protein-ground-beef-regular (1), protein-ground-poultry (2), protein-ground-veal (1), protein-jerky (1), protein-lamb (1), protein-lean-animal (1), protein-lean-fish (10), protein-liquid-egg-white (1), protein-mollusk (3), protein-mollusk-lean (3), protein-natto (1), protein-pea-isolate (1), protein-plant-edamame (1), protein-plant-soy-generic (1), protein-pork-lean (2), protein-pork-ribs (1), protein-pork-standard (1), protein-powdered-peanut (1), protein-processed-meat-high-fat (2), protein-processed-poultry (1), protein-processed-seafood (1), protein-ready-to-drink (2), protein-rice (1), protein-rtd-muscle-milk (1), protein-rtd-premier (1), protein-seafood-specialty (1), protein-seitan-branded (1), protein-shellfish-lean (3), protein-smoked-fish (1), protein-smoked-turkey (1), protein-soy-isolate (1), protein-tempeh (1), protein-tempeh-cooked (1), protein-tofu-extra-firm (1), protein-tofu-firm (1), protein-tofu-silken-firm (1), protein-turkey (1), protein-veal (1), protein-whey-generic (1), protein-whey-hydrolysate (1), protein-whey-isolate (1)
- starch: starch-bread-bagel (1), starch-bread-bun (1), starch-bread-english-muffin (1), starch-bread-ezekiel-original (1), starch-bread-pita-whole-wheat (1), starch-bread-rye (1), starch-bread-sprouted-generic (1), starch-bread-whole-wheat (1), starch-breakfast-cereal-cheerios (1), starch-chestnut (1), starch-cooked-grain (1), starch-cooked-grain-barley (1), starch-cooked-grain-buckwheat (1), starch-cooked-grain-bulgur (1), starch-cooked-grain-couscous (1), starch-cooked-grain-millet (1), starch-corn (1), starch-fat-granola (1), starch-legume-black-bean (1), starch-legume-chickpea (1), starch-legume-lentil (1), starch-oatmeal-instant-dry (1), starch-oatmeal-prepared (1), starch-oats-dry (1), starch-pasta-enriched (1), starch-pasta-whole-wheat (1), starch-potato-boiled (1), starch-potato-mashed-milk (1), starch-rice-brown (1), starch-rice-cake (1), starch-rice-white (1), starch-root-jerusalem-artichoke (1), starch-sweet-potato (1), starch-tortilla-corn (1), starch-tortilla-flour (1)
- vegetable: vegetable-aromatic (4), vegetable-broth (1), vegetable-cruciferous (3), vegetable-higher-carb (6), vegetable-juice (2), vegetable-leafy (3), vegetable-mushroom (3), vegetable-standard (14)

### Points d’attention métier (non équivalents)

- **Noix/graines vs huiles** — même grand groupe lipides, profils d’échange distincts.
- **Protéines maigres vs grasses** — poissons/viandes hétérogènes en lipides.
- **Produits laitiers / fromages / boissons végétales** — densités P/G/L très différentes.
- **Whey / collagène / barres / boissons protéinées** — ne pas fusionner sous une seule cible « whey » ou « protéine ».
- **Légumineuses vs pains/riz/pâtes** — féculents non interchangeables 1:1 sans nuance.

### Aliments les plus éloignés du centre (aperçu)

- **dairy**: Boisson de riz nature non sucrée, enrichie (score 1.10)
- **dairy**: Lait entier homogénéisé 3,25 % M.G. (score 0.90)
- **dairy**: Lait de chèvre entier 3,25 % M.G., enrichi (score 0.84)
- **fat**: Œuf de poule entier, cuit dur (score 0.62)
- **fat**: Graines de chia séchées, moulues ou entières (score 0.60)
- **fat**: Noix mélangées avec arachides, rôties à sec, sans sel ajouté (score 0.50)
- **fruit**: Framboises fraîches, crues (score 0.80)
- **fruit**: Mûres fraîches, crues (score 0.78)
- **fruit**: Baies de goji séchées (score 0.30)
- **protein**: Edamames bouillis et égouttés (score 1.69)
- **protein**: Barre protéinée Quest Chocolate Brownie (score 1.60)
- **protein**: Natto de soya fermenté (score 1.15)
- **starch**: Pois chiches mûrs, bouillis (score 1.17)
- **starch**: Haricots noirs mûrs, bouillis (score 1.10)
- **starch**: Granola maison (score 0.99)
- **vegetable**: Artichaut globe bouilli et égoutté (score 1.35)
- **vegetable**: Asperges bouillies et égouttées (score 0.90)
- **vegetable**: Cocktail de jus de légumes régulier (score 0.76)

## 8. Recommandation / décision principale

**Décision propriétaire : HYBRIDE D/A DE TRANSITION** (architecture D, règle temporaire A).

En pratique, cela signifie:
1. Conserver A pour le calculateur et les plans existants (inchangés).
2. Construire la couche D via `exchangeRollupId` (voir `EXCHANGE_ROLLUP_PROPOSAL.md`), sans brancher les 157 profils un par un.
3. Utiliser B seulement à l’intérieur de familles comparables; ne pas promouvoir C comme modèle principal.
4. Ne jamais présenter la règle d’affaires A comme une moyenne statistique.

## 9. Solution de repli

Si la couche D n’est pas prête : rester sur **A** exclusivement pour le calculateur, tout en maintenant l’aperçu SoT sans moyennes non approuvées.

## 10. Cases de décision

- [x] **Décision modèle**: HYBRIDE D/A DE TRANSITION
- [ ] J’approuve des valeurs groupe par groupe pour une future PR d’approbation: ___________
- [x] Je **refuse** une cible unique pour noix+huiles
- [x] Je **refuse** une cible unique protéines maigres+grasses
- [x] Je **refuse** une cible unique laitiers+fromages+boissons végétales
- [x] Je **refuse** une cible unique whey+collagène+barres/boissons protéinées
- [x] Je **refuse** une cible unique légumineuses+féculents céréaliers
- [ ] Impact journée type accepté pour une migration future: oui / non / avec ajustements ___________
- [x] **Ne pas** modifier les MOYENNES dans cette PR
- [x] **Ne pas** approuver `calculation-groups.json` dans cette PR
- [ ] Approbateur / date de la future PR d’application: ____________________________

> Rappel: cette consignation **ne modifie aucun fichier de production**. Une PR séparée sera requise pour brancher le calculateur.
