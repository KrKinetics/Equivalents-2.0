/**
 * Live RLS: KR cannot read Elevate real clients and vice versa.
 * Uses publishable key + gitignored passwords only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  assertWorkspaceClientAccess,
} from '../src/coach/workspace/workspace-access.mjs';
import { brandIdFromOrganizationSlug } from '../src/coach/workspace/org-brand.mjs';
import {
  coachPasswordsLocalPath,
  loadCoachPasswordsLocal,
  requireSupabasePublicEnv,
  skipWithoutLiveSupabase,
} from '../scripts/load-env-local.mjs';

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

test('live: KR cannot open Elevate real client; Elevate cannot open KR real client', async (t) => {
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
  assert.equal(brandIdFromOrganizationSlug(krMem.organization.slug), 'kr');
  assert.equal(brandIdFromOrganizationSlug(elevMem.organization.slug), 'elevate');

  const stamp = Date.now();
  const { data: krClient, error: krInsErr } = await kr.supabase.from('clients').insert({
    organization_id: krMem.organizationId,
    created_by: kr.session.user.id,
    full_name: `WS KR ${stamp}`,
    notes: 'workspace-cross-org',
    is_fictional: false,
    service_type: 'nutrition',
  }).select('id, full_name, notes, organization_id, is_fictional, service_type').single();
  assert.ifError(krInsErr);

  const { data: elevClient, error: elevInsErr } = await elevate.supabase.from('clients').insert({
    organization_id: elevMem.organizationId,
    created_by: elevate.session.user.id,
    full_name: `WS Elevate ${stamp}`,
    notes: 'workspace-cross-org',
    is_fictional: false,
    service_type: 'nutrition',
  }).select('id, full_name, notes, organization_id, is_fictional, service_type').single();
  assert.ifError(elevInsErr);

  t.after(async () => {
    await kr.supabase.from('clients').delete().eq('id', krClient.id);
    await elevate.supabase.from('clients').delete().eq('id', elevClient.id);
    await kr.supabase.auth.signOut();
    await elevate.supabase.auth.signOut();
  });

  // RLS: other org select returns null
  const { data: elevAsKr } = await kr.supabase
    .from('clients')
    .select('id, organization_id, is_fictional, full_name, notes')
    .eq('id', elevClient.id)
    .maybeSingle();
  assert.equal(elevAsKr, null);

  const { data: krAsElev } = await elevate.supabase
    .from('clients')
    .select('id, organization_id, is_fictional, full_name, notes')
    .eq('id', krClient.id)
    .maybeSingle();
  assert.equal(krAsElev, null);

  assert.throws(
    () => assertWorkspaceClientAccess({ client: elevClient, membership: krMem }),
    /autre organisation/i,
  );
  assert.throws(
    () => assertWorkspaceClientAccess({ client: krClient, membership: elevMem }),
    /autre organisation/i,
  );

  const krOk = assertWorkspaceClientAccess({ client: krClient, membership: krMem });
  const elevOk = assertWorkspaceClientAccess({ client: elevClient, membership: elevMem });
  assert.equal(krOk.brandId, 'kr');
  assert.equal(elevOk.brandId, 'elevate');
});
