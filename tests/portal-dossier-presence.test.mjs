import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  dossierPresenceByClient,
  mirrorBodyCopiesNoDossier,
  nutritionDossierMirrorBody,
  portalSyncClients,
} from '../src/coach/portal/dossier-presence.mjs';

const CLIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('one dossier query becomes a presence map without payload fields', () => {
  const presence = dossierPresenceByClient([
    { client_id: CLIENT_ID, updated_at: '2026-10-01T15:00:00.000Z', payload: { banque: { pro: 1 } } },
  ]);
  assert.equal(presence.get(CLIENT_ID), '2026-10-01T15:00:00.000Z');
  const synced = portalSyncClients([
    { id: CLIENT_ID, full_name: 'Athlete', email: null, notes: 'note', service_type: 'complete' },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', full_name: 'New', email: null, notes: '', service_type: 'complete' },
  ], presence);
  assert.equal(synced[0].has_nutrition_dossier, true);
  assert.equal(synced[0].nutrition_dossier_updated_at, '2026-10-01T15:00:00.000Z');
  assert.equal(Object.hasOwn(synced[0], 'payload'), false);
  assert.equal(synced[1].has_nutrition_dossier, false);
  assert.equal(synced[1].nutrition_dossier_updated_at, null);
});

test('a saved dossier mirror body does not copy the plan', () => {
  const body = nutritionDossierMirrorBody(CLIENT_ID, '2026-10-09T12:00:00.000Z');
  assert.equal(body.action, 'nutrition-dossier-status');
  assert.equal(body.has_nutrition_dossier, true);
  assert.equal(mirrorBodyCopiesNoDossier(body), true);
});

test('workspace save notifies the mirror only after saveClientDossier succeeds', () => {
  const source = fs.readFileSync(
    new URL('../coach-portal/assets/workspace-bootstrap.mjs', import.meta.url),
    'utf8',
  );
  const save = source.slice(
    source.indexOf('window.sauvegarderProfil'),
    source.indexOf('const saveBtn'),
  );
  const saveCall = save.indexOf('await dossierStore.saveClientDossier');
  const notifyCall = save.indexOf('notifySavedNutritionDossier');
  assert.ok(saveCall > 0);
  assert.ok(notifyCall > saveCall);
  const failure = source.slice(source.indexOf('} catch (err) {'), source.indexOf('const saveBtn'));
  assert.equal(failure.includes('notifySavedNutritionDossier'), false);
});
