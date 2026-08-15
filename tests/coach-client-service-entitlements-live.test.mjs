/**
 * Live RLS + service-change preservation for client service entitlements.
 * Publishable key + gitignored passwords only. Never prints secrets.
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
import {
  assertWorkspaceClientAccess,
  NUTRITION_ENTITLEMENT_DENIED_CODE,
} from '../src/coach/workspace/workspace-access.mjs';
import { nutritionEligibleClients } from '../src/coach/domain/client-service-entitlements.mjs';

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

async function insertClient(supabase, { organizationId, userId, fullName, serviceType }) {
  const { data, error } = await supabase.from('clients').insert({
    organization_id: organizationId,
    created_by: userId,
    full_name: fullName,
    notes: 'service-entitlement-probe',
    is_fictional: true,
    service_type: serviceType,
  }).select('id, full_name, notes, organization_id, is_fictional, service_type').single();
  return { data, error };
}

test('live: service_type is required and CHECK-constrained', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  if (!fs.existsSync(coachPasswordsLocalPath(root))) {
    t.skip('.coach-passwords.local missing');
    return;
  }
  const [krEntry] = loadCoachPasswordsLocal(root);
  const kr = await signIn(krEntry);
  const mem = await membershipFor(kr.supabase, kr.session.user.id);
  t.after(async () => { await kr.supabase.auth.signOut(); });

  const probe = await kr.supabase.from('clients').select('service_type').limit(1);
  if (probe.error && /service_type/i.test(probe.error.message)) {
    t.skip('Apply 20260814190000_client_service_type.sql to the live project first');
    return;
  }

  const stamp = Date.now();
  const { data: existingTypes, error: existingErr } = await kr.supabase
    .from('clients')
    .select('id, service_type');
  assert.ifError(existingErr);
  for (const row of existingTypes || []) {
    assert.ok(
      ['nutrition', 'programming', 'complete'].includes(row.service_type),
      'legacy/backfilled rows must have a valid service_type',
    );
  }

  const missing = await kr.supabase.from('clients').insert({
    organization_id: mem.organizationId,
    created_by: kr.session.user.id,
    full_name: `No service ${stamp}`,
    notes: 'should-fail',
    is_fictional: true,
  });
  assert.ok(missing.error, 'insert without service_type must fail (no database default)');

  for (const serviceType of ['nutrition', 'programming', 'complete']) {
    const ok = await insertClient(kr.supabase, {
      organizationId: mem.organizationId,
      userId: kr.session.user.id,
      fullName: `Valid ${serviceType} ${stamp}`,
      serviceType,
    });
    assert.ifError(ok.error);
    assert.equal(ok.data.service_type, serviceType);
    const { error: delErr } = await kr.supabase.from('clients').delete().eq('id', ok.data.id);
    assert.ifError(delErr);
  }

  const invalid = await insertClient(kr.supabase, {
    organizationId: mem.organizationId,
    userId: kr.session.user.id,
    fullName: `Gold ${stamp}`,
    serviceType: 'gold',
  });
  assert.ok(invalid.error, 'invalid service_type must fail CHECK');
});

test('live: dossier RLS by service + service change preserves payload and intake', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  if (!fs.existsSync(coachPasswordsLocalPath(root))) {
    t.skip('.coach-passwords.local missing');
    return;
  }
  const [krEntry, elevateEntry] = loadCoachPasswordsLocal(root);
  if (!krEntry || !elevateEntry) {
    t.skip('need KR and Elevate password entries');
    return;
  }

  const kr = await signIn(krEntry);
  const elevate = await signIn(elevateEntry);
  const krMem = await membershipFor(kr.supabase, kr.session.user.id);
  const elevMem = await membershipFor(elevate.supabase, elevate.session.user.id);
  const krStore = createSupabaseClientDossierStore(kr.supabase);
  const elevStore = createSupabaseClientDossierStore(elevate.supabase);

  const probe = await kr.supabase.from('clients').select('service_type').limit(1);
  if (probe.error && /service_type/i.test(probe.error.message)) {
    t.skip('Apply 20260814190000_client_service_type.sql to the live project first');
    return;
  }

  const stamp = Date.now();
  const created = [];
  async function trackedInsert(supabase, args) {
    const result = await insertClient(supabase, args);
    assert.ifError(result.error);
    created.push({ supabase, id: result.data.id });
    return result.data;
  }

  t.after(async () => {
    for (const row of created.reverse()) {
      await row.supabase.from('clients').delete().eq('id', row.id);
    }
    await kr.supabase.auth.signOut();
    await elevate.supabase.auth.signOut();
  });

  const nutrition = await trackedInsert(kr.supabase, {
    organizationId: krMem.organizationId,
    userId: kr.session.user.id,
    fullName: `Svc Nut ${stamp}`,
    serviceType: 'nutrition',
  });
  const programming = await trackedInsert(kr.supabase, {
    organizationId: krMem.organizationId,
    userId: kr.session.user.id,
    fullName: `Svc Prog ${stamp}`,
    serviceType: 'programming',
  });
  const complete = await trackedInsert(kr.supabase, {
    organizationId: krMem.organizationId,
    userId: kr.session.user.id,
    fullName: `Svc Comp ${stamp}`,
    serviceType: 'complete',
  });
  const elevNutrition = await trackedInsert(elevate.supabase, {
    organizationId: elevMem.organizationId,
    userId: elevate.session.user.id,
    fullName: `Svc Elev ${stamp}`,
    serviceType: 'nutrition',
  });

  assert.equal(assertWorkspaceClientAccess({ client: nutrition, membership: krMem }).serviceType, 'nutrition');
  assert.equal(assertWorkspaceClientAccess({ client: complete, membership: krMem }).serviceType, 'complete');
  assert.throws(
    () => assertWorkspaceClientAccess({ client: programming, membership: krMem }),
    (err) => err.code === NUTRITION_ENTITLEMENT_DENIED_CODE,
  );
  assert.throws(
    () => assertWorkspaceClientAccess({ client: elevNutrition, membership: krMem }),
    /autre organisation/i,
  );

  const switcher = nutritionEligibleClients([nutrition, programming, complete]);
  assert.deepEqual(switcher.map((row) => row.id).sort(), [nutrition.id, complete.id].sort());

  const marker = `keep-${stamp}`;
  const nutritionInsert = await kr.supabase.from('client_dossiers').insert({
    client_id: nutrition.id,
    organization_id: krMem.organizationId,
    updated_by: kr.session.user.id,
    schema_version: 1,
    payload: samplePayload(marker),
  }).select('id').single();
  assert.ifError(nutritionInsert.error);

  const completeInsert = await kr.supabase.from('client_dossiers').insert({
    client_id: complete.id,
    organization_id: krMem.organizationId,
    updated_by: kr.session.user.id,
    schema_version: 1,
    payload: samplePayload(`complete-${stamp}`),
  }).select('id').single();
  assert.ifError(completeInsert.error);

  const programmingInsert = await kr.supabase.from('client_dossiers').insert({
    client_id: programming.id,
    organization_id: krMem.organizationId,
    updated_by: kr.session.user.id,
    schema_version: 1,
    payload: samplePayload(`prog-${stamp}`),
  }).select('id').single();
  assert.ok(programmingInsert.error, 'INSERT programming dossier must be denied');

  const { data: selectNutrition } = await kr.supabase
    .from('client_dossiers')
    .select('id, payload')
    .eq('client_id', nutrition.id);
  const { data: selectComplete } = await kr.supabase
    .from('client_dossiers')
    .select('id, payload')
    .eq('client_id', complete.id);
  const { data: selectProgramming } = await kr.supabase
    .from('client_dossiers')
    .select('id')
    .eq('client_id', programming.id);
  assert.equal(selectNutrition?.length, 1);
  assert.equal(selectComplete?.length, 1);
  assert.equal(selectProgramming?.length || 0, 0);

  const { data: updatedNutrition, error: nutritionUpdateErr } = await kr.supabase
    .from('client_dossiers')
    .update({ schema_version: 1 })
    .eq('client_id', nutrition.id)
    .select('id');
  assert.ifError(nutritionUpdateErr);
  assert.equal(updatedNutrition?.length, 1);
  const { data: updatedComplete, error: completeUpdateErr } = await kr.supabase
    .from('client_dossiers')
    .update({ schema_version: 1 })
    .eq('client_id', complete.id)
    .select('id');
  assert.ifError(completeUpdateErr);
  assert.equal(updatedComplete?.length, 1);

  const nutritionLoaded = await krStore.loadClientDossier(nutrition.id);
  const completeLoaded = await krStore.loadClientDossier(complete.id);
  assert.equal(nutritionLoaded.payload.coachNotes, `note-${marker}`);
  assert.equal(completeLoaded.payload.coachNotes, `note-complete-${stamp}`);

  await assert.rejects(
    () => krStore.saveClientDossier(programming.id, samplePayload(`prog-${stamp}`), {
      organizationId: krMem.organizationId,
      userId: kr.session.user.id,
    }),
    /./,
  );
  assert.equal(await krStore.loadClientDossier(programming.id), null);

  const { data: invite, error: inviteErr } = await kr.supabase.rpc('create_client_intake_invite', {
    p_client_id: nutrition.id,
    p_expires_in_days: 14,
  });
  assert.ifError(inviteErr);
  const createdInvite = Array.isArray(invite) ? invite[0] : invite;
  assert.ok(createdInvite?.token, 'nutrition clients must still receive intake links');

  const { data: programmingInvite, error: programmingInviteErr } = await kr.supabase.rpc('create_client_intake_invite', {
    p_client_id: programming.id,
    p_expires_in_days: 14,
  });
  assert.ifError(programmingInviteErr);
  assert.ok((Array.isArray(programmingInvite) ? programmingInvite[0] : programmingInvite)?.token);

  const { error: toProgrammingErr } = await kr.supabase
    .from('clients')
    .update({ service_type: 'programming' })
    .eq('id', nutrition.id)
    .eq('organization_id', krMem.organizationId);
  assert.ifError(toProgrammingErr);

  assert.equal(await krStore.loadClientDossier(nutrition.id), null);
  await assert.rejects(
    () => krStore.saveClientDossier(nutrition.id, samplePayload(`rewrite-${stamp}`), {
      organizationId: krMem.organizationId,
      userId: kr.session.user.id,
    }),
    /./,
  );
  const { data: updatedWhileProgramming, error: updateErr } = await kr.supabase
    .from('client_dossiers')
    .update({ schema_version: 1 })
    .eq('client_id', nutrition.id)
    .select('id')
    .maybeSingle();
  assert.equal(updatedWhileProgramming, null);
  assert.ok(!updateErr || /row-level security|0 rows/i.test(updateErr.message || ''));

  const { data: inviteAfter } = await kr.supabase
    .from('client_intake_invites')
    .select('id, status')
    .eq('client_id', nutrition.id)
    .eq('id', createdInvite.invite_id || createdInvite.id)
    .maybeSingle();
  assert.ok(inviteAfter?.id, 'service change must not delete intake');

  const { error: backToNutritionErr } = await kr.supabase
    .from('clients')
    .update({ service_type: 'nutrition' })
    .eq('id', nutrition.id)
    .eq('organization_id', krMem.organizationId);
  assert.ifError(backToNutritionErr);

  const restored = await krStore.loadClientDossier(nutrition.id);
  assert.equal(restored.payload.coachNotes, `note-${marker}`);
  assert.notEqual(restored.payload.coachNotes, `note-rewrite-${stamp}`);

  const { error: toCompleteErr } = await kr.supabase
    .from('clients')
    .update({ service_type: 'complete' })
    .eq('id', programming.id)
    .eq('organization_id', krMem.organizationId);
  assert.ifError(toCompleteErr);
  await krStore.saveClientDossier(programming.id, samplePayload(`now-complete-${stamp}`), {
    organizationId: krMem.organizationId,
    userId: kr.session.user.id,
  });
  const nowComplete = await krStore.loadClientDossier(programming.id);
  assert.equal(nowComplete.payload.coachNotes, `note-now-complete-${stamp}`);

  assert.equal(await krStore.loadClientDossier(elevNutrition.id), null);
  await assert.rejects(
    () => krStore.saveClientDossier(elevNutrition.id, samplePayload('cross'), {
      organizationId: elevMem.organizationId,
      userId: kr.session.user.id,
    }),
    /./,
  );

  const { error: deleteVisibleDossierErr } = await kr.supabase
    .from('client_dossiers')
    .delete()
    .eq('client_id', programming.id);
  assert.ifError(deleteVisibleDossierErr);
  const { data: afterVisibleDelete } = await kr.supabase
    .from('client_dossiers')
    .select('id')
    .eq('client_id', programming.id);
  assert.equal(afterVisibleDelete?.length || 0, 0, 'DELETE of an entitled dossier must remain allowed');

  const { error: toProgAgainErr } = await kr.supabase
    .from('clients')
    .update({ service_type: 'programming' })
    .eq('id', complete.id);
  assert.ifError(toProgAgainErr);

  const { data: hiddenAfterServiceChange } = await kr.supabase
    .from('client_dossiers')
    .select('id')
    .eq('client_id', complete.id);
  assert.equal(hiddenAfterServiceChange?.length || 0, 0, 'complete -> programming must hide existing dossier');

  const { error: clientDeleteErr } = await kr.supabase.from('clients').delete().eq('id', complete.id);
  assert.ifError(clientDeleteErr);
  created.splice(created.findIndex((row) => row.id === complete.id), 1);
});
