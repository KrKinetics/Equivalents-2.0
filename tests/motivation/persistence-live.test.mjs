/**
 * Synthetic DEV E2E for motivation persistence. Fictional client only. No email.
 * Skips when live Supabase env or coach passwords are unavailable.
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
  requireSupabasePublicEnv,
  skipWithoutLiveSupabase,
} from '../../scripts/load-env-local.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import { createClientMotivationInvite } from '../../src/coach/server/motivation/create-motivation-invite.mjs';
import { processSubmittedMotivationAssessment } from '../../src/coach/server/motivation/process-submitted-motivation.mjs';
import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

function skipWithoutPasswords(t) {
  if (!fs.existsSync(coachPasswordsLocalPath(root))) {
    t.skip('.coach-passwords.local missing');
    return true;
  }
  return false;
}

test('live: fictional client can create, autosave, resume, submit, and analyze v4.2', async (t) => {
  if (skipWithoutLiveSupabase(t, root)) return;
  if (skipWithoutPasswords(t)) return;

  const env = requireSupabasePublicEnv(root);
  assert.match(env.url, /dejvihtpgsgnqfqhdhzc/);

  const [krEntry, elevateEntry] = loadCoachPasswordsLocal(root);
  const kr = await signIn(krEntry);
  const elevate = await signIn(elevateEntry);
  const krMem = await membershipFor(kr.supabase, kr.session.user.id);
  const elevMem = await membershipFor(elevate.supabase, elevate.session.user.id);
  const engine = resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
  });
  const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE, {
    clientName: 'Motivation DEV',
  });

  const stamp = Date.now();
  const { data: client, error: insertError } = await kr.supabase.from('clients').insert({
    organization_id: krMem.organizationId,
    created_by: kr.session.user.id,
    full_name: `MOT DEV ${stamp}`,
    notes: 'motivation-persistence-e2e',
    is_fictional: true,
    service_type: 'nutrition',
  }).select('id, organization_id, is_fictional').single();
  assert.ifError(insertError);

  t.after(async () => {
    await kr.supabase.from('clients').delete().eq('id', client.id);
    await kr.supabase.auth.signOut();
    await elevate.supabase.auth.signOut();
  });

  const missing = await createClientMotivationInvite({
    accessToken: kr.session.access_token,
    clientId: '00000000-0000-4000-8000-000000000000',
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
  });
  assert.equal(missing.ok, false);

  const otherOrg = await createClientMotivationInvite({
    accessToken: elevate.session.access_token,
    clientId: client.id,
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
  });
  assert.equal(otherOrg.ok, false);

  const first = await createClientMotivationInvite({
    accessToken: kr.session.access_token,
    clientId: client.id,
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
  });
  assert.equal(first.ok, true);
  assert.ok(first.token.length >= 24);
  assert.equal(first.contentHash, engine.contentHash);

  const { data: storedInvites } = await kr.supabase
    .from('client_motivation_invites')
    .select('id, token_hash, status, content_hash')
    .eq('client_id', client.id);
  assert.ok(storedInvites?.length >= 1);
  assert.equal(storedInvites.some((row) => row.token_hash === first.token), false);
  assert.ok(storedInvites.every((row) => typeof row.token_hash === 'string' && row.token_hash.length === 64));

  const second = await createClientMotivationInvite({
    accessToken: kr.session.access_token,
    clientId: client.id,
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
  });
  assert.equal(second.ok, true);
  assert.notEqual(second.token, first.token);

  const revoked = await anonClient().rpc('get_client_motivation', { p_token: first.token });
  assert.ok(revoked.error, 'revoked first token must fail');

  const loaded = await anonClient().rpc('get_client_motivation', { p_token: second.token });
  assert.ifError(loaded.error);
  assert.equal(loaded.data.invite_status, 'opened');
  assert.equal(loaded.data.questionnaire_version, QUESTIONNAIRE_V41);
  assert.equal(Object.prototype.hasOwnProperty.call(loaded.data, 'token_hash'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(loaded.data, 'analysis_snapshot'), false);

  const partialAnswers = submission.answers.slice(0, 3);
  const partialCodes = submission.presentedQuestionCodes.slice(0, 3);
  const saved = await anonClient().rpc('save_client_motivation', {
    p_token: second.token,
    p_answers: partialAnswers,
    p_presented_question_codes: partialCodes,
    p_consent_given: false,
  });
  assert.ifError(saved.error);
  assert.equal(saved.data.status, 'saved');

  const reloaded = await anonClient().rpc('get_client_motivation', { p_token: second.token });
  assert.ifError(reloaded.error);
  assert.equal(reloaded.data.answers.length, 3);
  assert.equal(reloaded.data.response_status, 'draft');

  const savedAgain = await anonClient().rpc('save_client_motivation', {
    p_token: second.token,
    p_answers: submission.answers,
    p_presented_question_codes: submission.presentedQuestionCodes,
    p_consent_given: true,
  });
  assert.ifError(savedAgain.error);

  const noConsent = await anonClient().rpc('submit_client_motivation', {
    p_token: second.token,
    p_answers: submission.answers,
    p_presented_question_codes: submission.presentedQuestionCodes,
    p_consent_given: false,
  });
  assert.ok(noConsent.error);

  const submitted = await anonClient().rpc('submit_client_motivation', {
    p_token: second.token,
    p_answers: submission.answers,
    p_presented_question_codes: submission.presentedQuestionCodes,
    p_consent_given: true,
  });
  assert.ifError(submitted.error);
  assert.equal(submitted.data.status, 'submitted');

  const secondSubmit = await anonClient().rpc('submit_client_motivation', {
    p_token: second.token,
    p_answers: submission.answers,
    p_presented_question_codes: submission.presentedQuestionCodes,
    p_consent_given: true,
  });
  assert.ok(secondSubmit.error);

  const postSubmitSave = await anonClient().rpc('save_client_motivation', {
    p_token: second.token,
    p_answers: partialAnswers,
    p_presented_question_codes: partialCodes,
    p_consent_given: true,
  });
  assert.ok(postSubmitSave.error);

  const asElevate = await elevate.supabase
    .from('client_motivation_invites')
    .select('id')
    .eq('client_id', client.id);
  assert.equal((asElevate.data || []).length, 0);

  const processed = await processSubmittedMotivationAssessment({
    accessToken: kr.session.access_token,
    organizationId: krMem.organizationId,
    clientId: client.id,
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
  });
  assert.equal(processed.ok, true);
  assert.equal(processed.analysisVersion, 1);
  assert.equal(processed.analysisSnapshot.schemaVersion, REPORT_MODEL_V42);

  const again = await processSubmittedMotivationAssessment({
    accessToken: kr.session.access_token,
    organizationId: krMem.organizationId,
    clientId: client.id,
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
  });
  assert.equal(again.ok, true);
  assert.equal(again.idempotent, true);
  assert.equal(again.analysisVersion, 1);

  const { data: versions } = await kr.supabase
    .from('client_motivation_analysis_versions')
    .select('analysis_version, report_model_version, analysis_snapshot')
    .eq('client_id', client.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].report_model_version, REPORT_MODEL_V42);
  assert.equal(versions[0].analysis_snapshot.schemaVersion, REPORT_MODEL_V42);

  void elevMem;
});
