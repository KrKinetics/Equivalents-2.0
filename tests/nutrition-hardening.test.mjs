import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { shortName, parsePortion, parsePortionLabel, stripProteinAmountHints } from '../src/lib/legacy-portion-parser.mjs';
import { auditFood, auditDataset, canMarkVerified } from '../src/lib/food-audit-core.mjs';
import { calculateGroupStatistics } from '../src/lib/group-statistics.mjs';
import { EXPECTED_CATEGORY_COUNTS, TOTAL_FOODS_EXPECTED, MANUAL_STATUSES } from '../src/lib/nutrition-constants.mjs';
import { validateFoodEquivalentsPayload } from '../src/lib/schema-validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');

function loadFoods() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

test('1. dataset has 207 foods', () => {
  const data = loadFoods();
  assert.equal(data.foods.length, TOTAL_FOODS_EXPECTED);
});

test('2. exact counts per displayCategory', () => {
  const data = loadFoods();
  const counts = {};
  for (const f of data.foods) counts[f.displayCategory] = (counts[f.displayCategory] || 0) + 1;
  for (const [cat, n] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
    assert.equal(counts[cat], n, `${cat} expected ${n} got ${counts[cat]}`);
  }
});

test('3. no missing EN name or label', () => {
  const data = loadFoods();
  for (const f of data.foods) {
    assert.ok(f.names?.en, `missing en name ${f.id}`);
    assert.ok(f.portion?.labelEn, `missing en label ${f.id}`);
  }
});

