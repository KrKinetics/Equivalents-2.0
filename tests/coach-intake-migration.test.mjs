/**
 * Static security and schema checks for the pre-interview intake migrations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260806111500_client_pre_interview_intake.sql'),
  'utf8',
);
const realInviteSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260817182714_real_clients_invite_functions.sql'),
  'utf8',
);
const realDossierRlsSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260817182557_real_clients_rls_policies.sql'),
  'utf8',
);

test('intake migration stores only token hashes and separates invites from responses', () => {
  assert.match(sql, /create table if not exists public\.client_intake_invites/i);
  assert.match(sql, /create table if not exists public\.client_intake_responses/i);
  assert.match(sql, /token_hash text not null unique/i);
  assert.doesNotMatch(sql, /\btoken\s+text\s+not null/i);
  assert.match(sql, /extensions\.digest\(p_token, 'sha256'\)/i);
  assert.match(sql, /client_intake_responses_answers_size/i);
});

test('intake raw tables use RLS and are never granted to anon', () => {
  for (const table of ['client_intake_invites', 'client_intake_responses']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
  }
  assert.match(sql, /revoke all on public\.client_intake_invites from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.client_intake_responses from anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete).*client_intake_(invites|responses).*to anon/i);
});

test('final intake invite creation supports real clients and still requires membership', () => {
  assert.match(realInviteSql, /create or replace function public\.create_client_intake_invite/i);
  assert.match(realInviteSql, /where m\.user_id = auth\.uid\(\)/i);
  assert.match(realInviteSql, /m\.organization_id = c\.organization_id/i);
  assert.doesNotMatch(realInviteSql, /c\.is_fictional\s*=\s*true/i);
  assert.match(sql, /grant execute on function public\.create_client_intake_invite\(uuid, integer\) to authenticated/i);
  for (const fn of ['get_client_intake', 'save_client_intake', 'submit_client_intake']) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[^;]+to anon, authenticated`, 'i'));
    assert.match(sql, new RegExp(`private\\.client_intake_token_hash\\(p_token\\)`, 'i'));
  }
});

test('final dossier policies qualify tenant columns and do not require fictional clients', () => {
  assert.match(realDossierRlsSql, /c\.organization_id = client_dossiers\.organization_id/i);
  assert.doesNotMatch(realDossierRlsSql, /c\.organization_id = c\.organization_id/i);
  assert.doesNotMatch(realDossierRlsSql, /c\.is_fictional\s*=\s*true/i);
});

test('submission validates required health details, challenge count, consent, and email', () => {
  assert.match(sql, /jsonb_array_length\(v_challenges\) > 3/i);
  assert.match(sql, /p_answers->'consent' <> 'true'::jsonb/i);
  assert.match(sql, /Adresse courriel invalide/);
  assert.match(sql, /Précisez les éléments de santé indiqués/);
});

test('touch trigger avoids typed invite_id access on invite rows', () => {
  assert.match(sql, /to_jsonb\(new\)->>'invite_id'/i);
  assert.doesNotMatch(
    sql,
    /tg_table_name = 'client_intake_responses'\s+and new\.invite_id is distinct from old\.invite_id/i,
  );
});
