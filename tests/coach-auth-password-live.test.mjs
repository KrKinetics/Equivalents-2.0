/**
 * Live password auth + RLS checks (publishable key only).
 * Uses gitignored .coach-passwords.local when present.
 * Never prints passwords, tokens, or service_role.
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
  parseEnvFile,
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

function passwordsAvailable() {
  return fs.existsSync(coachPasswordsLocalPath(root));
}

async function signIn(entry) {
  const supabase = anonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: entry.email,
    password: entry.password,
  });
  assert.ifError(error);
  assert.ok(data.session, 'expected session');
  return { supabase, session: data.session };
}

async function membershipFor(supabase, userId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organization_id, organizations(slug, name)')
    .eq('user_id', userId)
    .maybeSingle();
  assert.ifError(error);
  assert.ok(data?.organizations?.slug, 'expected organization membership');
  return data;
}

async function insertFictionalClient(supabase, organizationId, userId, fullName) {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      created_by: userId,
      full_name: fullName,
      notes: 'rls-isolation-probe',
      is_fictional: true,
    })
    .select('id, organization_id, full_name')
    .single();
  assert.ifError(error);
  return data;
}

async function deleteClient(supabase, id) {
  await supabase.from('clients').delete().eq('id', id);
}

test('unknown user password login is refused (no auto-create)', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  const supabase = anonClient();
  const email = `unknown-password-probe-${Date.now()}@example.invalid`;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: 'definitely-not-a-real-password-xxx',
  });
  assert.equal(data?.session ?? null, null);
  assert.ok(error, 'expected unknown user password login to fail');
});

test('wrong password is refused when KR credentials file is present', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  if (!passwordsAvailable()) {
    t.skip('.coach-passwords.local not present — set passwords first');
    return;
  }
  const [kr] = loadCoachPasswordsLocal(root);
  const supabase = anonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: kr.email,
    password: `${kr.password}-wrong-suffix`,
  });
  assert.equal(data?.session ?? null, null);
  assert.ok(error, 'expected wrong password to fail');
});

test('KR and Elevate fictional clients are isolated by RLS', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  if (!passwordsAvailable()) {
    t.skip('.coach-passwords.local not present — set passwords first');
    return;
  }

  const [krEntry, elevateEntry] = loadCoachPasswordsLocal(root);
  const stamp = Date.now();
  const krName = `Fictif KR ${stamp}`;
  const elevateName = `Fictif Elevate ${stamp}`;

  let krClientId = null;
  let elevateClientId = null;
  let kr = null;
  let elevate = null;

  try {
    kr = await signIn(krEntry);
    const krMem = await membershipFor(kr.supabase, kr.session.user.id);
    assert.equal(krMem.organizations.slug, 'kr-kinetics');
    assert.equal(krMem.role, 'platform_owner');

    const krRow = await insertFictionalClient(
      kr.supabase,
      krMem.organization_id,
      kr.session.user.id,
      krName,
    );
    krClientId = krRow.id;

    elevate = await signIn(elevateEntry);
    const elevMem = await membershipFor(elevate.supabase, elevate.session.user.id);
    assert.equal(elevMem.organizations.slug, 'elevate-fitness');
    assert.equal(elevMem.role, 'coach');

    const elevRow = await insertFictionalClient(
      elevate.supabase,
      elevMem.organization_id,
      elevate.session.user.id,
      elevateName,
    );
    elevateClientId = elevRow.id;

    // KR must see own fictional client, never Elevate's.
    const { data: krVisible, error: krVisErr } = await kr.supabase
      .from('clients')
      .select('id, full_name, organization_id')
      .eq('id', krClientId)
      .maybeSingle();
    assert.ifError(krVisErr);
    assert.equal(krVisible?.id, krClientId);

    const { data: krLeak } = await kr.supabase
      .from('clients')
      .select('id, full_name')
      .eq('id', elevateClientId)
      .maybeSingle();
    assert.equal(krLeak, null, 'KR must not read Elevate fictional client');

    const { data: krCrossOrg } = await kr.supabase
      .from('clients')
      .select('id')
      .eq('organization_id', elevMem.organization_id);
    assert.ok(!krCrossOrg || krCrossOrg.length === 0, 'KR must not list Elevate org clients');

    // Elevate must see own fictional client, never KR's.
    const { data: elevVisible, error: elevVisErr } = await elevate.supabase
      .from('clients')
      .select('id, full_name, organization_id')
      .eq('id', elevateClientId)
      .maybeSingle();
    assert.ifError(elevVisErr);
    assert.equal(elevVisible?.id, elevateClientId);

    const { data: elevLeak } = await elevate.supabase
      .from('clients')
      .select('id, full_name')
      .eq('id', krClientId)
      .maybeSingle();
    assert.equal(elevLeak, null, 'Elevate must not read KR fictional client');

    const { data: elevCrossOrg } = await elevate.supabase
      .from('clients')
      .select('id')
      .eq('organization_id', krMem.organization_id);
    assert.ok(!elevCrossOrg || elevCrossOrg.length === 0, 'Elevate must not list KR org clients');
  } finally {
    if (kr?.supabase && krClientId) await deleteClient(kr.supabase, krClientId);
    if (elevate?.supabase && elevateClientId) await deleteClient(elevate.supabase, elevateClientId);
    if (kr?.supabase) await kr.supabase.auth.signOut();
    if (elevate?.supabase) await elevate.supabase.auth.signOut();
  }
});

test('signOut clears session (logout)', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  if (!passwordsAvailable()) {
    t.skip('.coach-passwords.local not present — set passwords first');
    return;
  }
  const [kr] = loadCoachPasswordsLocal(root);
  const { supabase, session } = await signIn(kr);
  assert.ok(session);

  const { error } = await supabase.auth.signOut();
  assert.ifError(error);
  const { data } = await supabase.auth.getSession();
  assert.equal(data.session, null);
});

test('dashboard guard redirects unauthenticated users to login.html', () => {
  const dashboardJs = fs.readFileSync(
    path.join(root, 'coach-portal/assets/dashboard.js'),
    'utf8',
  );
  assert.match(dashboardJs, /requireSession/);
  assert.match(dashboardJs, /redirectPreservingAuthParams\('\.\/login\.html'\)/);
  assert.match(dashboardJs, /signOut/);
  assert.match(dashboardJs, /redirectClean\('\.\/login\.html'\)/);
});

test('login keeps Magic Link secondary and password primary', () => {
  const html = fs.readFileSync(path.join(root, 'coach-portal/login.html'), 'utf8');
  assert.match(html, /mode-password[\s\S]*Connexion par mot de passe/);
  assert.match(html, /mode-magic[\s\S]*Recevoir un lien magique/);
  assert.match(html, /data-mode="password"/);

  const loginJs = fs.readFileSync(path.join(root, 'coach-portal/assets/login.js'), 'utf8');
  assert.match(loginJs, /applyMode\('password'\)/);
  assert.match(loginJs, /signInWithPassword/);
  assert.match(loginJs, /requestMagicLink/);
});

test('local secrets files are gitignored and not tracked', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /\.coach-passwords\.local/);
  assert.match(gitignore, /\.env\.\*/);
  assert.equal(fs.existsSync(path.join(root, '.coach-passwords.example')), true);

  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.doesNotMatch(example, /^SUPABASE_SERVICE_ROLE_KEY=.+/m);
  // Touch parse only to ensure file readable; never assert secret values.
  void (parseEnvFile(path.join(root, '.env.local')) || {});
});
