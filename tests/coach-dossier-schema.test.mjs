import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOSSIER_SCHEMA_VERSION,
  attachWorkspaceMeta,
  isSupportedDossierSchemaVersion,
  validateDossierPayload,
} from '../src/coach/services/storage/dossier-schema.mjs';

test('dossier schema version is positive and supported', () => {
  assert.equal(DOSSIER_SCHEMA_VERSION, 1);
  assert.equal(isSupportedDossierSchemaVersion(1), true);
  assert.equal(isSupportedDossierSchemaVersion(DOSSIER_SCHEMA_VERSION), true);
  assert.equal(isSupportedDossierSchemaVersion('1'), true);
  assert.equal(isSupportedDossierSchemaVersion(99), false);
  assert.equal(isSupportedDossierSchemaVersion('nope'), false);
});

test('validateDossierPayload accepts jours shape and legacy banque', () => {
  assert.equal(validateDossierPayload({
    sexe: 'H',
    jours: { entrainement: { banque: { pro: '1' } } },
  }).ok, true);
  assert.equal(validateDossierPayload({
    sexe: 'F',
    banque: { pro: '2' },
  }).ok, true);
});

test('validateDossierPayload refuses invalid payloads', () => {
  assert.match(validateDossierPayload(null).reason, /objet/i);
  assert.match(validateDossierPayload({}).reason, /sexe/i);
  assert.match(validateDossierPayload({ sexe: 'H' }).reason, /jours|banque/i);
  assert.match(validateDossierPayload([]).reason, /objet/i);
});

test('attachWorkspaceMeta preserves nutrition fields and marks fictional', () => {
  const out = attachWorkspaceMeta(
    { sexe: 'H', jours: { entrainement: {} }, age: '40', banque: undefined },
    { clientId: '11111111-1111-4111-8111-111111111111', organizationSlug: 'kr-kinetics', fullName: 'Ada' },
  );
  assert.equal(out.age, '40');
  assert.equal(out.nom, 'Ada');
  assert.equal(out.workspaceMeta.clientId, '11111111-1111-4111-8111-111111111111');
  assert.equal(out.workspaceMeta.organizationSlug, 'kr-kinetics');
  assert.equal(out.workspaceMeta.fictional, true);
  assert.equal(out.version, 3);
});
