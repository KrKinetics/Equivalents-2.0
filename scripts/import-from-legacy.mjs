/**
 * Import legacy guide data (generate.js DATA + i18n.js FOODS)
 * into src/data/food-equivalents.json WITHOUT correcting nutrient values.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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

function num(v) {
  if (v == null || v === '' || v === '—' || v === '-') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function shortName(label, lang) {
  let s = String(label)
    .replace(/^\d+[.,]?\d*\s*(ml|g|mg|oz)\s+(de\s+|d'|d’)?/i, '')
    .replace(/^[½⅓¼⅙⅞]\s*/u, '')
    .replace(/^\d+\s*/u, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = String(label).trim();
  // Prefer a readable food name; keep accents
  if (lang === 'fr') {
    s = s.replace(/^de\s+/i, '').replace(/^d['’]/i, '');
  }
  return s;
}

function parsePortion(labelFr, labelEn) {
  const label = labelFr || '';
  const gramsMatch =
    label.match(/\((\d+[.,]?\d*)\s*g\)/i) ||
    label.match(/(\d+[.,]?\d*)\s*g\b/i);
  const mlMatch = label.match(/(\d+[.,]?\d*)\s*ml\b/i);
  const cupMatch = label.match(/([½⅓¼¾]|0?[,.]?\d+)\s*tasse/i);
  const tbspMatch = label.match(/(\d+[.,]?\d*)\s*c\.\s*[àa]\s*table/i);
  const scoopMatch = label.match(/([½⅓¼]|\d+[.,]?\d*)\s*scoop/i);
  const countMatch = label.match(/^(\d+)\s+(?![mlg])/i);

  let amount = null;
  let unit = null;
  let grams = gramsMatch ? num(gramsMatch[1]) : null;

  if (mlMatch) {
    amount = num(mlMatch[1]);
    unit = 'ml';
  } else if (scoopMatch) {
    const raw = scoopMatch[1];
    amount = raw === '½' ? 0.5 : raw === '⅓' ? 1 / 3 : raw === '¼' ? 0.25 : num(raw);
    unit = 'scoop';
  } else if (tbspMatch) {
    amount = num(tbspMatch[1]);
    unit = 'tbsp';
  } else if (cupMatch) {
    const raw = cupMatch[1];
    amount =
      raw === '½' ? 0.5 : raw === '⅓' ? 1 / 3 : raw === '¼' ? 0.25 : raw === '¾' ? 0.75 : num(raw);
    unit = 'cup';
  } else if (/^\d+\s*g\b/i.test(label) || /^(\d+[.,]?\d*)\s*g\b/i.test(label)) {
    const m = label.match(/^(\d+[.,]?\d*)\s*g\b/i);
    amount = num(m[1]);
    unit = 'g';
    if (grams == null) grams = amount;
  } else if (countMatch) {
    amount = num(countMatch[1]);
    unit = 'count';
  } else if (/^[½⅓¼⅙]/.test(label)) {
    const frac = label[0];
    amount = frac === '½' ? 0.5 : frac === '⅓' ? 1 / 3 : frac === '¼' ? 0.25 : frac === '⅙' ? 1 / 6 : null;
    unit = 'portion';
  } else {
    amount = 1;
    unit = 'portion';
  }

  let preparationState = null;
  const lower = `${labelFr} ${labelEn}`.toLowerCase();
  if (/avant cuisson|uncooked|sec\b|dry\b/.test(lower)) preparationState = 'dry_uncooked';
  else if (/cuit|cooked|bouilli|boiled/.test(lower)) preparationState = 'cooked';
  else if (/[eé]goutt|drain/.test(lower)) preparationState = 'drained';
  else if (/gril+|[eé]grill|grill/.test(lower)) preparationState = 'prepared';
  else if (/congel|frozen/.test(lower)) preparationState = 'frozen';
  else if (/nature|raw|cru/.test(lower)) preparationState = 'raw';
  else if (/conserv|canned/.test(lower)) preparationState = 'canned';

  const brandSpecific = /core power|fairlife|egglife|allegro|natrel|cogruet|bergeron|pb2|ezekiel/i.test(
    `${labelFr} ${labelEn}`
  );
  let brand = null;
  if (/core power|fairlife/i.test(`${labelFr} ${labelEn}`)) brand = 'Core Power / Fairlife';
  else if (/egglife/i.test(`${labelFr} ${labelEn}`)) brand = 'Egglife';
  else if (/allegro/i.test(`${labelFr} ${labelEn}`)) brand = 'Allegro';
  else if (/natrel/i.test(`${labelFr} ${labelEn}`)) brand = 'Natrel';
  else if (/cogruet/i.test(`${labelFr} ${labelEn}`)) brand = 'COGRUET';
  else if (/bergeron/i.test(`${labelFr} ${labelEn}`)) brand = 'Bergeron';
  else if (/\bpb2\b/i.test(`${labelFr} ${labelEn}`)) brand = 'PB2';
  else if (/ezekiel/i.test(`${labelFr} ${labelEn}`)) brand = 'Ezekiel';

  return {
    labelFr,
    labelEn,
    amount,
    unit,
    grams,
    preparationState,
    brandSpecific,
    brand,
  };
}

function fatTotal(row) {
  if (row.lip != null) return num(row.lip);
  // Total fat was not declared as a single field in lipid-group sections.
  return null;
}

function resolveCalculationGroup(legacyKey, labelFr, labelEn) {
  const mapped = SECTION_MAP[legacyKey];
  if (legacyKey !== 'autresProteines') return mapped.calculationGroup;

  const text = `${labelFr} ${labelEn}`;
  if (WHEY_PATTERNS.some((re) => re.test(text))) return 'whey';
  return 'protein';
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

function main() {
  const { DATA, FOODS } = loadLegacyData();
  const foods = [];
  const usedIds = new Set();
  const importNotes = [];

  for (const [legacyKey, section] of Object.entries(DATA)) {
    const meta = SECTION_MAP[legacyKey];
    if (!meta) throw new Error(`Unknown section ${legacyKey}`);
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
      let idBase = `${meta.displayCategory.replace(/_/g, '-')}-${slugify(nameEn || nameFr || labelFr)}`;
      let id = idBase;
      let n = 2;
      while (usedIds.has(id)) {
        id = `${idBase}-${n++}`;
      }
      usedIds.add(id);

      const portion = parsePortion(labelFr, labelEn || '');
      const calculationGroup = resolveCalculationGroup(legacyKey, labelFr, labelEn || '');

      foods.push({
        id,
        legacySectionKey: legacyKey,
        legacyIndex: index,
        displayCategory: meta.displayCategory,
        calculationGroup,
        names: {
          fr: nameFr,
          en: nameEn,
        },
        portion: {
          labelFr: portion.labelFr,
          labelEn: portion.labelEn || null,
          amount: portion.amount,
          unit: portion.unit,
          grams: portion.grams,
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
        source: {
          reference: 'Imported from generate.js DATA / i18n.js FOODS (legacy guide)',
          referenceId: `${legacyKey}[${index}]`,
          dateVerified: null,
          verifiedBy: null,
          notes: 'Imported without nutrient correction. status=unverified.',
        },
        status: 'unverified',
        version: 1,
      });
    });
  }

  const outPath = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
  const payload = {
    meta: {
      schemaVersion: 1,
      importedAt: new Date().toISOString(),
      sourceFiles: ['generate.js', 'i18n.js'],
      importPolicy: 'no_silent_nutrient_correction',
      totalFoods: foods.length,
      notes: importNotes,
    },
    foods,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  const versionPath = path.join(ROOT, 'src', 'data', 'nutrition-data-version.json');
  fs.writeFileSync(
    versionPath,
    JSON.stringify(
      {
        version: '1.0.0',
        status: 'draft',
        createdAt: new Date().toISOString(),
        approvedAt: null,
        approvedBy: null,
        totalFoods: foods.length,
        verifiedFoods: 0,
        unverifiedFoods: foods.length,
        blockingErrors: null,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`Imported ${foods.length} foods → ${outPath}`);
  if (importNotes.length) console.log('Import notes:', importNotes);
}

main();
