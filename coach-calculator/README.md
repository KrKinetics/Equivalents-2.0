# Calculateur Coach — KR Kinetics × Elevate Fitness

## Démarrage en une commande

```bash
npm run coach:preview
```

URL locale exacte : **http://127.0.0.1:4188/**

## Contenu

- Parcours coach complet (golden master restauré)
- Banque A (MOYENNES) par défaut
- 287 aliments vérifiés (guide + tableau client)
- D/A désactivé par défaut (`FEATURE_DA_ENABLED = false`)
- Application coach volontairement co-marquée KR Kinetics et Elevate Fitness
- PDF plan alimentaire client FR/EN avec marque exclusive selon le créateur choisi
- Guide client KR ou Elevate sélectionné automatiquement avec la même marque
- Aucune modification des données nutritionnelles protégées

## Offline

Les dépendances PDF (`html2canvas`, `jsPDF`) sont vendues dans `vendor/`.
Les logos officiels sont dans `assets/`. Le PDF Elevate n'affiche aucune mention ni ressource KR; le PDF KR n'affiche aucune mention ni ressource Elevate.
