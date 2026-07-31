import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAllLevels } from '../src/lib/exchange-profile-analysis.mjs';
import {
  buildExchangeRollupProposal,
  classifyProteinFatClass,
  FORBIDDEN_MERGES,
  proposeRollupId,
} from '../src/lib/exchange-rollup-proposal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const foods = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'food-equivalents.json'), 'utf8')).foods;
const mapping = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'category-mapping.json'), 'utf8'));
const groups = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'calculation-groups.json'), 'utf8'));
const analysis = analyzeAllLevels(foods, mapping, groups);
const proposal = buildExchangeRollupProposal(foods, analysis);
const byFood = Object.fromEntries(proposal.assignments.map((row) => [row.foodId, row]));

test('barley starch profile never enters protein-bars (bar⊂barley trap)', () => {
  const barley = byFood['feculents-cooked-barley'];
  assert.ok(barley);
  assert.equal(barley.exchangeProfileId, 'starch-cooked-grain-barley');
  assert.equal(barley.exchangeRollupId, 'rollup-starch-cereal');
  assert.notEqual(barley.exchangeRollupId, 'rollup-protein-bars');
  assert.ok(
    !proposal.assignments.some((row) =>
      String(row.exchangeProfileId).startsWith('starch-')
      && row.exchangeRollupId === 'rollup-protein-bars'),
  );
});

test('animal goat milk never enters plant-drink (oat⊂goat trap)', () => {
  const goat = byFood['produits-laitiers-goat-milk-whole'];
  assert.ok(goat);
  assert.equal(goat.exchangeProfileId, 'dairy-goat-milk-whole');
  assert.equal(goat.exchangeRollupId, 'rollup-dairy-milk-yogurt');
  assert.ok(
    !proposal.assignments.some((row) =>
      /goat-milk|whole-milk|cow-milk|dairy-milk|dairy-yogurt|dairy-goat/.test(row.exchangeProfileId)
      && !String(row.exchangeProfileId).startsWith('dairy-alternative-')
      && row.exchangeRollupId === 'rollup-dairy-plant-drink'),
  );
});

test('cottage ricotta quark use fresh-cheese rollup', () => {
  for (const id of [
    'produits-laitiers-cottage-cheese',
    'produits-laitiers-cottage-cheese-2',
    'produits-laitiers-partly-skimmed-ricotta',
    'produits-laitiers-quark-fat-free-plain',
  ]) {
    assert.equal(byFood[id].exchangeRollupId, 'rollup-dairy-fresh-cheese', id);
  }
});

test('manifestly fatty protein profiles are not lean without documented exception', () => {
  const forbiddenInLean = [
    /ribs/,
    /with-skin/,
    /ground-beef-regular/,
    /ground-beef-medium/,
    /^protein-lamb$/,
    /^protein-duck$/,
    /pork-standard/,
    /processed-meat-high-fat/,
    /(?:^|-)fatty(?:-|$)/,
  ];
  for (const row of proposal.assignments.filter((a) => a.exchangeRollupId === 'rollup-protein-lean')) {
    for (const re of forbiddenInLean) {
      assert.equal(
        re.test(row.exchangeProfileId),
        false,
        `${row.foodId} / ${row.exchangeProfileId} must not be lean`,
      );
    }
  }
  assert.equal(classifyProteinFatClass('protein-pork-ribs'), 'fatty');
  assert.equal(classifyProteinFatClass('protein-chicken-with-skin'), 'fatty');
  assert.equal(classifyProteinFatClass('protein-ground-beef-medium'), 'fatty');
  assert.equal(classifyProteinFatClass('protein-ground-beef-lean'), 'lean');
});

test('eggs and dark chocolate are not merged into a shared fat-other rollup', () => {
  assert.equal(byFood['matieres-grasses-whole-egg'].exchangeRollupId, 'rollup-fat-egg');
  assert.equal(byFood['matieres-grasses-egg-yolks'].exchangeRollupId, 'rollup-fat-egg');
  assert.equal(byFood['matieres-grasses-square-dark-chocolate-70'].exchangeRollupId, 'rollup-fat-chocolate');
  assert.equal(byFood['matieres-grasses-dark-chocolate-60-69'].exchangeRollupId, 'rollup-fat-chocolate');
});

test('edamame soy-nuts hummus granola chestnuts are not auto-true-nuts', () => {
  assert.equal(byFood['noix-graines-cup-soybeans-or-edamame'].exchangeRollupId, 'rollup-soy-legume-snack');
  assert.equal(byFood['noix-graines-roasted-soy-nuts-unsalted'].exchangeRollupId, 'rollup-soy-legume-snack');
  assert.equal(byFood['noix-graines-hummus'].exchangeRollupId, 'rollup-legume-spread');
  assert.equal(byFood['noix-graines-homemade-protein-granola'].exchangeRollupId, 'rollup-granola');
  assert.equal(byFood['noix-graines-roasted-chestnuts'].exchangeRollupId, 'rollup-chestnut');
});

test('assignments cover exactly 287 unique foods and one rollup per exchangeProfileId', () => {
  assert.equal(proposal.assignments.length, 287);
  assert.equal(new Set(proposal.assignments.map((a) => a.foodId)).size, 287);
  const byProfile = new Map();
  for (const row of proposal.assignments) {
    const set = byProfile.get(row.exchangeProfileId) || new Set();
    set.add(row.exchangeRollupId);
    byProfile.set(row.exchangeProfileId, set);
  }
  for (const [profile, rollups] of byProfile) {
    assert.equal(rollups.size, 1, `${profile} → ${[...rollups]}`);
  }
});

test('forbidden rollup family merges remain separated', () => {
  const members = Object.fromEntries(proposal.rollups.map((r) => [r.exchangeRollupId, new Set(r.exchangeProfileIds)]));
  for (const merge of FORBIDDEN_MERGES) {
    assert.ok(members[merge.a] || members[merge.b], merge.id);
    if (members[merge.a] && members[merge.b]) {
      for (const profile of members[merge.a]) {
        assert.equal(members[merge.b].has(profile), false, `${merge.id} shared profile ${profile}`);
      }
    }
  }
});

test('proposeRollupId prefers food object and ignores ambiguous legacy string-only bar matching', () => {
  assert.equal(
    proposeRollupId({
      exchangeProfileId: 'starch-cooked-grain-barley',
      calculationGroup: 'starch',
      displayCategory: 'feculents',
    }),
    'rollup-starch-cereal',
  );
  assert.equal(
    proposeRollupId({
      exchangeProfileId: 'protein-bar-high-fibre',
      calculationGroup: 'protein',
      displayCategory: 'autres_sources_proteinees',
    }),
    'rollup-protein-bars',
  );
});
