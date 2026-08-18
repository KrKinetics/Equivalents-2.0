/**
 * Live persistence for real Coach dossiers (publishable key + passwords).
 * Never prints secrets, tokens, or service_role.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  coachPasswordsLocalPath,
  loadCoachPasswordsLocal,
  requireSupabasePublicEnv,
  skipWithoutLiveSupabase,
} from '../scripts/load-env-local.mjs';
import { createSupabaseClientDossierStore } from '../src/coach/services/storage/supabase-client-dossier-store.mjs';
import { validateDossierPayload } from '../src/coach/services/storage/dossier-schema.mjs';
import { createLocalStorageClientProfileStore, createMemoryStorage } from '../src/coach/services/storage/client-profile-store.mjs';
import { resolveWorkspaceOpenState } from '../src/coach/workspace/workspace-dossier-ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function anonClient() {
  const { url, publishableKey } = requireSupabasePublicEnv(root);
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(entry) {
  const supabase = anonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: entry.email,
    password: entry.password,
  });
  assert.ifError(error);
  return { supabase, session: data.session };
}

async function membershipFor(supabase, userId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organization_id, organizations(slug, name)')
    .eq('user_id', userId)
    .maybeSingle();
  assert.ifError(error);
  return {
    role: data.role,
    organizationId: data.organization_id,
    organization: data.organizations,
  };
}

function samplePayload(label) {
  return {
    version: 3,
    energyEquationVersion: 'nasem2023',
    nom: label,
    sexe: 'H',
    age: '33',
    poids: '82',
    poids_unit: 'kg',
    grandeur_unit: 'cm',
    grandeur_cm: '181',
    activite: 'modere',
    macroRatio: '25,45,30',
    goalMultiplier: 1,
    macroMode: 'preset',
    proteinesMode: 'gkg',
    proteinesParKg: 2,
    proteinesPct: 25,
    jourReposActif: false,
    coachNotes: `note-${label}`,
    jours: {
      entrainement: {
        banque: { pro: '3', fec: '2', leg: '1', fru: '1', lai: '0', lip: '2', whey: '0' },
        repartition: { 0: '1', 1: '1' },
        heureEntrainement: '17:30',
        repartitionSelonEntrainement: true,
        eauLitres: '3',
        eauAjout: '0',
        eauManuel: true,
      },
      repos: {
        banque: { pro: '2', fec: '1', leg: '1', fru: '1', lai: '0', lip: '1', whey: '0' },
      },
    },
  };
}

test('historical localStorage store still saves and loads independently', () => {
  const memory = createMemoryStorage();
  const store = createLocalStorageClientProfileStore(memory);
  const data = samplePayload('Local Offline');
  store.saveProfile('Local Offline', data);
  assert.equal(store.hasProfile('Local Offline'), true);
  assert.deepEqual(store.loadProfile('Local Offline').jours.entrainement.banque.pro, '3');
  store.removeProfile('Local Offline');
  assert.equal(store.hasProfile('Local Offline'), false);
});

test('invalid payload is refused by validator before network', () => {
  assert.equal(validateDossierPayload({ sexe: 'H' }).ok, false);
  assert.equal(validateDossierPayload(samplePayload('ok')).ok, true);
});

test('live: anon cannot read or write client_dossiers', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  const supabase = anonClient();
  const store = createSupabaseClientDossierStore(supabase);
  const { data, error } = await supabase.from('client_dossiers').select('id').limit(5);
  if (error && /does not exist|schema cache|Could not find the table/i.test(error.message)) {
    assert.fail('Table public.client_dossiers missing — apply 20260803200000_coach_client_dossiers.sql');
  }
  assert.ok(!data || data.length === 0, 'anon unexpectedly read client_dossiers');
  await assert.rejects(
    () => store.saveClientDossier('00000000-0000-4000-8000-000000000000', samplePayload('x'), {
      organizationId: '00000000-0000-4000-8000-000000000001',
    }),
    /./,
  );
});

test('live: KR and Elevate real dossier save/reload + cross-org isolation', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  if (!fs.existsSync(coachPasswordsLocalPath(root))) {
    t.skip('.coach-passwords.local missing');
    return;
  }
  const [krEntry, elevateEntry] = loadCoachPasswordsLocal(root);
  const kr = await signIn(krEntry);
  const elevate = await signIn(elevateEntry);
  const krMem = await membershipFor(kr.supabase, kr.session.user.id);
  const elevMem = await membershipFor(elevate.supabase, elevate.session.user.id);
  const krStore = createSupabaseClientDossierStore(kr.supabase);
  const elevStore = createSupabaseClientDossierStore(elevate.supabase);

  const stamp = Date.now();
  const { data: krClient, error: krInsErr } = await kr.supabase.from('clients').insert({
    organization_id: krMem.organizationId,
    created_by: kr.session.user.id,
    full_name: `Dossier KR ${stamp}`,
    notes: 'persist-live',
    is_fictional: false,
    service_type: 'nutrition',
  }).select('id').single();
  assert.ifError(krInsErr);

  const { data: elevClient, error: elevInsErr } = await elevate.supabase.from('clients').insert({
    organization_id: elevMem.organizationId,
    created_by: elevate.session.user.id,
    full_name: `Dossier Elevate ${stamp}`,
    notes: 'persist-live',
    is_fictional: false,
    service_type: 'nutrition',
  }).select('id').single();
  assert.ifError(elevInsErr);

  t.after(async () => {
    await krStore.deleteClientDossier(krClient.id).catch(() => {});
    await elevStore.deleteClientDossier(elevClient.id).catch(() => {});
    await kr.supabase.from('clients').delete().eq('id', krClient.id);
    await elevate.supabase.from('clients').delete().eq('id', elevClient.id);
    await kr.supabase.auth.signOut();
    await elevate.supabase.auth.signOut();
  });

  assert.equal(await krStore.loadClientDossier(krClient.id), null);

  const krPayload = samplePayload(`KR-${stamp}`);
  krPayload.jours.entrainement.banque.pro = '7';
  await krStore.saveClientDossier(krClient.id, krPayload, {
    organizationId: krMem.organizationId,
    userId: kr.session.user.id,
  });
  const krReloaded = await krStore.loadClientDossier(krClient.id);
  assert.equal(krReloaded.payload.jours.entrainement.banque.pro, '7');
  assert.equal(krReloaded.payload.coachNotes, `note-KR-${stamp}`);
  const openExisting = resolveWorkspaceOpenState(krReloaded, samplePayload('stub'));
  assert.equal(openExisting.mode, 'existing');
  assert.equal(openExisting.payload.jours.entrainement.banque.pro, '7');
  assert.equal(openExisting.status, 'Dossier chargé');
  const openEmpty = resolveWorkspaceOpenState(null, samplePayload('stub-empty'));
  assert.equal(openEmpty.mode, 'empty');
  assert.equal(openEmpty.status, 'Aucun dossier sauvegardé pour ce client');

  const elevPayload = samplePayload(`EL-${stamp}`);
  elevPayload.jours.entrainement.banque.fec = '9';
  await elevStore.saveClientDossier(elevClient.id, elevPayload, {
    organizationId: elevMem.organizationId,
    userId: elevate.session.user.id,
  });
  const elevReloaded = await elevStore.loadClientDossier(elevClient.id);
  assert.equal(elevReloaded.payload.jours.entrainement.banque.fec, '9');

  assert.equal(await krStore.loadClientDossier(elevClient.id), null);
  assert.equal(await elevStore.loadClientDossier(krClient.id), null);

  await assert.rejects(
    () => krStore.saveClientDossier(elevClient.id, samplePayload('hack'), {
      organizationId: elevMem.organizationId,
      userId: kr.session.user.id,
    }),
    /./,
  );
  await assert.rejects(
    () => krStore.saveClientDossier(elevClient.id, samplePayload('hack2'), {
      organizationId: krMem.organizationId,
      userId: kr.session.user.id,
    }),
    /./,
  );

  assert.equal(
    await krStore.loadClientDossier('00000000-0000-4000-8000-000000000099'),
    null,
  );

  await assert.rejects(
    () => krStore.saveClientDossier(krClient.id, { sexe: 'H' }, {
      organizationId: krMem.organizationId,
      userId: kr.session.user.id,
    }),
    /Payload invalide/i,
  );

  const { error: moveErr } = await kr.supabase
    .from('client_dossiers')
    .update({ organization_id: elevMem.organizationId })
    .eq('client_id', krClient.id);
  assert.ok(moveErr, 'expected org move to fail');
});

test('live: save without session is refused', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  const supabase = anonClient();
  const { data: sessionData } = await supabase.auth.getSession();
  assert.equal(sessionData.session, null);
  const store = createSupabaseClientDossierStore(supabase);
  await assert.rejects(
    () => store.saveClientDossier('00000000-0000-4000-8000-000000000010', samplePayload('nosession'), {
      organizationId: '00000000-0000-4000-8000-000000000011',
    }),
    /./,
  );
});
