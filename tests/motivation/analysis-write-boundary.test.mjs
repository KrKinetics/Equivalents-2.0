/**
 * 2A.1 trust boundary: authenticated browsers cannot persist official analysis.
 * The trusted server path may persist after Coach JWT authorization.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { processSubmittedMotivationAssessment } from '../../src/coach/server/motivation/process-submitted-motivation.mjs';
import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hardenSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260816154500_harden_motivation_analysis_write.sql'),
  'utf8',
);
const originalSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260816140000_client_motivation_assessment.sql'),
  'utf8',
);

const ORG = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG = '22222222-2222-2222-2222-222222222222';
const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const INVITE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RESPONSE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANALYSIS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SERVICE_ROLE = 'service_role_test_key_not_real';

const ENGINE = resolveMotivationEngine({
  questionnaireVersion: QUESTIONNAIRE_V41,
  rulesetVersion: RULESET_V41,
  reportModelVersion: REPORT_MODEL_V42,
});
const SUBMISSION = buildCompleteMotivationSubmission(PROFILE_A_STABLE, {
  assessmentId: RESPONSE_ID,
  clientId: CLIENT_ID,
  clientName: 'Client fiction',
});

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function createFetchMock({
  persistStatus = 200,
  persistPayload = {
    id: ANALYSIS_ID,
    analysis_version: 1,
    idempotent: false,
    created_at: '2026-08-16T16:05:00.000Z',
  },
  analyses = [],
  clientRow = {
    id: CLIENT_ID,
    organization_id: ORG,
    full_name: 'Client fiction',
    is_fictional: true,
  },
  inviteOverrides = {},
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/rest/v1/clients')) return jsonResponse(200, [clientRow]);
    if (u.includes('/rest/v1/rpc/persist_client_motivation_analysis')) {
      return jsonResponse(persistStatus, persistPayload);
    }
    if (u.includes('/rest/v1/client_motivation_responses')) {
      return jsonResponse(200, [{
        id: RESPONSE_ID,
        invite_id: INVITE_ID,
        client_id: CLIENT_ID,
        organization_id: ORG,
        status: 'submitted',
        answers: SUBMISSION.answers,
        presented_question_codes: SUBMISSION.presentedQuestionCodes,
        consent_given: true,
        submitted_at: '2026-08-16T16:00:00.000Z',
      }]);
    }
    if (u.includes('/rest/v1/client_motivation_invites')) {
      return jsonResponse(200, [{
        id: INVITE_ID,
        client_id: CLIENT_ID,
        organization_id: ORG,
        questionnaire_version: ENGINE.questionnaireVersion,
        ruleset_version: ENGINE.rulesetVersion,
        report_model_version: ENGINE.reportModelVersion,
        content_hash: ENGINE.contentHash,
        status: 'submitted',
        submitted_at: '2026-08-16T16:00:00.000Z',
        ...inviteOverrides,
      }]);
    }
    if (u.includes('/rest/v1/client_motivation_analysis_versions')) {
      return jsonResponse(200, analyses);
    }
    throw new Error(`unexpected url in test mock: ${u}`);
  };
  return { fetchImpl, calls };
}

const BASE = {
  accessToken: 'coach-jwt',
  organizationId: ORG,
  clientId: CLIENT_ID,
  createdByUserId: USER_ID,
  serviceRoleKey: SERVICE_ROLE,
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test_key',
};

test('harden migration revokes persist from anon and authenticated', () => {
  assert.match(hardenSql, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(hardenSql, /p_created_by uuid/);
  assert.match(
    hardenSql,
    /revoke all on function public\.persist_client_motivation_analysis\([\s\S]+?\) from public, anon, authenticated/,
  );
  assert.match(
    hardenSql,
    /grant execute on function public\.persist_client_motivation_analysis\([\s\S]+?\) to service_role/,
  );
  assert.doesNotMatch(
    hardenSql,
    /grant execute on function public\.persist_client_motivation_analysis\([\s\S]+?\) to authenticated/,
  );
  assert.doesNotMatch(
    hardenSql,
    /grant execute on function public\.persist_client_motivation_analysis\([\s\S]+?\) to anon/,
  );
});

test('harden migration adds covering FK indexes and does not drop unused ones', () => {
  assert.match(hardenSql, /client_motivation_analysis_versions_client_id_idx/);
  assert.match(hardenSql, /client_motivation_analysis_versions_created_by_idx/);
  assert.match(hardenSql, /client_motivation_invites_created_by_idx/);
  assert.doesNotMatch(hardenSql, /drop index/i);
  assert.doesNotMatch(originalSql, /20260816154500/);
});

test('BROWSER AUTHENTICATED USER cannot call persist after revoke', () => {
  assert.match(hardenSql, /if auth\.role\(\) is distinct from 'service_role' then/);
  assert.match(hardenSql, /raise exception 'Server only'/);
  const grantBlock = hardenSql.slice(hardenSql.lastIndexOf('revoke all on function public.persist_client_motivation_analysis'));
  assert.match(grantBlock, /from public, anon, authenticated/);
  assert.doesNotMatch(grantBlock, /to authenticated/);
});

test('SERVER TRUSTED PATH persists official analysis for the same response', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.analysisVersion, 1);
  assert.equal(result.analysisSnapshot.schemaVersion, REPORT_MODEL_V42);
  const persist = calls.find((call) => call.url.includes('persist_client_motivation_analysis'));
  assert.ok(persist);
  assert.equal(persist.init.headers.Authorization, `Bearer ${SERVICE_ROLE}`);
  assert.notEqual(persist.init.headers.Authorization, 'Bearer coach-jwt');
  const body = JSON.parse(persist.init.body);
  assert.equal(body.p_created_by, USER_ID);
  assert.equal(body.p_content_hash, ENGINE.contentHash);
});

test('cross-org is refused before any persist', async () => {
  const { fetchImpl, calls } = createFetchMock({
    clientRow: {
      id: CLIENT_ID,
      organization_id: OTHER_ORG,
      full_name: 'Other',
      is_fictional: true,
    },
  });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('hash mismatch is refused before any persist', async () => {
  const { fetchImpl, calls } = createFetchMock({
    inviteOverrides: { content_hash: 'a'.repeat(64) },
  });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'hash_mismatch');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('unknown engine is refused before any persist', async () => {
  const { fetchImpl, calls } = createFetchMock({
    inviteOverrides: {
      questionnaire_version: 'questionnaire-v9',
      content_hash: 'b'.repeat(64),
    },
  });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown_engine');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('idempotence returns the existing analysis and never overwrites', async () => {
  const existing = {
    id: ANALYSIS_ID,
    analysis_version: 1,
    questionnaire_version: ENGINE.questionnaireVersion,
    ruleset_version: ENGINE.rulesetVersion,
    report_model_version: ENGINE.reportModelVersion,
    content_hash: ENGINE.contentHash,
    analysis_snapshot: { schemaVersion: REPORT_MODEL_V42 },
    created_at: '2026-08-16T16:05:00.000Z',
  };
  const { fetchImpl, calls } = createFetchMock({ analyses: [existing] });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.analysisVersion, 1);
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
  for (const call of calls) {
    const method = String(call.init?.method || 'GET').toUpperCase();
    assert.equal(/PATCH|PUT|DELETE/.test(method), false);
  }
});
