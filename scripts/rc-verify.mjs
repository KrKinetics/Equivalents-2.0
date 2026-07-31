/**
 * Verify release-candidate deliverables and invariants.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertProtectedFilesUnchanged, verifyProtectedFiles } from '../src/lib/rc-data-protection.mjs';
import {
  assertForbiddenMergesRespected,
  assertMandatorySpecialCases,
  assertUniqueFullCoverage,
  buildLegacyContext,
  buildRollupIndex,
} from '../src/lib/hybrid-rollup-adapter.mjs';
import { calculatePlan } from '../src/lib/calculation-engine.mjs';
import { CALCULATION_MODEL_VERSIONS } from '../src/lib/calculation-models.mjs';
import { defaultFoodIdResolver, runAcceptanceScenarios, TYPICAL_DAY_PORTIONS } from '../src/lib/rc-scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'reports', 'release-candidate');

const requiredFiles = [
  'README.md',
  'ACCEPTANCE_CHECKLIST.md',
  'legacy-vs-hybrid-scenarios.json',
  'data-protection-report.json',
  'visual-qa-report.json',
  'screenshots/desktop-1440.png',
  'screenshots/tablet-768.png',
  'screenshots/mobile-390.png',
  'kr-kinetics-guide-landscape-fr-rc.pdf',
  'kr-kinetics-guide-mobile-bilingual-rc.pdf',
  'index.html',
  'rc-data.json',
];

function mustExist(rel) {
  const abs = path.join(outDir, rel);
  if (!fs.existsSync(abs)) throw new Error(`Missing required RC artifact: ${rel}`);
  if (fs.statSync(abs).size <= 0) throw new Error(`Empty RC artifact: ${rel}`);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

// Rebuild first to guarantee fresh artifacts.
const build = spawnSync('node', ['scripts/rc-preview.mjs', '--build-only'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
if (build.status !== 0) {
  console.error('rc:verify failed: build step unsuccessful');
  process.exit(build.status || 1);
}

for (const file of requiredFiles) mustExist(file);

assertProtectedFilesUnchanged();
const protection = verifyProtectedFiles();
if (!protection.ok) throw new Error('Protected files changed');

const proposal = readJson('reports/exchange-profile-decision/exchange-rollup-proposal.json');
const foodsPayload = readJson('src/data/food-equivalents.json');
const categoryMapping = readJson('src/data/category-mapping.json');
const index = buildRollupIndex(proposal);
assertUniqueFullCoverage(index, 287, 28);
assertMandatorySpecialCases(index);
assertForbiddenMergesRespected(index);

const foodsById = new Map(foodsPayload.foods.map((food) => [food.id, food]));
const context = {
  legacyRefs: buildLegacyContext(categoryMapping),
  rollupIndex: index,
  foodsById,
};

const scenarios = runAcceptanceScenarios(context, { foodIdResolver: defaultFoodIdResolver });
if (scenarios.failed) throw new Error(`Scenario failures: ${scenarios.failed}`);

// Missing model version → legacy-a
const missing = calculatePlan({
  entries: Object.entries(TYPICAL_DAY_PORTIONS)
    .filter(([, n]) => n > 0)
    .map(([group, portions]) => ({ type: 'group', group, portions })),
}, context);
if (missing.calculationModelVersion !== CALCULATION_MODEL_VERSIONS.LEGACY_A) {
  throw new Error('Missing calculationModelVersion did not resolve to legacy-a');
}

// Null preservation: legacy fiber remains null
if (missing.totals.fiberG != null) {
  throw new Error('Legacy fiberG should remain null (not coerced to 0)');
}

const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
for (const label of [
  'VERSION CANDIDATE — NE PAS UTILISER POUR DES CLIENTS',
  'Calcul actuel',
  'Aperçu personnalisé',
  'Diagnostics propriétaire',
  'Non approuvé pour la production',
]) {
  if (!indexHtml.includes(label)) throw new Error(`Missing required label in index.html: ${label}`);
}

const visual = JSON.parse(fs.readFileSync(path.join(outDir, 'visual-qa-report.json'), 'utf8'));
if (visual.overall !== 'PASS') throw new Error('visual-qa-report overall is not PASS');

const packageJson = readJson('package.json');
if (packageJson.scripts?.['rc:preview'] == null || packageJson.scripts?.['rc:verify'] == null) {
  throw new Error('package.json missing rc:preview / rc:verify');
}

console.log('rc:verify PASS');
console.log(`- artifacts: ${requiredFiles.length}`);
console.log(`- scenarios: ${scenarios.passed}/${scenarios.scenarioCount}`);
console.log(`- protection: OK`);
console.log(`- visual: ${visual.overall}`);
