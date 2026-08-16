/**
 * Coach-authenticated motivation persistence services — mocked network only.
 * Never logs tokens or answer payloads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { createClientMotivationInvite } from '../../src/coach/server/motivation/create-motivation-invite.mjs';
import { processSubmittedMotivationAssessment } from '../../src/coach/server/motivation/process-submitted-motivation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORG = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG = '22222222-2222-2222-2222-222222222222';
const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INVITE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RESPONSE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANALYSIS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OPAQUE_TOKEN = 'opaque_motivation_token_value_24ch';
const SERVICE_ROLE = 'service_role_test_key_not_real';
const EXPIRES_AT = '2026-08-30T12:00:00.000Z';

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

function submittedInvite(overrides = {}) {
  return {
    id: INVITE_ID,
    client_id: CLIENT_ID,
    organization_id: ORG,
    questionnaire_version: ENGINE.questionnaireVersion,
    ruleset_version: ENGINE.rulesetVersion,
    report_model_version: ENGINE.reportModelVersion,
    content_hash: ENGINE.contentHash,
    status: 'submitted',
    submitted_at: '2026-08-16T16:00:00.000Z',
    ...overrides,
  };
}

function submittedResponse(overrides = {}) {
  return {
    id: RESPONSE_ID,
    invite_id: INVITE_ID,
    client_id: CLIENT_ID,
    organization_id: ORG,
    status: 'submitted',
    answers: SUBMISSION.answers,
    presented_question_codes: SUBMISSION.presentedQuestionCodes,
    consent_given: true,
    submitted_at: '2026-08-16T16:00:00.000Z',
    ...overrides,
  };
}

function createFetchMock({
  clientRow = {
    id: CLIENT_ID,
    organization_id: ORG,
    full_name: 'Client fiction',
    is_fictional: true,
  },
  clientStatus = 200,
  inviteRow = submittedInvite(),
  responseRow = submittedResponse(),
  analyses = [],
  persistStatus = 200,
  persistPayload = {
    id: ANALYSIS_ID,
    analysis_version: 1,
    idempotent: false,
    created_at: '2026-08-16T16:05:00.000Z',
  },
  createStatus = 200,
  createPayload = [{
    invite_id: INVITE_ID,
    token: OPAQUE_TOKEN,
    expires_at: EXPIRES_AT,
    status: 'pending',
  }],
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/rest/v1/clients')) {
      return jsonResponse(clientStatus, clientRow ? [clientRow] : []);
    }
    if (u.includes('/rest/v1/rpc/create_client_motivation_invite')) {
      return jsonResponse(createStatus, createPayload);
    }
    if (u.includes('/rest/v1/rpc/persist_client_motivation_analysis')) {
      return jsonResponse(persistStatus, persistPayload);
    }
    if (u.includes('/rest/v1/client_motivation_responses')) {
      return jsonResponse(200, responseRow ? [responseRow] : []);
    }
    if (u.includes('/rest/v1/client_motivation_invites')) {
      return jsonResponse(200, inviteRow ? [inviteRow] : []);
    }
    if (u.includes('/rest/v1/client_motivation_analysis_versions')) {
      return jsonResponse(200, analyses);
    }
    throw new Error(`unexpected url in test mock: ${u}`);
  };
  return { fetchImpl, calls };
}

const BASE = {
  accessToken: 'tok',
  organizationId: ORG,
  clientId: CLIENT_ID,
  createdByUserId: USER_ID,
  serviceRoleKey: SERVICE_ROLE,
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test_key',
};

test('create invite pins current engine versions and hash for a member', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await createClientMotivationInvite({ ...BASE, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.token, OPAQUE_TOKEN);
  assert.equal(result.contentHash, ENGINE.contentHash);
  const rpc = calls.find((call) => call.url.includes('create_client_motivation_invite'));
  const body = JSON.parse(rpc.init.body);
  assert.equal(body.p_questionnaire_version, QUESTIONNAIRE_V41);
  assert.equal(body.p_ruleset_version, RULESET_V41);
  assert.equal(body.p_report_model_version, REPORT_MODEL_V42);
  assert.equal(body.p_content_hash, ENGINE.contentHash);
  assert.equal(body.p_content_hash.length, 64);
});

test('create invite denies unknown engine versions before any RPC', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await createClientMotivationInvite({
    ...BASE,
    fetchImpl,
    versions: {
      questionnaireVersion: 'questionnaire-v9',
      rulesetVersion: RULESET_V41,
      reportModelVersion: REPORT_MODEL_V42,
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown_engine');
  assert.equal(calls.length, 0);
});

test('create invite maps other-org / missing / non-fictional RPC denial to forbidden', async () => {
  for (const status of [401, 403]) {
    const { fetchImpl } = createFetchMock({ createStatus: status, createPayload: { message: 'Client unavailable' } });
    const result = await createClientMotivationInvite({ ...BASE, fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'forbidden');
  }
});

test('process analysis fail-closed on content hash mismatch', async () => {
  const { fetchImpl, calls } = createFetchMock({
    inviteRow: submittedInvite({ content_hash: 'a'.repeat(64) }),
  });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'hash_mismatch');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('process analysis fail-closed on unknown stored versions', async () => {
  const { fetchImpl, calls } = createFetchMock({
    inviteRow: submittedInvite({
      questionnaire_version: 'questionnaire-v9',
      content_hash: 'b'.repeat(64),
    }),
  });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown_engine');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('process analysis creates version 1 for a submitted fictional client', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.analysisVersion, 1);
  assert.equal(result.idempotent, false);
  assert.equal(result.createdAt, '2026-08-16T16:05:00.000Z');
  assert.equal(result.provenance.analyzedAt, '2026-08-16T16:05:00.000Z');
  assert.equal(result.submittedAt, '2026-08-16T16:00:00.000Z');
  assert.equal(result.analysisSnapshot.schemaVersion, REPORT_MODEL_V42);
  assert.equal(result.provenance.contentHash, ENGINE.contentHash);
  const persist = calls.find((call) => call.url.includes('persist_client_motivation_analysis'));
  assert.ok(persist);
  const body = JSON.parse(persist.init.body);
  assert.equal(body.p_content_hash, ENGINE.contentHash);
  assert.equal(body.p_client_id, CLIENT_ID);
  assert.equal(body.p_created_by, USER_ID);
  assert.equal(persist.init.headers.Authorization, `Bearer ${SERVICE_ROLE}`);
  assert.notEqual(persist.init.headers.Authorization, 'Bearer tok');
  assert.ok(!Object.prototype.hasOwnProperty.call(body, 'p_token'));
});

test('process analysis refuses to persist without a server role key', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await processSubmittedMotivationAssessment({
    ...BASE,
    serviceRoleKey: '',
    env: {},
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unavailable');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('process analysis is idempotent for the same response and definitions', async () => {
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
  assert.equal(result.analysisVersion, 1);
  assert.equal(result.idempotent, true);
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
  assert.equal(calls.some((call) => /method/i.test(call.init?.method || '') && /PATCH|PUT|DELETE/i.test(call.init.method)), false);
});

test('process analysis never issues an update against analysis versions', async () => {
  const { fetchImpl, calls } = createFetchMock();
  await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  for (const call of calls) {
    const method = String(call.init?.method || 'GET').toUpperCase();
    assert.equal(/PATCH|PUT|DELETE/.test(method), false);
    if (call.url.includes('client_motivation_analysis_versions')) {
      assert.equal(method, 'GET');
    }
  }
});

test('process analysis returns not_submitted when the authorized client has no submitted response', async () => {
  const { fetchImpl, calls } = createFetchMock({ responseRow: null });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'not_submitted');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('process analysis does not distinguish a missing client from a hidden cross-org client', async () => {
  const { fetchImpl, calls } = createFetchMock({ clientRow: null });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
  assert.equal(calls.some((call) => call.url.includes('client_motivation_responses')), false);
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('process analysis returns createdAt from the existing version on idempotent reopen', async () => {
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
  const { fetchImpl } = createFetchMock({ analyses: [existing] });
  const first = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  const second = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(second.createdAt, '2026-08-16T16:05:00.000Z');
  assert.equal(second.provenance.analyzedAt, '2026-08-16T16:05:00.000Z');
  assert.equal(second.submittedAt, '2026-08-16T16:00:00.000Z');
});

test('process analysis denies a client from another organization', async () => {
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

test('only persist-trusted-analysis may read the server role key', () => {
  const dir = path.join(root, 'src/coach/server/motivation');
  const allowed = new Set(['persist-trusted-analysis.mjs']);
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.mjs')) continue;
    const src = fs.readFileSync(path.join(dir, name), 'utf8');
    if (allowed.has(name)) {
      assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/);
      assert.match(src, /Never imported by browser code/);
      continue;
    }
    assert.doesNotMatch(src, /SERVICE_ROLE|service_role_key|SUPABASE_SERVICE_ROLE/);
  }
});