test('4. no duplicate ids', () => {
  const data = loadFoods();
  const ids = data.foods.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('5. 100% is not stripped to %', () => {
  const name = shortName('125 ml 100% pure fruit juice, no added sugar', 'en');
  assert.match(name, /100%\s*pure fruit juice/i);
  assert.doesNotMatch(name, /^%/);
});

test('6. 0% is not stripped to %', () => {
  assert.match(shortName('100 g 0% plain Skyr', 'en'), /0%\s*plain Skyr/i);
  assert.match(shortName('125 g 0% plain Greek yogurt', 'en'), /0%/);
  assert.match(shortName('100 ml 1-2% yogurt, no added sugar (100 g)', 'en'), /1-2%/);
  assert.match(shortName('125 ml 1% cottage cheese', 'en'), /1%/);
  assert.match(shortName('100 g 2% cottage cheese', 'en'), /2%/);
  assert.match(shortName('150 ml 1% protein chocolate milk', 'en'), /1%/);
});

test('7. PB2 tbsp parsing', () => {
  assert.equal(shortName('1,5 c. à table de PB2', 'fr'), 'PB2');
  assert.equal(shortName('1.5 tbsp PB2', 'en'), 'PB2');
  const p = parsePortion('1,5 c. à table de PB2', '1.5 tbsp PB2');
  assert.equal(p.amount, 1.5);
  assert.equal(p.unit, 'tbsp');
});

test('8. 15 gros raisins is count 15 grams 75', () => {
  const p = parsePortionLabel('15 gros raisins (75 g)');
  assert.equal(p.amount, 15);
  assert.equal(p.unit, 'count');
  assert.equal(p.grams, 75);
});

test('9. 2 galettes is count 2 grams 20', () => {
  const p = parsePortionLabel('2 Galettes de riz (~20 g)');
  assert.equal(p.amount, 2);
  assert.equal(p.unit, 'count');
  assert.equal(p.grams, 20);
});

test('10. 42 g prot./bouteille is not portion grams', () => {
  const cleaned = stripProteinAmountHints('100 ml de Core Power, Fairlife (42 g prot./bouteille)');
  assert.doesNotMatch(cleaned, /42/);
  const p = parsePortionLabel('100 ml de Core Power, Fairlife (42 g prot./bouteille)');
  assert.equal(p.amount, 100);
  assert.equal(p.unit, 'ml');
  assert.equal(p.grams, null);
});

test('11. 26 g prot./bouteille is not portion grams', () => {
  const p = parsePortionLabel('½ bouteille de Core Power, Fairlife (26 g prot./bouteille)');
  assert.equal(p.amount, 0.5);
  assert.equal(p.unit, 'bottle');
  assert.equal(p.grams, null);
});

test('12. verified is not a manual status option', () => {
  assert.deepEqual(MANUAL_STATUSES, ['unverified', 'rejected']);
  assert.ok(!MANUAL_STATUSES.includes('verified'));
  const app = fs.readFileSync(path.join(ROOT, 'tools', 'food-data-review-app.js'), 'utf8');
  assert.match(app, /MANUAL_STATUSES/);
  assert.match(app, /if \(v === 'verified'\) return/);
});

test('13. legacy source alone cannot verify', () => {
  const food = {
    id: 'x',
    displayCategory: 'fruits',
    calculationGroup: 'fruit',
    names: { fr: 'Test', en: 'Test' },
    portion: { labelFr: '1 pomme', labelEn: '1 apple', amount: 1, unit: 'count', grams: 140, preparationState: 'raw' },
    nutrients: { proteinG: 0.3, carbsG: 21, fiberG: 0, fatG: 0.2, declaredKcal: 90 },
    legacySource: { reference: 'Imported from generate.js' },
    source: { type: null, name: null },
    status: 'unverified',
    version: 1,
    verification: { status: 'unverified', verifiedAt: null, verifiedBy: null, datasetVersion: null },
    classificationStatus: 'pending',
    auditResolutions: [],
  };
  assert.equal(canMarkVerified(food), false);
});

test('14. shared audit engine used by dataset audit', () => {
  const data = loadFoods();
  const one = data.foods[0];
  const a = auditFood(one);
  const b = auditDataset([one]).items[0];
  assert.equal(a.errorCount, b.errorCount);
  assert.equal(a.warningCount, b.warningCount);
  assert.deepEqual(
    a.alerts.map((x) => x.code).sort(),
    b.alerts.map((x) => x.code).sort()
  );
});

test('15. data:bootstrap refuses overwrite without --force', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'bootstrap-from-legacy.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr || r.stdout), /Refusing to overwrite/i);
});

test('16. data:apply creates a backup', () => {
  const data = loadFoods();
  // Minimal valid apply of current file should backup
  const tmp = path.join(ROOT, 'backups', 'tmp-apply-test.json');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  const before = fs.readdirSync(path.join(ROOT, 'backups')).filter((f) => f.includes('pre-apply'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'apply-food-equivalents.mjs'), tmp], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const after = fs.readdirSync(path.join(ROOT, 'backups')).filter((f) => f.includes('pre-apply'));
  assert.ok(after.length > before.length, 'expected new pre-apply backup');
});

test('17. food becomes unverified after invalidating edit (logic)', () => {
  const food = {
    id: 'y',
    displayCategory: 'fruits',
    calculationGroup: 'fruit',
    names: { fr: 'Test', en: 'Test' },
    portion: {
      labelFr: '1 pomme (140 g)',
      labelEn: '1 apple (140 g)',
      amount: 1,
      unit: 'count',
      grams: 140,
      preparationState: 'raw',
      brandSpecific: false,
      brand: null,
    },
    nutrients: { proteinG: 0.3, carbsG: 21, fiberG: 0, fatG: 0.2, declaredKcal: 90 },
    legacySource: { reference: 'legacy' },
    source: {
      type: 'canadian_nutrient_file',
      name: 'CNF',
      recordId: '1',
      url: null,
      accessedAt: '2026-01-01',
      servingDescription: '1 apple',
      nutrientsBasis: 'as_consumed',
      notes: null,
    },
    status: 'verified',
    version: 2,
    verification: { status: 'verified', verifiedAt: '2026-01-01', verifiedBy: 'Coach', datasetVersion: '1.0.0' },
    classificationStatus: 'pending',
    auditResolutions: [],
    history: [],
  };
  assert.equal(canMarkVerified(food), true);
  food.source.type = null;
  food.source.name = null;
  // Simulate auto-unverify rule used by UI
  if (!canMarkVerified(food)) {
    food.status = 'unverified';
    food.verification.status = 'unverified';
  }
  assert.equal(food.status, 'unverified');
});

test('18. single verified food does not approve group', () => {
  const foods = [
    {
      id: 'a',
      calculationGroup: 'fruit',
      status: 'verified',
      verification: { status: 'verified' },
      nutrients: { proteinG: 1, carbsG: 15, fiberG: 2, fatG: 0.3, declaredKcal: 71 },
    },
  ];
  const stats = calculateGroupStatistics('fruit', foods, {
    id: 'fruit',
    approved: false,
    referenceProfile: { proteinG: null, carbsG: null, fiberG: null, fatG: null, kcal: null },
    tolerances: { proteinG: 2, carbsG: 4, fatG: 2, kcal: 15 },
  }, { status: 'draft' });
  assert.equal(stats.approved, false);
  assert.match(stats.message, /non approuvé/i);
});

test('19. audit script does not mutate nutrients', () => {
  const before = JSON.stringify(loadFoods().foods.map((f) => f.nutrients));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'audit-food-equivalents.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const after = JSON.stringify(loadFoods().foods.map((f) => f.nutrients));
  assert.equal(before, after);
});

test('20. audit is deterministic aside from timestamps', () => {
  const r1 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'audit-food-equivalents.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const j1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'food-equivalents-audit.json'), 'utf8'));
  const r2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'audit-food-equivalents.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const j2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'food-equivalents-audit.json'), 'utf8'));
  assert.equal(r1.status, 0);
  assert.equal(r2.status, 0);
  assert.deepEqual(j1.summary, j2.summary);
  assert.deepEqual(j1.alertCountsByCode, j2.alertCountsByCode);
  assert.equal(j1.items.length, j2.items.length);
  // strip timestamps from items comparison via codes
  assert.deepEqual(
    j1.items.map((i) => [i.id, i.errorCount, i.warningCount, i.maxSeverity]),
    j2.items.map((i) => [i.id, i.errorCount, i.warningCount, i.maxSeverity])
  );
});

test('schema validate accepts current dataset shape after bootstrap', () => {
  const data = loadFoods();
  const v = validateFoodEquivalentsPayload(data);
  assert.equal(v.ok, true, JSON.stringify(v.errors?.slice(0, 5)));
});
