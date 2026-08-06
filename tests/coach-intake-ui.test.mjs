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
  assert.match(intakeJs, /organization_slug/);
  assert.match(intakeJs, /document\.body\.dataset\.brand = isElevate \? 'elevate' : 'kr'/);
  assert.match(css, /--brand-primary: #071b41/);
  assert.match(css, /--brand-accent: #ed1136/);
  assert.match(css, /\.intake-page\[data-brand="elevate"\]/);
});

test('intake autosaves, resumes, enforces max three challenges, and submits via token RPCs', () => {
  assert.match(intakeJs, /rpc\('get_client_intake'/);
  assert.match(intakeJs, /rpc\('save_client_intake'/);
  assert.match(intakeJs, /rpc\('submit_client_intake'/);
  assert.match(intakeJs, /selected\.length > 3/);
  assert.match(intakeJs, /completed_step/);
  assert.match(intakeJs, /field\.required = visible/);
});

test('coach dashboard creates links, displays status, and reads submitted answers', () => {
  assert.match(dashboardHtml, /Pré-entrevue/);
  assert.match(dashboardHtml, /intake-dialog/);
  assert.match(dashboardJs, /create_client_intake_invite/);
  assert.match(dashboardJs, /client_intake_responses/);
  assert.match(dashboardJs, /intake\.html\?token=/);
  assert.match(dashboardJs, /navigator\.clipboard\.writeText/);
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
