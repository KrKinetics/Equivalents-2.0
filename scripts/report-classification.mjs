/**
 * Classification decision support — does NOT move foods.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const OUT_JSON = path.join(ROOT, 'reports', 'classification-review.json');
const OUT_HTML = path.join(ROOT, 'reports', 'classification-review.html');

function flag(food, code, title, detail) {
  return {
    id: food.id,
    nameFr: food.names?.fr,
    nameEn: food.names?.en,
    displayCategory: food.displayCategory,
    calculationGroup: food.calculationGroup,
    exchangeProfileId: food.exchangeProfileId,
    classificationStatus: food.classificationStatus || 'pending',
    code,
    title,
    detail,
  };
}

function main() {
  const payload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const foods = payload.foods || [];
  const items = [];

  for (const f of foods) {
    const hay = `${f.names?.fr} ${f.names?.en} ${f.portion?.labelFr} ${f.portion?.labelEn}`;
    if (/œuf entier|whole egg/i.test(hay) && f.displayCategory === 'matieres_grasses') {
      items.push(flag(f, 'EGG_IN_FAT', 'Œuf entier placé dans matières grasses', 'Décider si exchangeProfile = protein ou fat'));
    }
    if (/fromage|cheese|cheddar|mozzarella|philadelphia|cream cheese/i.test(hay) && f.displayCategory === 'matieres_grasses') {
      items.push(flag(f, 'CHEESE_IN_FAT', 'Fromage placé dans matières grasses', 'Décider du profil d’échange fromage'));
    }
    if (/hummus/i.test(hay) && f.displayCategory === 'noix_graines') {
      items.push(flag(f, 'HUMMUS_IN_NUTS', 'Hummus placé dans noix et graines', 'Décider starch/fat/protein'));
    }
    if (/bouillon d['’]os|bone broth/i.test(hay) && f.displayCategory === 'legumes') {
      items.push(flag(f, 'BROTH_IN_VEGETABLES', 'Bouillon d’os placé dans légumes', 'Décider si légume / autre'));
    }
  }

  items.push({
    id: null,
    code: 'FAT_GROUP_MERGES_NUTS_OILS',
    title: 'Noix et huiles réunies dans calculationGroup=fat',
    detail: 'Les catégories noix_graines et matieres_grasses partagent fat — profils d’échange distincts à décider',
    nameFr: null,
  });
  items.push({
    id: null,
    code: 'PROTEIN_LEAN_FAT_MERGED',
    title: 'Protéines maigres et grasses réunies',
    detail: 'poissons_fruits_mer + viandes_volaille → protein; dispersion lipides élevée attendue',
    nameFr: null,
  });
  items.push({
    id: null,
    code: 'DAIRY_HETEROGENEOUS',
    title: 'Produits laitiers très différents dans un même groupe',
    detail: 'Boissons végétales, yogourts, fromages cottage — un seul dairy peut être insuffisant',
    nameFr: null,
  });

  // Macro outliers vs legacy hardcoded calculator averages (diagnostic only)
  const calcAvg = {
    protein: { p: 9, g: 0, l: 2 },
    starch: { p: 3, g: 18, l: 1 },
    vegetable: { p: 2, g: 7, l: 0 },
    fruit: { p: 1, g: 15, l: 2 },
    dairy: { p: 7, g: 10, l: 2 },
    fat: { p: 1, g: 2, l: 6 },
    whey: { p: 22, g: 2, l: 2 },
  };
  for (const f of foods) {
    const avg = calcAvg[f.calculationGroup];
    if (!avg || f.nutrients?.proteinG == null) continue;
    const dp = Math.abs(f.nutrients.proteinG - avg.p);
    const dg = Math.abs((f.nutrients.carbsG ?? 0) - avg.g);
    const dl = Math.abs((f.nutrients.fatG ?? 0) - avg.l);
    if (dp > 6 || dg > 10 || dl > 5) {
      items.push(
        flag(
          f,
          'FAR_FROM_CALCULATOR_AVG',
          'Macros éloignées de la moyenne calculateur actuelle',
          `ΔP=${dp}, ΔG=${dg}, ΔL=${dl} vs ${f.calculationGroup}`
        )
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Aucun aliment n’a été déplacé. Rapport d’aide à la décision seulement.',
    count: items.length,
    items,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    OUT_HTML,
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Classification review</title>
    <style>body{font-family:system-ui;background:#111;color:#eee;padding:24px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #333;padding:8px;text-align:left}</style></head>
    <body><h1>Revue de classification</h1><p>Aucune modification automatique.</p>
    <table><thead><tr><th>Code</th><th>Titre</th><th>Aliment</th><th>Catégorie</th><th>Groupe</th><th>Détail</th></tr></thead>
    <tbody>${items
      .map(
        (i) =>
          `<tr><td>${i.code}</td><td>${i.title}</td><td>${i.nameFr || '—'}</td><td>${i.displayCategory || '—'}</td><td>${i.calculationGroup || '—'}</td><td>${i.detail}</td></tr>`
      )
      .join('')}</tbody></table></body></html>`
  );
  console.log('Wrote', OUT_JSON, `(${items.length} items)`);
}

main();
