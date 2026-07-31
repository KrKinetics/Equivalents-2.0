# Version candidate interactive — KR Kinetics

## Ouvrir maintenant

- **Commande :** `npm run rc:preview`
- **URL locale :** http://127.0.0.1:4177/

## Ce que le propriétaire doit tester

1. Calculateur utilisable (portions par groupe).
2. Basculer entre « Mode actuel — règles KR Kinetics » et « Aperçu précision — profils d’échange » sans perdre les entrées.
3. Voir les totaux A et D/A côte à côte et comprendre les écarts.
4. Parcourir le guide desktop FR et le guide mobile bilingue.
5. Rechercher / filtrer les 287 aliments.
6. Lire les avertissements « Valeurs provisoires non approuvées » / « Échantillon insuffisant ».
7. Inspecter les scénarios d’acceptation et les PDF candidats.

## Limites connues

- Mode D/A non approuvé pour la production.
- Les slots par groupe en D/A utilisent le rollup dominant stable (aperçu) sauf si un aliment précis est sélectionné via les scénarios côté moteur.
- Les familles à échantillon insuffisant (10) ne peuvent pas générer un plan exploitable en D/A : retour explicite à A.
- Aucune migration automatique des plans existants.

## Confirmation

Ce build **ne modifie aucun client**, aucune donnée nutritionnelle individuelle, aucune MOYENNE de production, ni aucun plan sauvegardé.

- Scénarios : 10/10 PASS
- Protection données : OK
- Visual QA : PASS

