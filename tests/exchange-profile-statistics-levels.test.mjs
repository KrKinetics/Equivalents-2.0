import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatStatNumber, sanitizeExportNumbers } from '../src/lib/descriptive-stats.mjs';
import {
  analyzeAllLevels,
  buildDecisionsMarkdown,
  buildProfileCandidates,
  NUTRIENT_KEYS,
} from '../src/lib/exchange-profile-analysis.mjs';
import { buildExchangeRollupProposal } from '../src/lib/exchange-rollup-proposal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function statisticsRows(collection) {
  return Object.values(collection).map((cohort) => {
    const row = {
      level: cohort.level,
      id: cohort.id,
      totalCount: cohort.totalCount,
      verifiedCount: cohort.verifiedCount,
    };
    for (const nutrient of NUTRIENT_KEYS) {
      row[`${nutrient}_mean`] = formatStatNumber(cohort.nutrients[nutrient].mean);
    }
    return row;
  });
}

function loadAnalysis() {
  const foods = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'food-equivalents.json'), 'utf8')).foods;
  const mapping = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'category-mapping.json'), 'utf8'));
  const groups = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'calculation-groups.json'), 'utf8'));
  return { foods, analysis: analyzeAllLevels(foods, mapping, groups) };
}

test('formatStatNumber removes binary float noise deterministically', () => {
  assert.equal(formatStatNumber(30.699999999999996), 30.7);
  assert.equal(formatStatNumber(null), null);
  assert.equal(formatStatNumber(1 / 3), 0.3333);
});

test('analysis exports three levels with exact 287 coverage and no duplicates', () => {
  const { analysis } = loadAnalysis();
  const groups = statisticsRows(analysis.calculationGroup);
  const categories = statisticsRows(analysis.displayCategory);
  const profiles = statisticsRows(analysis.exchangeProfileId);
  const all = [...groups, ...categories, ...profiles];
  assert.deepEqual([...new Set(all.map((row) => row.level))].sort(), [
    'calculationGroup',
    'displayCategory',
    'exchangeProfileId',
  ]);
  assert.equal(categories.length, 9);
  assert.equal(profiles.length, 157);
  assert.ok(groups.length >= 6);
  for (const [label, rows] of [['groups', groups], ['categories', categories], ['profiles', profiles]]) {
    const total = rows.reduce((acc, row) => acc + row.totalCount, 0);
    const verified = rows.reduce((acc, row) => acc + row.verifiedCount, 0);
    assert.equal(total, 287, `${label} total`);
    assert.equal(verified, 287, `${label} verified`);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, `${label} unique ids`);
  }
});

test('rollup proposal keeps forbidden separations and explains empty whey group', () => {
  const { foods, analysis } = loadAnalysis();
  const proposal = buildExchangeRollupProposal(foods, analysis);
  assert.equal(proposal.status, 'proposal_not_approved');
  assert.equal(proposal.decisionModel, 'hybrid_D_A_transition');
  assert.ok(proposal.meta.singletonExchangeProfiles >= 100);
  assert.ok(proposal.rollups.length > 0);
  assert.ok(proposal.rollups.length < proposal.meta.exchangeProfileCount);
  assert.equal(analysis.calculationGroup.whey.totalCount, 0);
  assert.ok(proposal.wheyObservation.foodsWithWheyExchangeProfile > 0);
  assert.match(proposal.wheyObservation.explanationFr, /calculationGroup: "whey"/i);
  assert.ok(proposal.forbiddenMerges.some((item) => item.id === 'nuts_vs_oils'));
  assert.ok(proposal.forbiddenMerges.some((item) => item.id === 'dairy_family_splits'));
  assert.ok(proposal.forbiddenMerges.some((item) => item.id === 'whey_collagen_bars_rtd'));
  assert.ok(proposal.assignments.some((a) => a.exchangeRollupId === 'rollup-nuts-seeds'));
  assert.ok(proposal.assignments.some((a) => a.exchangeRollupId === 'rollup-oils-spreads'));
  assert.ok(proposal.assignments.some((a) => a.exchangeRollupId === 'rollup-dairy-protein-rtd'));
  assert.equal(proposal.wheyObservation.proposedBridge.productionChangeInThisPr, false);
});

test('generated exchange-profile-statistics.csv contains all three levels when present', () => {
  const reportPath = path.join(root, 'reports', 'exchange-profile-decision', 'exchange-profile-statistics.csv');
  if (!fs.existsSync(reportPath)) {
    assert.ok(true, 'report not generated yet in this phase');
    return;
  }
  const { analysis } = loadAnalysis();
  const expected = statisticsRows(analysis.calculationGroup).length
    + statisticsRows(analysis.displayCategory).length
    + statisticsRows(analysis.exchangeProfileId).length;
  const text = fs.readFileSync(reportPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const rows = text.split('\n').length - 1;
  assert.equal(rows, expected);
  assert.match(text, /calculationGroup/);
  assert.match(text, /displayCategory/);
  assert.match(text, /exchangeProfileId/);
  const levels = new Set(text.split('\n').slice(1).map((line) => line.split(',')[0]));
  assert.deepEqual([...levels].sort(), ['calculationGroup', 'displayCategory', 'exchangeProfileId']);
});

test('formatStatNumber stabilizes common float tails in generators', () => {
  assert.equal(formatStatNumber(18.799999999999997), 18.8);
  assert.equal(formatStatNumber(30.699999999999996), 30.7);
});

test('decision artifacts never contain unnormalized float tails', () => {
  const { analysis } = loadAnalysis();
  const candidates = sanitizeExportNumbers(buildProfileCandidates(analysis));
  const markdown = buildDecisionsMarkdown(analysis, candidates);
  const blob = `${markdown}\n${JSON.stringify(candidates)}`;
  assert.equal(/\d+\.\d*99999/.test(blob), false, 'unnormalized float tail found in decision artifacts');
  assert.match(markdown, /L 30\.7 g/);
  assert.equal(candidates.B.typicalDayImpact.totals.fatG, 30.7);
});
