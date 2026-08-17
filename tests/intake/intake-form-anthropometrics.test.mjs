import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedPath, isPublicPath } from '../../src/coach/security/portal-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const intakeHtml = read('coach-portal/intake.html');
const intakeJs = read('coach-portal/assets/intake.js');
const dashboardJs = read('coach-portal/assets/dashboard.js');
const bootstrap = read('coach-portal/assets/workspace-bootstrap.mjs');
const middleware = read('middleware.js');

test('step 1 exposes age, height unit switch, and weight without a date of birth', () => {
  assert.match(intakeHtml, /name="age_years"/);
  assert.match(intakeHtml, /inputmode="numeric"/);
  assert.match(intakeHtml, /name="height_unit"/);
  assert.match(intakeHtml, /value="imperial"/);
  assert.match(intakeHtml, /value="metric"/);
  assert.match(intakeHtml, /name="height_feet"/);
  assert.match(intakeHtml, /name="height_inches"/);
  assert.match(intakeHtml, /name="height_cm"/);
  assert.match(intakeHtml, /name="weight_lb"/);
  assert.match(intakeHtml, /inputmode="decimal"/);
  assert.match(intakeHtml, /Repères physiques/);
  assert.match(intakeHtml, /Coordonnées/);
  assert.match(intakeHtml, /Environ 3 à 5 min/);
  assert.doesNotMatch(intakeHtml, /date de naissance|birthdate|date_of_birth/i);
  assert.doesNotMatch(intakeHtml, /min="18"/);
});

test('intake JS converts height on unit switch and never clears the unused system silently', () => {
  assert.match(intakeJs, /convertHeightUnit/);
  assert.match(intakeJs, /sanitizeIntakeAnthropometrics/);
  assert.match(intakeJs, /validateIntakeAnthropometrics/);
  assert.match(intakeJs, /updateHeightFields\(\{ convertFrom/);
  assert.match(intakeJs, /height_unit/);
  assert.doesNotMatch(intakeJs, /console\.log\([^)]*age_years/);
  assert.doesNotMatch(intakeJs, /console\.log\([^)]*weight_lb/);
});

test('anthropometrics stay off the global dashboard and out of URLs', () => {
  assert.doesNotMatch(dashboardJs, /age_years|height_cm|weight_lb|height_feet/);
  assert.doesNotMatch(intakeJs, /searchParams\.set\(['"]age/);
  assert.doesNotMatch(bootstrap, /console\.log\([^)]*answers/);
  assert.match(bootstrap, /loadSubmittedIntakeLandmarks/);
  assert.match(bootstrap, /Repères client|intake-client-landmarks/);
});

test('public intake can load the conversion helper; intake-report stays protected', () => {
  assert.equal(isProtectedPath('/src/coach/intake/intake-anthropometrics.mjs'), false);
  assert.equal(isPublicPath('/src/coach/intake/intake-anthropometrics.mjs'), true);
  assert.equal(isPublicPath('/src/coach/intake/planning-landmarks-view.mjs'), true);
  assert.equal(isProtectedPath('/src/coach/intake-report/intake-report-view-model.mjs'), true);
  assert.match(middleware, /pathname\.startsWith\('\/src\/coach\/intake\/'\)/);
});
