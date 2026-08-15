/**
 * Static checks for dashboard service grouping, create field, and edit dialog.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SERVICE_CHANGE_CONFIRMATION,
  SERVICE_LABELS_FR,
  SERVICE_SELECT_PLACEHOLDER,
} from '../src/coach/domain/client-service-entitlements.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const dashboardHtml = read('coach-portal/dashboard.html');
const dashboardJs = read('coach-portal/assets/dashboard.js');
const css = read('coach-portal/assets/portal.css');
const bootstrap = read('coach-portal/assets/workspace-bootstrap.mjs');
const preview = read('scripts/coach-workspace-preview.mjs');
const vercelBuild = read('scripts/coach-vercel-build.mjs');

test('create form requires an explicit service with empty placeholder', () => {
  assert.match(dashboardHtml, /<label for="service_type">Service<\/label>/);
  assert.match(dashboardHtml, /<select id="service_type" name="service_type" required>/);
  assert.match(dashboardHtml, new RegExp(`<option value="">${SERVICE_SELECT_PLACEHOLDER}</option>`));
  assert.match(dashboardHtml, new RegExp(`<option value="nutrition">${SERVICE_LABELS_FR.nutrition}</option>`));
  assert.match(dashboardHtml, new RegExp(`<option value="programming">${SERVICE_LABELS_FR.programming}</option>`));
  assert.match(dashboardHtml, new RegExp(`<option value="complete">${SERVICE_LABELS_FR.complete}</option>`));
  assert.doesNotMatch(dashboardHtml, /<option value="nutrition" selected>/);
  assert.match(dashboardJs, /parseServiceType\(serviceType\)/);
  assert.match(dashboardJs, /if \(!code\) throw new Error\('Le service du client est requis\.'\)/);
  assert.match(
    dashboardJs,
    /async function createClient\([\s\S]*?from\('clients'\)\.insert\(\{[\s\S]*?service_type: code,[\s\S]*?is_fictional: true,/,
  );
  assert.match(dashboardJs, /Choisissez le service du client/);
});

test('new-code client inserts always send service_type explicitly', () => {
  const insertFiles = [
    'coach-portal/assets/dashboard.js',
    'tests/coach-dossier-persistence-live.test.mjs',
    'tests/coach-workspace-cross-org-live.test.mjs',
    'tests/coach-auth-password-live.test.mjs',
    'tests/coach-workspace-preview.test.mjs',
  ];
  for (const rel of insertFiles) {
    const source = read(rel);
    const blocks = [...source.matchAll(/from\(['"]clients['"]\)\s*\.insert\((\{[\s\S]*?\})\)/g)];
    assert.ok(blocks.length > 0, `${rel} must insert clients`);
    for (const [, obj] of blocks) {
      assert.match(obj, /service_type\s*:/, `${rel} insert must send service_type`);
    }
  }

  const live = read('tests/coach-client-service-entitlements-live.test.mjs');
  const liveBlocks = [...live.matchAll(/from\(['"]clients['"]\)\s*\.insert\((\{[\s\S]*?\})\)/g)];
  const withService = liveBlocks.filter(([, obj]) => /service_type\s*:/.test(obj));
  const withoutService = liveBlocks.filter(([, obj]) => !/service_type\s*:/.test(obj));
  assert.ok(withService.length >= 1);
  assert.equal(withoutService.length, 1, 'exactly one negative insert without service_type');
  assert.match(live, /insert without service_type must fail/);
});

test('dashboard renders three service groups from the canonical helper', () => {
  assert.match(dashboardHtml, /id="clients-groups"/);
  assert.match(css, /\.client-service-group-header/);
  assert.match(dashboardJs, /groupClientsByService/);
  assert.match(dashboardJs, /SERVICE_GROUP_ORDER/);
  assert.match(dashboardJs, /SERVICE_GROUP_HEADINGS_FR/);
  assert.match(dashboardJs, /renderClientGroup/);
  assert.match(dashboardJs, /clientCountLabel/);
  assert.match(dashboardJs, /Aucun client/);
  assert.doesNotMatch(dashboardJs, /service_type === ['"]complete['"]/);
  assert.doesNotMatch(dashboardJs, /service_type === ['"]nutrition['"]/);
});

test('nutrition CTA is helper-gated and programming has no fake tool button', () => {
  assert.match(dashboardJs, /clientHasNutritionAccess\(row\.service_type\)/);
  assert.match(dashboardJs, /NUTRITION_WORKSPACE_CTA_LABEL/);
  assert.doesNotMatch(dashboardJs, /Ouvrir le dossier/);
  assert.doesNotMatch(dashboardHtml, /Ouvrir le dossier/);
  assert.doesNotMatch(dashboardJs, /Maître Coach|Maitre Coach|btn-programming|ouvrir la programmation/i);
  assert.match(bootstrap, /Ouvrir la structure alimentaire/);
  assert.match(preview, /\/src\/coach\/domain\//);
  assert.match(vercelBuild, /src', 'coach', 'domain'/);
});

test('intake actions remain available for every service group', () => {
  assert.match(dashboardJs, /btn-intake/);
  assert.match(dashboardJs, /\/api\/coach-send-intake-invite/);
  assert.doesNotMatch(dashboardJs, /create_client_intake_invite/);
  assert.doesNotMatch(
    dashboardJs,
    /clientHasNutritionAccess\(row\.service_type\)[\s\S]{0,80}btn-intake/,
  );
  assert.match(dashboardJs, /function clientRowMarkup/);
  assert.match(dashboardJs, /Créer le lien/);
  assert.match(dashboardJs, /Nouveau lien/);
  assert.match(dashboardJs, /Envoyer le lien/);
  assert.match(dashboardJs, /Renvoyer un nouveau lien/);
});

test('edit client uses an accessible dialog and confirms service changes', () => {
  assert.match(dashboardHtml, /id="edit-client-dialog"/);
  assert.match(dashboardHtml, /aria-labelledby="edit-client-dialog-title"/);
  assert.match(dashboardHtml, /<label for="edit_full_name">Nom<\/label>/);
  assert.match(dashboardHtml, /<label for="edit_email">Courriel/);
  assert.match(dashboardHtml, /<label for="edit_notes">Notes internes/);
  assert.match(dashboardHtml, /<label for="edit_service_type">Service<\/label>/);
  assert.match(dashboardHtml, new RegExp(SERVICE_CHANGE_CONFIRMATION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(dashboardJs, /editDialog\.showModal\(\)/);
  assert.match(dashboardJs, /edit_service_confirm_check/);
  assert.doesNotMatch(dashboardJs, /prompt\('Nom du client/);
  assert.doesNotMatch(dashboardJs, /prompt\('Courriel/);
  assert.doesNotMatch(dashboardJs, /prompt\('Notes/);
  assert.match(css, /\.service-change-confirm/);
});
