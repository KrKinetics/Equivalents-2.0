/**
 * Public env validators (deterministic) + live security checks (publishable key only).
 * Live tests skip when hasLiveSupabaseEnv is false. Does not print secret values.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  hasLiveSupabaseEnv,
  isValidPublishableKey,
  isValidSupabaseUrl,
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

test('publishable env validator accepts https URL and publishable key prefixes', () => {
  assert.equal(isValidSupabaseUrl('https://example.supabase.co'), true);
  assert.equal(isValidSupabaseUrl('http://example.supabase.co'), false);
  assert.equal(isValidSupabaseUrl(''), false);
  assert.equal(isValidPublishableKey('sb_publishable_test_only_not_real'), true);
  assert.equal(isValidPublishableKey('eyJhbGciOiJIUzI1NiJ9.e30.xx'), true);
  assert.equal(isValidPublishableKey('not-a-key'), false);
  assert.equal(isValidPublishableKey(''), false);

  assert.equal(hasLiveSupabaseEnv({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_real',
  }), true);
  assert.equal(hasLiveSupabaseEnv({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'bad-key',
  }), false);
  assert.equal(hasLiveSupabaseEnv({
    SUPABASE_URL: 'http://insecure.example',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_real',
  }), false);
  // SERVICE_ROLE alone never enables live mode
  assert.equal(hasLiveSupabaseEnv({
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.e30.xx',
  }), false);
  assert.equal(hasLiveSupabaseEnv({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_real',
    SUPABASE_SERVICE_ROLE_KEY: 'must-be-ignored-for-gate',
  }), true);
});

test('.env.example declares expected public Supabase variable names', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /^SUPABASE_URL=\s*$/m);
  assert.match(example, /^SUPABASE_PUBLISHABLE_KEY=\s*$/m);
  assert.doesNotMatch(example, /^SUPABASE_SERVICE_ROLE_KEY=\S+/m);
  assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_/);
});

test('live: configured public env uses https URL and publishable key prefix', (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  const { url, publishableKey } = requireSupabasePublicEnv(root);
  assert.ok(isValidSupabaseUrl(url));
  assert.ok(isValidPublishableKey(publishableKey));
  assert.ok(publishableKey.startsWith('sb_publishable_') || publishableKey.startsWith('eyJ'));
});

test('anonymous session cannot read clients / organizations / memberships', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  const supabase = anonClient();
  const { data: sessionData } = await supabase.auth.getSession();
  assert.equal(sessionData.session, null);

  for (const table of ['clients', 'organizations', 'memberships', 'profiles', 'client_dossiers']) {
    const { data, error } = await supabase.from(table).select('*').limit(5);
    if (error && /does not exist|schema cache|Could not find the table/i.test(error.message)) {
      assert.fail(
        `Table public.${table} is missing in the Supabase project. Apply supabase/migrations/20260803120000_coach_auth_organizations.sql before continuing.`,
      );
    }
    // RLS: either error or empty — never rows for anon
    assert.ok(!data || data.length === 0, `anon unexpectedly read rows from ${table}`);
  }
});

test('public sign-up is disabled (shouldCreateUser false path)', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  const supabase = anonClient();
  const email = `public-signup-probe-${Date.now()}@example.invalid`;
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  assert.equal(data?.user ?? null, null);
  assert.ok(error, 'expected OTP for unknown user to fail when public sign-up is disabled');
});
