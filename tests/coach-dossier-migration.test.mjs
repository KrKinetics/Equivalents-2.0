/**
 * Static checks for Coach client_dossiers SQL migrations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260803200000_coach_client_dossiers.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const realClientRlsSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260817182557_real_clients_rls_policies.sql'),
  'utf8',
);

test('dossiers migration defines required columns and unique client_id', () => {
  assert.match(sql, /create table if not exists public\.client_dossiers/i);
  for (const col of [
    'id',
    'client_id',
    'organization_id',
    'schema_version',
    'payload',
    'updated_by',
    'created_at',
    'updated_at',
  ]) {
    assert.match(sql, new RegExp(`\\b${col}\\b`, 'i'));
  }
  assert.match(sql, /client_id uuid not null unique/i);
  assert.match(sql, /payload jsonb not null/i);
});

test('final dossier RLS keeps org isolation and real-client service eligibility', () => {
  assert.match(sql, /alter table public\.client_dossiers enable row level security/i);
  assert.match(sql, /alter table public\.client_dossiers force row level security/i);
  assert.match(realClientRlsSql, /client_dossiers_select_org/);
  assert.match(realClientRlsSql, /client_dossiers_insert_org/);
  assert.match(realClientRlsSql, /client_dossiers_update_org/);
  assert.match(sql, /client_dossiers_delete_org/);
  assert.match(realClientRlsSql, /is_member_of\(client_dossiers\.organization_id\)/i);
  assert.match(realClientRlsSql, /c\.service_type = any \(array\['nutrition'::text, 'complete'::text\]\)/i);
  assert.doesNotMatch(realClientRlsSql, /c\.is_fictional\s*=\s*true/i);
});

test('dossiers migration blocks tenant moves and anon access', () => {
  assert.match(sql, /client_dossiers_prevent_tenant_move/);
  assert.match(sql, /organization_id is immutable/i);
  assert.match(sql, /revoke all on public\.client_dossiers from anon/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete).*client_dossiers.*to anon/i);
});
