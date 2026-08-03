/**
 * Static checks for Coach Auth + Organizations SQL migration.
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

test('migration isolates clients by organization membership', () => {
  assert.match(sql, /clients_select_org/);
  assert.match(sql, /clients_insert_org/);
  assert.match(sql, /clients_update_org/);
  assert.match(sql, /clients_delete_org/);
  assert.match(sql, /is_member_of\(organization_id\)/);
  assert.match(sql, /is_fictional = true/);
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
