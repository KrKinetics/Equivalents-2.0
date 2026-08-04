import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  WORKSPACE_ACCESS_DENIED_MESSAGE,
  WORKSPACE_CLIENT_SELECT_LABEL,
  WORKSPACE_DASHBOARD_RETURN_LABEL,
  WORKSPACE_UNSAVED_SWITCH_MESSAGE,
  canonicalizePersistedDossierPayload,
  isPersistedDossierDirty,
  lockWorkspaceAccessDenied,
  resolveWorkspaceOpenState,
  renderWorkspaceClientMenu,
  shouldProceedWorkspaceClientSwitch,
  waitForWorkspaceCalculatorReady,
} from '../src/coach/workspace/workspace-dossier-ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_A = 'e996994e-9752-4a7b-a15b-457d571f1dba';
const CLIENT_B = 'a1111111-2222-4333-8444-555555555555';
const CLIENT_C = 'b2222222-3333-4444-8555-666666666666';

test('open state applies existing Supabase payload without manual menu action', () => {
  const stub = { sexe: 'H', age: '30', jours: { entrainement: {}, repos: {} } };
  const existing = {
    payload: {
      sexe: 'H', age: '41', poids: '207', poids_unit: 'lbs', activite: 'sedentaire',
      jours: { entrainement: { banque: { pro: '1' } }, repos: { banque: { pro: '0' } } },
    },
  };
  const resolved = resolveWorkspaceOpenState(existing, stub);
  assert.equal(resolved.mode, 'existing');
  assert.equal(resolved.payload.age, '41');
  assert.equal(resolved.status, 'Dossier chargé');
});

test('open state keeps stub when no Supabase dossier exists', () => {
  const stub = { sexe: 'H', age: '30', nom: 'Nouveau', jours: { entrainement: {}, repos: {} } };
  const resolved = resolveWorkspaceOpenState(null, stub);
  assert.equal(resolved.mode, 'empty');
  assert.equal(resolved.payload, stub);
  assert.equal(resolved.status, 'Aucun dossier sauvegardé pour ce client');
});

test('client menu lists org clients, selects URL client, never athlete_* or Supabase suffix', () => {
  const dom = new JSDOM(`<!DOCTYPE html><select id="liste_profils">
    <option value="">— Charger un dossier existant —</option>
    <option value="athlete_Alex">Alex</option>
  </select>`);
  const select = dom.window.document.getElementById('liste_profils');
  const value = renderWorkspaceClientMenu(select, {
    clients: [
      { id: CLIENT_A, full_name: 'Test persistance KR' },
      { id: CLIENT_B, full_name: 'test KR final' },
      { id: CLIENT_C, full_name: 'Client test KR' },
    ],
    selectedClientId: CLIENT_A,
  });
  assert.equal(value, CLIENT_A);
  assert.equal(select.options.length, 3);
  assert.equal(select.value, CLIENT_A);
  assert.equal(select.getAttribute('aria-label'), WORKSPACE_CLIENT_SELECT_LABEL);
  assert.deepEqual(
    [...select.options].map((o) => o.textContent),
    ['Test persistance KR', 'test KR final', 'Client test KR'],
  );
  assert.equal([...select.options].some((o) => String(o.value).startsWith('athlete_')), false);
  assert.equal([...select.options].some((o) => /\(Supabase\)/.test(o.textContent)), false);
});

test('canonical dirty detection ignores savedAt/activeJour and client-selector chrome', () => {
  const baseline = {
    sexe: 'H',
    age: '41',
    savedAt: '2026-01-01T00:00:00.000Z',
    activeJour: 'entrainement',
    jours: { entrainement: { banque: { pro: '1' } }, repos: { banque: { pro: '0' } } },
    workspaceMeta: { clientId: CLIENT_A, organizationSlug: 'kr-kinetics', fictional: true },
  };
  const afterSaveTick = {
    ...baseline,
    savedAt: '2026-08-03T23:59:59.000Z',
    activeJour: 'repos',
  };
  assert.equal(isPersistedDossierDirty(baseline, afterSaveTick), false);
  assert.equal(
    canonicalizePersistedDossierPayload(afterSaveTick).savedAt,
    undefined,
  );
  assert.equal(
    isPersistedDossierDirty(baseline, { ...afterSaveTick, age: '42' }),
    true,
  );
});

