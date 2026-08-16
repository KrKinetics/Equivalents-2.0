/**
 * Static security and schema checks for motivation assessment persistence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260816140000_client_motivation_assessment.sql'),
  'utf8',
);
const intakeSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260806111500_client_pre_interview_intake.sql'),
  'utf8',
);

const TABLES = [
  'client_motivation_invites',
  'client_motivation_responses',
  'client_motivation_analysis_versions',
];

test('motivation migration stores hashed tokens and three official tables', () => {
  for (const table of TABLES) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  }
  assert.match(sql, /token_hash text not null unique/i);
  assert.match(sql, /private\.client_motivation_token_hash/i);
  assert.match(sql, /extensions\.digest\(p_token, 'sha256'\)/i);
  assert.doesNotMatch(sql, /\btoken\s+text\s+not null/i);
  assert.match(sql, /octet_length\(answers::text\) <= 65536/i);
  assert.match(sql, /cardinality\(presented_question_codes\) <= 64/i);
  assert.match(sql, /octet_length\(definition_snapshot::text\) <= 1048576/i);
  assert.match(sql, /octet_length\(analysis_snapshot::text\) <= 1048576/i);
});

test('motivation raw tables use ENABLE + FORCE RLS and are never granted to anon', () => {
  for (const table of TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, 'i'));
    assert.match(sql, new RegExp(`grant select on public\\.${table} to authenticated`, 'i'));
  }
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete).*client_motivation_.*to anon/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete).*client_motivation_.*to authenticated/i);
});

test('token hash helper is revoked from public roles', () => {
  assert.match(
    sql,
    /revoke all on function private\.client_motivation_token_hash\(text\) from public, anon, authenticated/i,
  );
});

test('create invite requires coach auth, membership, and fictional client', () => {
  assert.match(sql, /create or replace function public\.create_client_motivation_invite/i);
  assert.match(sql, /if auth\.uid\(\) is null then/i);
  assert.match(sql, /where m\.user_id = auth\.uid\(\)/i);
  assert.match(sql, /and c\.is_fictional = true/i);
  assert.match(sql, /status = 'revoked', revoked_at = now\(\)/i);
  assert.match(sql, /gen_random_bytes\(24\)/i);
  assert.match(
    sql,
    /grant execute on function public\.create_client_motivation_invite\([^)]+\) to authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.create_client_motivation_invite\([^)]+\) to anon/i,
  );
});

test('public token RPCs are narrow and persist never accepts analysis from the browser submit', () => {
  for (const fn of ['get_client_motivation', 'save_client_motivation', 'submit_client_motivation']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[^;]+to anon, authenticated`, 'i'));
    assert.match(sql, /private\.client_motivation_token_hash\(p_token\)/);
  }
  const submitBlock = sql.slice(sql.indexOf('create or replace function public.submit_client_motivation'));
  const submitOnly = submitBlock.slice(0, submitBlock.indexOf('create or replace function public.persist_client_motivation_analysis'));
  assert.doesNotMatch(submitOnly, /analysis_snapshot|definition_snapshot|scoring|ruleset/i);
  assert.match(submitOnly, /p_consent_given is not true/i);
});

test('persist analysis is coach-only, insert-only, and idempotent on same definitions', () => {
  assert.match(sql, /create or replace function public\.persist_client_motivation_analysis/i);
  assert.match(sql, /grant execute on function public\.persist_client_motivation_analysis\([^)]+\) to authenticated/i);
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.persist_client_motivation_analysis\([^)]+\) to anon/i,
  );
  assert.match(sql, /'idempotent', true/i);
  assert.match(sql, /motivation analysis versions are immutable/i);
  assert.match(sql, /submitted motivation answers are immutable/i);
  assert.match(sql, /unique \(response_id, analysis_version\)/i);
});

test('historical intake migration is not rewritten', () => {
  assert.doesNotMatch(intakeSql, /client_motivation_/);
  assert.match(intakeSql, /create table if not exists public\.client_intake_invites/i);
});
