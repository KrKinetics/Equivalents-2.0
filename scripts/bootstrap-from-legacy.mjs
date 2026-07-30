/**
 * ONE-TIME legacy bootstrap from generate.js + i18n.js.
 *
 * Refuses to overwrite an existing non-empty food-equivalents.json
 * unless --force is provided (creates a timestamped backup first).
 *
 * Does NOT correct nutrient values.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { backupFile } from '../src/lib/backup.mjs';
import { shortName, parsePortion, num } from '../src/lib/legacy-portion-parser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const BACKUPS = path.join(ROOT, 'backups');
const require = createRequire(import.meta.url);

const SECTION_MAP = {
  noix: { displayCategory: 'noix_graines', calculationGroup: 'fat' },
  matiereGrasse: { displayCategory: 'matieres_grasses', calculationGroup: 'fat' },
  legumes: { displayCategory: 'legumes', calculationGroup: 'vegetable' },
  fruits: { displayCategory: 'fruits', calculationGroup: 'fruit' },
  poissons: { displayCategory: 'poissons_fruits_mer', calculationGroup: 'protein' },
  viandes: { displayCategory: 'viandes_volaille', calculationGroup: 'protein' },
  autresProteines: { displayCategory: 'autres_sources_proteinees', calculationGroup: null },
  feculents: { displayCategory: 'feculents', calculationGroup: 'starch' },
  laitier: { displayCategory: 'produits_laitiers', calculationGroup: 'dairy' },
};

const WHEY_PATTERNS = [
  /whey/i,
  /lactos[eé]rum/i,
  /cas[eé]ine/i,
  /isolat/i,
  /prot[eé]ine v[eé]g[eé]tale/i,
  /plant protein/i,
  /beef protein/i,
  /prot[eé]ine de b[oœ]uf/i,
];

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function fatTotal(row) {
  if (row.lip != null) return num(row.lip);
  return null;
}

function resolveCalculationGroup(legacyKey, labelFr, labelEn) {
  const mapped = SECTION_MAP[legacyKey];
  if (legacyKey !== 'autresProteines') return mapped.calculationGroup;
  const text = `${labelFr} ${labelEn}`;
  if (WHEY_PATTERNS.some((re) => re.test(text))) return 'whey';
  return 'protein';
}

function emptySource() {
  return {
    type: null,
    name: null,
    recordId: null,
    url: null,
    accessedAt: null,
    servingDescription: null,
    nutrientsBasis: null,
    notes: null,
    brand: null,
    productName: null,
    labelServingSize: null,
    evidenceRef: null,
  };
}

function loadLegacyData() {
  const src = fs.readFileSync(path.join(ROOT, 'generate.js'), 'utf8');
  const start = src.indexOf('const DATA = {');
  if (start < 0) throw new Error('DATA object not found in generate.js');
  const endMarker = '\nfunction hasLipidGroups';
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error('Could not locate end of DATA in generate.js');
  const objectLiteral = src.slice(start + 'const DATA = '.length, end).trim().replace(/;$/, '');
  const DATA = vm.runInNewContext(`(${objectLiteral})`, {}, { timeout: 5000 });
  const I18N = require(path.join(ROOT, 'i18n.js'));
  return { DATA, FOODS: I18N.FOODS };
}

function existingFoodCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data.foods) ? data.foods.length : 0;
  } catch {
    return 0;
  }
}

function loadPreviousIdMap(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const f of data.foods || []) {
      if (f.legacySectionKey != null && f.legacyIndex != null) {
        map.set(`${f.legacySectionKey}:${f.legacyIndex}`, f.id);
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

function main() {
  const force = process.argv.includes('--force');
  const count = existingFoodCount(OUT_PATH);
  if (count > 0 && !force) {
    console.error(
      `Refusing to overwrite ${OUT_PATH} (${count} foods).\n` +
        `Bootstrap is a ONE-TIME legacy import.\n` +
        `Use --force only after intentional backup (auto-created), or use data:apply for corrections.`
    );
    process.exit(2);
  }

  if (count > 0 && force) {
    const backupPath = backupFile(OUT_PATH, BACKUPS, 'pre-bootstrap-force');
    console.log('Backup created:', backupPath);
  }

  const previousIds = loadPreviousIdMap(OUT_PATH);
  const { DATA, FOODS } = loadLegacyData();
  const foods = [];
  const usedIds = new Set();
  const importNotes = [];

  for (const [legacyKey, section] of Object.entries(DATA)) {
    const meta = SECTION_MAP[legacyKey];
    const enList = FOODS[legacyKey] || [];
    if (enList.length !== section.rows.length) {
      importNotes.push({
        type: 'ERROR',
        message: `Length mismatch ${legacyKey}: FR=${section.rows.length} EN=${enList.length}`,
      });
    }

    section.rows.forEach((row, index) => {
      const labelFr = row.aliment;
      const labelEn = enList[index] || null;
      const nameFr = shortName(labelFr, 'fr');
      const nameEn = labelEn ? shortName(labelEn, 'en') : null;
      const portion = parsePortion(labelFr, labelEn || '');
      const calculationGroup = resolveCalculationGroup(legacyKey, labelFr, labelEn || '');

      let id = previousIds.get(`${legacyKey}:${index}`);
      if (!id) {
        let idBase = `${meta.displayCategory.replace(/_/g, '-')}-${slugify(nameEn || nameFr || labelFr)}`;
        id = idBase;
        let n = 2;
        while (usedIds.has(id)) id = `${idBase}-${n++}`;
      }
      usedIds.add(id);

      foods.push({
        id,
        legacySectionKey: legacyKey,
        legacyIndex: index,
        displayCategory: meta.displayCategory,
        calculationGroup,
        exchangeProfileId: null,
        classificationStatus: 'pending',
        names: { fr: nameFr, en: nameEn },
        portion: {
          labelFr: portion.labelFr,
          labelEn: portion.labelEn,
          amount: portion.amount,
          unit: portion.unit,
          grams: portion.grams,
          amountEn: portion.amountEn,
          unitEn: portion.unitEn,
          gramsEn: portion.gramsEn,
          preparationState: portion.preparationState,
          brandSpecific: portion.brandSpecific,
          brand: portion.brand,
        },
        nutrients: {
          proteinG: num(row.prot),
          carbsG: num(row.gluc),
          fiberG: num(row.fib),
          fatG: fatTotal(row),
          saturatedFatG: num(row.sat),
          polyunsaturatedFatG: num(row.poly),
          monounsaturatedFatG: num(row.mono),
          declaredKcal: num(row.cal),
        },
        legacySource: {
          reference: 'Imported from generate.js DATA / i18n.js FOODS (legacy guide)',
          referenceId: `${legacyKey}[${index}]`,
          notes: 'Legacy import only — does not satisfy verified requirements.',
        },
        source: emptySource(),
        status: 'unverified',
        version: 1,
        verification: {
          status: 'unverified',
          verifiedAt: null,
          verifiedBy: null,
          datasetVersion: null,
        },
        auditResolutions: [],
        history: [
          {
            at: new Date().toISOString(),
            action: 'bootstrap_import',
            by: 'scripts/bootstrap-from-legacy.mjs',
          },
        ],
      });
    });
  }

  const payload = {
    meta: {
      schemaVersion: 2,
      importedAt: new Date().toISOString(),
      sourceFiles: ['generate.js', 'i18n.js'],
      importPolicy: 'no_silent_nutrient_correction',
      bootstrapWarning: 'ONE-TIME ONLY. Prefer data:apply for corrections. Never use data:rebuild.',
      totalFoods: foods.length,
      notes: importNotes,
    },
    foods,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Bootstrapped ${foods.length} foods → ${OUT_PATH}`);
  if (importNotes.length) console.log('Import notes:', importNotes);
}

main();
