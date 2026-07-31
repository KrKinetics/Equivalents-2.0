import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildGuidePresentationModel, formatCellValue } from '../src/lib/guide-presentation.mjs';
import { normalizeFrName } from '../src/lib/descriptive-stats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', name), 'utf8'));
const foodsPayload = read('food-equivalents.json');
const mapping = read('category-mapping.json');
const version = read('nutrition-data-version.json');
const i18n = createRequire(import.meta.url)(path.join(root, 'i18n.js'));
const model = buildGuidePresentationModel({ foodsPayload, categoryMapping: mapping, versionMeta: version, sectionMetaFromI18n: i18n.SECTIONS });

test('presentation includes all 287 verified foods', () => {
  assert.equal(model.meta.totalFoods, 287);
  assert.equal(model.meta.verifiedFoods, 287);
  assert.equal(model.sections.flatMap((section) => section.foods).length, 287);
  assert.equal(model.meta.foodsLabelFr, '287 aliments vérifiés');
  assert.equal(model.meta.foodsLabelEn, '287 verified foods');
  assert.equal(model.meta.updatedLabelFr, 'Mise à jour : 30 juillet 2026');
  assert.equal(model.meta.updatedLabelEn, 'Updated: July 30, 2026');
  assert.equal(model.watermarkEn, 'PREVIEW — UNAPPROVED EXCHANGE PROFILES');
});

test('category counts match the source of truth', () => {
  for (const section of model.sections) {
    assert.equal(section.foods.length, foodsPayload.foods.filter((food) => food.displayCategory === section.id).length);
  }
});

test('null cells render as em dash without coercion', () => {
  assert.equal(formatCellValue(null, 'fr'), '—');
  assert.equal(formatCellValue(undefined, 'en'), '—');
  assert.equal(formatCellValue(0, 'fr'), '0');
});

test('model contains no average rows and FR/EN use the same ids', () => {
  const foods = model.sections.flatMap((section) => section.foods);
  assert.ok(foods.every((food) => food.id && !/moyenne|average/i.test(food.id)));
  assert.deepEqual(foods.map((food) => food.id), foods.map((food) => food.id));
});

test('categories and foods retain deterministic legacy order', () => {
  assert.deepEqual(model.sections.map((section) => section.id), mapping.displayCategories.map((category) => category.id));
  for (const section of model.sections) {
    const source = foodsPayload.foods.filter((food) => food.displayCategory === section.id);
    const expected = [...source].sort((a, b) =>
      (a.legacyIndex ?? Infinity) - (b.legacyIndex ?? Infinity)
      || normalizeFrName(a.names?.fr).localeCompare(normalizeFrName(b.names?.fr), 'fr')).map((food) => food.id);
    assert.deepEqual(section.foods.map((food) => food.id), expected);
  }
});
