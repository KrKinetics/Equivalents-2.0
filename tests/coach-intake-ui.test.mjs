/**
 * Static checks for the branded intake experience and coach dashboard wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const intakeHtml = read('coach-portal/intake.html');
const intakeJs = read('coach-portal/assets/intake.js');
const dashboardHtml = read('coach-portal/dashboard.html');
const dashboardJs = read('coach-portal/assets/dashboard.js');
const css = read('coach-portal/assets/portal.css');
const middleware = read('middleware.js');
const build = read('scripts/coach-vercel-build.mjs');
const preview = read('scripts/coach-workspace-preview.mjs');
const vercel = read('vercel.json');

test('client intake is a four-step, short, branded experience', () => {
  assert.match(intakeHtml, /Environ 3 à 5 min/);
  assert.equal((intakeHtml.match(/class="intake-step(?: hidden)?" data-step="\d"/g) || []).length, 4);
  assert.match(intakeHtml, /PRÉPARONS NOTRE RENCONTRE/);
  assert.match(intakeHtml, /logo-kr-kinetics-horizontal\.png/);
  assert.match(intakeHtml, /Perte de masse adipeuse/);
  assert.match(intakeHtml, /name="age_years"/);
  assert.match(intakeHtml, /name="weight_lb"/);
  assert.match(intakeHtml, /Repères physiques/);
  assert.doesNotMatch(intakeHtml, /Perdre du poids/);
  assert.match(intakeJs, /organization_slug/);
  assert.match(intakeJs, /logo-elevate-fitness\.jpg/);
  assert.match(intakeJs, /ANSWER_DISPLAY_ALIASES/);
  assert.match(intakeJs, /document\.body\.dataset\.brand = brandId/);
  assert.match(css, /--brand-primary: #071b41/);
  assert.match(css, /--brand-accent: #ed1136/);
  assert.match(css, /\.intake-page\[data-brand="elevate"\]/);
  assert.match(css, /\.intake-brand-logo/);
  assert.match(css, /\.intake-actions button\.secondary \{/);
  assert.match(css, /\.intake-actions button\.secondary:hover/);
  assert.match(intakeHtml, /aria-label="Retour à l’étape précédente"/);
  assert.ok(fs.existsSync(path.join(root, 'coach-portal/assets/logo-kr-kinetics-horizontal.png')));
  assert.ok(fs.existsSync(path.join(root, 'coach-portal/assets/logo-elevate-fitness.jpg')));
});

test('intake autosaves, resumes, enforces max three challenges, and submits via token RPCs', () => {
  assert.match(intakeJs, /rpc\('get_client_intake'/);
  assert.match(intakeJs, /rpc\('save_client_intake'/);
  assert.match(intakeJs, /rpc\('submit_client_intake'/);
  assert.match(intakeJs, /selected\.length > 3/);
  assert.match(intakeJs, /completed_step/);
  assert.match(intakeJs, /field\.required = visible/);
});

test('coach dashboard creates links, displays status, and opens the submitted report', () => {
  assert.match(dashboardHtml, /Pré-entrevue/);
  assert.match(dashboardHtml, /intake-dialog/);
  assert.match(dashboardHtml, /clients-groups/);
  assert.match(dashboardJs, /\/api\/coach-send-intake-invite/);
  assert.doesNotMatch(dashboardJs, /create_client_intake_invite/);
  assert.doesNotMatch(dashboardJs, /client_intake_responses/);
  assert.match(dashboardJs, /navigator\.clipboard\.writeText/);
  assert.match(dashboardJs, /btn-compact/);
  assert.match(dashboardJs, /function intakeActionLabel/);
  assert.match(dashboardJs, /Envoyer le lien/);
  assert.match(dashboardJs, /Renvoyer un nouveau lien/);
  assert.match(dashboardJs, /Créer le lien/);
  assert.match(dashboardJs, /Nouveau lien/);
  assert.match(dashboardJs, /intakeInFlight/);
  assert.match(dashboardJs, /Envoi…/);
  assert.match(dashboardJs, /function formatPhoneDisplay/);
  assert.match(dashboardJs, /\$\{digits\.slice\(0, 3\)\} \$\{digits\.slice\(3, 6\)\}-\$\{digits\.slice\(6\)\}/);
  assert.match(dashboardJs, /formatPhoneDisplay\(row\.phone\)/);
  assert.match(dashboardJs, /btn-intake-report/);
  assert.match(dashboardJs, /Ouvrir le rapport/);
  assert.doesNotMatch(dashboardJs, /Voir réponses/);
  assert.doesNotMatch(dashboardJs, /btn-intake-view/);
  assert.match(dashboardJs, /target="_blank"/);
  assert.match(dashboardJs, /intakeReportOpenPath/);
  assert.match(css, /\.client-action-groups/);
  assert.match(css, /\.client-action-group-title/);
  assert.match(css, /\.client-management-actions/);
  assert.match(css, /\.btn-danger-ghost/);
});

test('intake files are shipped publicly while coach workspace stays protected', () => {
  assert.match(build, /'intake\.html'/);
  assert.match(build, /'assets\/intake\.js'/);
  assert.match(middleware, /pathname === '\/intake\.html'/);
  assert.match(middleware, /pathname === '\/assets\/intake\.js'/);
  assert.match(preview, /isPublicIntakePath/);
  assert.match(vercel, /"source": "\/intake\.html"/);
  assert.match(vercel, /noindex, nofollow, noarchive/);
});