test('unsaved client switch confirm: cancel keeps current, continue proceeds', () => {
  assert.equal(
    shouldProceedWorkspaceClientSwitch({
      currentClientId: CLIENT_A,
      nextClientId: CLIENT_B,
      isDirty: false,
    }).proceed,
    true,
  );
  assert.deepEqual(
    shouldProceedWorkspaceClientSwitch({
      currentClientId: CLIENT_A,
      nextClientId: CLIENT_B,
      isDirty: true,
      confirm: () => false,
    }),
    { proceed: false, reason: 'cancelled' },
  );
  assert.deepEqual(
    shouldProceedWorkspaceClientSwitch({
      currentClientId: CLIENT_A,
      nextClientId: CLIENT_B,
      isDirty: true,
      confirm: (msg) => {
        assert.equal(msg, WORKSPACE_UNSAVED_SWITCH_MESSAGE);
        return true;
      },
    }),
    { proceed: true, reason: 'confirmed' },
  );
  assert.equal(
    shouldProceedWorkspaceClientSwitch({
      currentClientId: CLIENT_A,
      nextClientId: CLIENT_A,
      isDirty: true,
      confirm: () => true,
    }).proceed,
    false,
  );
});

test('waitForWorkspaceCalculatorReady resolves after DOM + COACH_DATA settle', async () => {
  let frames = 0;
  const g = {
    document: { readyState: 'complete' },
    appliquerProfilData() {},
    getProfilData() {},
    sauvegarderProfil() {},
    choisirPdfCreator() {},
    COACH_DATA: { totalFoods: 287 },
    requestAnimationFrame(cb) { frames += 1; setTimeout(cb, 0); return frames; },
  };
  await waitForWorkspaceCalculatorReady(() => g, 2000);
  assert.ok(frames >= 2);
});

test('access denied lock clears athlete_* and leaves only dashboard return', () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <form action="/dashboard.html" method="get"><button type="submit">← Changer de client</button></form>
    <div id="calc-root">
      <input id="nom_athlete" value="Secret Client">
      <select id="liste_profils"><option value="athlete_Alex">Alex</option></select>
      <button onclick="sauvegarderProfil()">Sauvegarder</button>
      <button onclick="supprimerProfil()">Del</button>
      <button onclick="exporterProfilJSON()">Export</button>
      <button onclick="document.getElementById('import-profil').click()">Import</button>
      <input id="import-profil" type="file">
      <input id="age" value="41">
    </div>
  </body>`);
  const result = lockWorkspaceAccessDenied(dom.window.document);
  assert.equal(result.message, WORKSPACE_ACCESS_DENIED_MESSAGE);
  const select = dom.window.document.getElementById('liste_profils');
  assert.equal(select.options.length, 0);
  assert.equal(select.hidden, true);
  assert.equal(dom.window.document.getElementById('nom_athlete').value, '');
  assert.equal(dom.window.document.getElementById('calc-root').hidden, true);
  const formBtn = dom.window.document.querySelector('form[action="/dashboard.html"] button[type="submit"]');
  assert.equal(formBtn.textContent, WORKSPACE_DASHBOARD_RETURN_LABEL);
  assert.equal(formBtn.disabled, false);
  assert.equal(formBtn.hidden, false);
});

test('bootstrap wires client selector + dirty confirm; dashboard form stays server HTML', () => {
  const src = fs.readFileSync(path.join(root, 'coach-portal/assets/workspace-bootstrap.mjs'), 'utf8');
  const preview = fs.readFileSync(path.join(root, 'scripts/coach-workspace-preview.mjs'), 'utf8');
  const deployLib = fs.readFileSync(path.join(root, 'scripts/coach-portal-deploy-lib.mjs'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/nutrition-data-tests.yml'), 'utf8');
  assert.match(src, /renderWorkspaceClientMenu/);
  assert.match(src, /shouldProceedWorkspaceClientSwitch/);
  assert.match(src, /getPersistedDossierPayload/);
  assert.match(src, /markCleanFromCurrent/);
  assert.match(src, /enterAccessDeniedState|lockWorkspaceAccessDenied/);
  assert.match(src, /WORKSPACE_ACCESS_DENIED_MESSAGE/);
  assert.match(src, /isPersistedDossierDirty|canonicalizePersistedDossierPayload/);
  assert.match(src, /fetchOrganizationClients/);
  assert.match(src, /workspaceOpenPath/);
  assert.match(src, /workspaceInitProfils/);
  assert.doesNotMatch(src, /← Retour au portail|workspace-return-portal|history\.back\(/);
  assert.doesNotMatch(src, /listProfileKeys\s*\(/);
  assert.doesNotMatch(src, /WORKSPACE_DOSSIER_OPTION_PREFIX|workspace-dossier:/);
  assert.match(preview, /injectWorkspaceBootstrap/);
  assert.match(deployLib, /action="\/dashboard\.html"/);
  assert.match(deployLib, /← Changer de client/);
  assert.match(workflow, /coach-auth-tests:/);
  assert.match(workflow, /npm run test:coach-auth/);
  assert.match(workflow, /nutrition-tests:/);
});
