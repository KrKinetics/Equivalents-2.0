/**
 * Live security checks against the configured Supabase project (publishable key only).
 * Does not print secret values.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { requireSupabasePublicEnv } from '../scripts/load-env-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function anonClient() {
  const { url, publishableKey } = requireSupabasePublicEnv(root);
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test('env uses https URL and publishable key prefix', () => {
  const { url, publishableKey } = requireSupabasePublicEnv(root);
  assert.ok(url.startsWith('https://'));
  assert.ok(publishableKey.startsWith('sb_publishable_'));
});

test('anonymous session cannot read clients / organizations / memberships', async () => {
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

test('public sign-up is disabled (shouldCreateUser false path)', async () => {
  const supabase = anonClient();
  const email = `public-signup-probe-${Date.now()}@example.invalid`;
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  assert.equal(data?.user ?? null, null);
  assert.ok(error, 'expected OTP for unknown user to fail when public sign-up is disabled');
});
