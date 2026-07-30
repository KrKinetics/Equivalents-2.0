/**
 * Normalize downloaded CNF 2026 relational CSVs into a bilingual food table.
 *
 * Nutrient codes are resolved by official tagname / nutrient name — never by
 * fixed column position in Food_Name.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { csvToObjects, findHeader } from '../src/lib/csv-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'src', 'sources', 'cnf-2026', 'raw');
const ZIP_PATH = path.join(ROOT, 'src', 'sources', 'cnf-2026', 'cnf_fcen_all-files-data_2026.zip');
const OUT_FOODS = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const OUT_META = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-metadata.json');

const REQUIRED_NUTRIENTS = {
  energy_kcal: {
    codes: ['208'],
    tagnames: ['ENERC_KCAL'],
    nameIncludes: ['energy (kilocalories)'],
  },
  protein_g: { codes: ['203'], tagnames: ['PROCNT'], nameIncludes: ['protein'] },
  carbohydrate_g: {
    codes: ['205'],
    tagnames: ['CHOCDF'],
    nameIncludes: ['carbohydrate, total'],
  },
  fibre_g: {
    codes: ['291'],
    tagnames: ['FIBTG'],
    nameIncludes: ['fibre, total dietary', 'fiber, total dietary'],
  },
  total_fat_g: { codes: ['204'], tagnames: ['FAT'], nameIncludes: ['fat (total lipids)'] },
  saturated_fat_g: {
    codes: ['606'],
    tagnames: ['FASAT'],
    nameIncludes: ['fatty acids, saturated, total'],
  },
  polyunsaturated_fat_g: {
    codes: ['646'],
    tagnames: ['FAPU'],
    nameIncludes: ['fatty acids, polyunsaturated, total'],
  },
  monounsaturated_fat_g: {
    codes: ['645'],
    tagnames: ['FAMS'],
    nameIncludes: ['fatty acids, monounsaturated, total'],
  },
};

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveNutrientCode(nutrientNames, definition) {
  const byCode = new Map(nutrientNames.map((row) => [String(row.Nutrient_Code), row]));
  for (const code of definition.codes) {
    if (byCode.has(code)) return code;
  }
  for (const row of nutrientNames) {
    const tag = String(row.Tagname || '').toUpperCase();
    if (definition.tagnames.includes(tag)) return String(row.Nutrient_Code);
  }
  for (const row of nutrientNames) {
    const en = String(row.Nutrient_Name_EN || '').toLowerCase();
    if (definition.nameIncludes.some((needle) => en.includes(needle))) {
      return String(row.Nutrient_Code);
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`CNF raw directory missing: ${RAW_DIR}. Run npm run sources:cnf:sync first.`);
  }
  const foodNamePath = path.join(RAW_DIR, 'Food_Name.csv');
  const nutrientNamePath = path.join(RAW_DIR, 'Nutrient_Name.csv');
  const nutrientAmountPath = path.join(RAW_DIR, 'Nutrient_Amount.csv');
  const measurePath = path.join(RAW_DIR, 'Measure_Weight_Conversion.csv');
  for (const file of [foodNamePath, nutrientNamePath, nutrientAmountPath]) {
    if (!fs.existsSync(file)) throw new Error(`Missing CNF file: ${file}`);
  }

  const foods = csvToObjects(fs.readFileSync(foodNamePath, 'utf8'));
  const nutrientNames = csvToObjects(fs.readFileSync(nutrientNamePath, 'utf8'));
  const nutrientAmounts = csvToObjects(fs.readFileSync(nutrientAmountPath, 'utf8'));
  const measures = fs.existsSync(measurePath)
    ? csvToObjects(fs.readFileSync(measurePath, 'utf8'))
    : [];

  const foodCodeHeader = findHeader(Object.keys(foods[0] || {}), ['Food_Code', 'food_code']);
  const foodEnHeader = findHeader(Object.keys(foods[0] || {}), [
    'Food_Description_EN',
    'food_description_en',
  ]);
  const foodFrHeader = findHeader(Object.keys(foods[0] || {}), [
    'Food_Description_FR',
    'food_description_fr',
  ]);
  if (!foodCodeHeader || !foodEnHeader) {
    throw new Error('Unable to resolve Food_Name headers');
  }

  const nutrientMap = {};
  for (const [key, definition] of Object.entries(REQUIRED_NUTRIENTS)) {
    const code = resolveNutrientCode(nutrientNames, definition);
    if (!code) throw new Error(`Unable to resolve nutrient mapping for ${key}`);
    nutrientMap[key] = code;
  }

  const amountsByFood = new Map();
  for (const row of nutrientAmounts) {
    const foodCode = String(row.Food_Code ?? row[foodCodeHeader] ?? '').trim();
    const nutrientCode = String(row.Nutrient_Code ?? '').trim();
    if (!foodCode || !nutrientCode) continue;
    if (!amountsByFood.has(foodCode)) amountsByFood.set(foodCode, new Map());
    amountsByFood.get(foodCode).set(nutrientCode, numberOrNull(row.Nutrient_Amount));
  }

  const measuresByFood = new Map();
  for (const row of measures) {
    const foodCode = String(row.Food_Code ?? '').trim();
    if (!foodCode) continue;
    if (!measuresByFood.has(foodCode)) measuresByFood.set(foodCode, []);
    measuresByFood.get(foodCode).push({
      measureTypeCode: row.Measure_Type_Code || null,
      measureCode: row.Measure_Code || null,
      grams: numberOrNull(row.Measure_Weight_Conversion),
    });
  }

  const normalized = foods.map((food) => {
    const recordId = String(food[foodCodeHeader]).trim();
    const amounts = amountsByFood.get(recordId) || new Map();
    const per100g = {};
    for (const [key, code] of Object.entries(nutrientMap)) {
      per100g[key] = amounts.has(code) ? amounts.get(code) : null;
    }
    return {
      recordId,
      descriptionEn: food[foodEnHeader] || null,
      descriptionFr: food[foodFrHeader] || null,
      foodGroupCode: food.CNF_Food_Group_Code || food.Food_Group_Code || null,
      usdaNdbCode: food.USDA_NDB_Code || null,
      scientificName: food.ScientificName || null,
      per100g,
      measures: measuresByFood.get(recordId) || [],
    };
  });

  const zipHash = fs.existsSync(ZIP_PATH) ? sha256File(ZIP_PATH) : null;
  const metadata = {
    datasetId: '1b6139bd-ed7e-4043-bc28-ff00e10f3109',
    datasetTitle: 'Canadian Nutrient File, 2026',
    publisher: 'Health Canada',
    portalPage:
      'https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109',
    downloadedAt: new Date().toISOString(),
    zipPath: fs.existsSync(ZIP_PATH) ? path.relative(ROOT, ZIP_PATH).replaceAll('\\', '/') : null,
    zipSha256: zipHash,
    rawDirectory: path.relative(ROOT, RAW_DIR).replaceAll('\\', '/'),
    foodCount: normalized.length,
    nutrientCodeMap: nutrientMap,
    hashDefinitions: {
      zipSha256: 'SHA-256 of official CNF all-files ZIP',
      foodsFileSha256: 'SHA-256 of normalized cnf-2026-foods.json',
    },
  };

  fs.mkdirSync(path.dirname(OUT_FOODS), { recursive: true });
  const foodsJson = `${JSON.stringify({ foods: normalized }, null, 2)}\n`;
  fs.writeFileSync(OUT_FOODS, foodsJson, 'utf8');
  metadata.foodsFileSha256 = crypto.createHash('sha256').update(foodsJson).digest('hex');
  fs.writeFileSync(OUT_META, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        ok: true,
        foodCount: normalized.length,
        nutrientCodeMap: nutrientMap,
        foods: OUT_FOODS,
        metadata: OUT_META,
        zipSha256: zipHash,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
