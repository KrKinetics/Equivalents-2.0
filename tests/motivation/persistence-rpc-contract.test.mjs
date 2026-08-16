/**
 * SQL contract for token, autosave, submit, and isolation behavior.
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

function fnBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, name);
  const next = sql.indexOf('create or replace function public.', start + 10);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

test('token RPCs refuse bad, expired, revoked, and already-submitted links', () => {
  for (const name of ['get_client_motivation', 'save_client_motivation', 'submit_client_motivation']) {
    const body = fnBody(name);
    assert.match(body, /length\(p_token\) < 24 or length\(p_token\) > 160/);
    assert.match(body, /Lien invalide ou remplacé/);
    assert.match(body, /Ce lien est expiré/);
    assert.match(body, /private\.client_motivation_token_hash\(p_token\)/);
    assert.doesNotMatch(body, /raise exception '%', p_token/i);
    assert.doesNotMatch(body, /raise exception[^;]*token_hash/i);
  }
  assert.match(fnBody('save_client_motivation'), /Le formulaire a déjà été soumis/);
  assert.match(fnBody('submit_client_motivation'), /Le formulaire a déjà été soumis/);
});

test('autosave accepts partial arrays and never runs the engine', () => {
  const body = fnBody('save_client_motivation');
  assert.match(body, /jsonb_typeof\(p_answers\) <> 'array'/);
  assert.match(body, /status = 'draft'/);
  assert.doesNotMatch(body, /analyze|scoring|ruleset|report_model|analysis_snapshot/i);
  assert.match(body, /on conflict \(invite_id\) do update/);
});

test('submit requires consent, freezes answers, and rejects a second submit', () => {
  const body = fnBody('submit_client_motivation');
  assert.match(body, /p_consent_given is not true/);
  assert.match(body, /status = 'submitted'/);
  assert.match(body, /where public\.client_motivation_responses\.status = 'draft'/);
  assert.doesNotMatch(body, /p_analysis_snapshot|p_definition_snapshot/);
});

test('get returns only form fields and never analysis internals', () => {
  const body = fnBody('get_client_motivation');
  assert.match(body, /'invite_id'/);
  assert.match(body, /'client_name'/);
  assert.match(body, /'organization_name'/);
  assert.match(body, /'content_hash'/);
  assert.match(body, /'presented_question_codes'/);
  assert.match(body, /'consent_given'/);
  const returned = body.slice(body.lastIndexOf('return jsonb_build_object'));
  assert.doesNotMatch(returned, /token_hash|analysis_snapshot|scoring|contradictions/);
  assert.match(body, /status = 'opened'/);
});

test('org isolation is membership-scoped on every motivation table', () => {
  assert.match(sql, /is_member_of\(client_motivation_invites\.organization_id\)/);
  assert.match(sql, /is_member_of\(client_motivation_responses\.organization_id\)/);
  assert.match(sql, /is_member_of\(client_motivation_analysis_versions\.organization_id\)/);
  assert.match(fnBody('persist_client_motivation_analysis'), /is_member_of\(v_response\.organization_id\)/);
});
