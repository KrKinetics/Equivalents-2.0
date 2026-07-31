# Version candidate interactive — KR Kinetics

## Ouvrir maintenant

- **Commande :** `npm run rc:preview`
- **URL locale :** http://127.0.0.1:4177/

## Ce que le propriétaire doit tester

1. Calculateur utilisable (portions par groupe pour le calcul actuel).
2. Basculer entre « Calcul actuel » et « Aperçu personnalisé » sans perdre les entrées.
3. Ajouter des aliments réels au panier et comparer les totaux.
4. Parcourir les guides desktop FR/EN et le guide mobile bilingue.
5. Rechercher / filtrer les 287 aliments.
6. Lire la bannière provisoire et les exceptions (échantillon insuffisant / fallback).
7. Inspecter les diagnostics propriétaire et les PDF candidats.

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

