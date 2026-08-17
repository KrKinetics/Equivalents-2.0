/**
 * Static checks for Coach Auth + Organizations SQL migrations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260803120000_coach_auth_organizations.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const realClientSql = [
  '20260817181203_allow_real_clients_and_default_real.sql',
  '20260817181258_enforce_real_clients.sql',
  '20260817182101_lock_force_real_client_flag_trigger_function.sql',
  '20260817182440_make_real_client_trigger_invoker.sql',
  '20260817182557_real_clients_rls_policies.sql',
].map((name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')).join('\n');

test('migration defines required tables and roles', () => {
  for (const table of ['organizations', 'profiles', 'memberships', 'clients']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  }
  assert.match(sql, /coach_role/);
  assert.match(sql, /platform_owner/);
  assert.match(sql, /'coach'/);
});

test('migration seeds KR Kinetics and Elevate Fitness', () => {
  assert.match(sql, /kr-kinetics/);
  assert.match(sql, /KR Kinetics/);
  assert.match(sql, /elevate-fitness/);
  assert.match(sql, /Elevate Fitness/);
});

test('migration enables forced RLS on all tenant tables', () => {
  for (const table of ['organizations', 'profiles', 'memberships', 'clients']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
  }
});

test('final client migrations enforce real-client rows with organization isolation', () => {
  assert.match(realClientSql, /alter column is_fictional set default false/i);
  assert.match(realClientSql, /clients_real_only check \(is_fictional = false\)/i);
  assert.match(realClientSql, /trg_force_real_client_flag/i);
  assert.match(realClientSql, /new\.is_fictional := false/i);
  assert.match(realClientSql, /clients_select_org/);
  assert.match(realClientSql, /clients_insert_org/);
  assert.match(realClientSql, /clients_update_org/);
  assert.match(realClientSql, /clients_delete_org/);
  assert.match(realClientSql, /is_member_of\(organization_id\)/);
  assert.match(realClientSql, /created_by = auth\.uid\(\) and is_fictional = false/i);
});

test('migration grants no table privileges to anon', () => {
  assert.match(sql, /revoke all on public\.clients from anon/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete).*to anon/i);
});

test('env example has no real secrets and no NEXT_PUBLIC_ vars', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /^SUPABASE_URL=\s*$/m);
  assert.match(example, /^SUPABASE_PUBLISHABLE_KEY=\s*$/m);
  assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_/);
  assert.doesNotMatch(example, /sb_publishable_/);
  assert.doesNotMatch(example, /https:\/\//);
});
