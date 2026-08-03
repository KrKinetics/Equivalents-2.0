import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_DOSSIER_OPTION_PREFIX,
  resolveWorkspaceOpenState,
  waitForWorkspaceCalculatorReady,
  workspaceDossierOptionValue,
} from '../src/coach/workspace/workspace-dossier-ui.mjs';

test('workspace dossier option value is stable and prefixed', () => {
  const id = 'e996994e-9752-4a7b-a15b-457d571f1dba';
  assert.equal(workspaceDossierOptionValue(id), `${WORKSPACE_DOSSIER_OPTION_PREFIX}${id}`);
});

test('open state applies existing Supabase payload without manual menu action', () => {
  const stub = { sexe: 'H', age: '30', jours: { entrainement: {}, repos: {} } };
  const existing = {
    payload: {
      sexe: 'H',
      age: '41',
      poids: '207',
      poids_unit: 'lbs',
      activite: 'sedentaire',
      jours: { entrainement: { banque: { pro: '1' } }, repos: { banque: { pro: '0' } } },
    },
  };
  const resolved = resolveWorkspaceOpenState(existing, stub);
  assert.equal(resolved.mode, 'existing');
  assert.equal(resolved.payload.age, '41');
  assert.equal(resolved.payload.poids, '207');
  assert.equal(resolved.status, 'Dossier chargé');
});

test('open state keeps stub when no Supabase dossier exists', () => {
  const stub = { sexe: 'H', age: '30', nom: 'Nouveau', jours: { entrainement: {}, repos: {} } };
  const resolved = resolveWorkspaceOpenState(null, stub);
  assert.equal(resolved.mode, 'empty');
  assert.equal(resolved.payload, stub);
  assert.equal(resolved.status, 'Aucun dossier sauvegardé pour ce client');
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
    requestAnimationFrame(cb) {
      frames += 1;
      setTimeout(cb, 0);
      return frames;
    },
  };
  await waitForWorkspaceCalculatorReady(() => g, 2000);
  assert.ok(frames >= 2);
});

test('bootstrap source exposes portal return link and loading statuses', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = fs.readFileSync(path.join(root, 'coach-portal/assets/workspace-bootstrap.mjs'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'src/coach/workspace/workspace-dossier-ui.mjs'), 'utf8');
  assert.match(src, /← Retour au portail/);
  assert.match(src, /href="\/dashboard\.html"/);
  assert.match(src, /Chargement du dossier…/);
  assert.match(src, /Erreur de chargement/);
  assert.match(src, /waitForWorkspaceCalculatorReady/);
  assert.match(src, /loadClientDossier/);
  assert.match(src, /resolveWorkspaceOpenState/);
  assert.doesNotMatch(src, /history\.back\(/);
  assert.match(ui, /Dossier chargé/);
  assert.match(ui, /Aucun dossier sauvegardé pour ce client/);
});
