import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { sendMotivationInvite } from '../../src/coach/server/motivation/send-motivation-invite.mjs';
import { buildMotivationInviteUrl, PRODUCTION_INTAKE_ORIGIN } from '../../src/coach/server/motivation/build-motivation-origin.mjs';
import { buildMotivationInviteEmail, MOTIVATION_INVITE_SUBJECT } from '../../src/coach/server/mail/motivation-invite-email.mjs';
import { getRateLimitProfile } from '../../src/coach/server/http/rate-limit-profiles.mjs';
import { redactForLog } from '../../src/coach/server/http/redact.mjs';
import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const ORG = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OPAQUE_TOKEN = 'opaque_motivation_token_value_24ch';
const EXPIRES_AT = '2026-08-30T12:00:00.000Z';
const CLIENT_EMAIL = 'client.test@example.com';
const ENGINE = resolveMotivationEngine({
  questionnaireVersion: QUESTIONNAIRE_V41,
  rulesetVersion: RULESET_V41,
  reportModelVersion: REPORT_MODEL_V42,
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
  mailModeCalls = [],
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/rest/v1/clients')) {
      return jsonResponse(200, [{
        id: CLIENT_ID,
        organization_id: ORG,
        full_name: 'Alex Test',
        email: CLIENT_EMAIL,
        is_fictional: true,
      }]);
    }
    if (u.includes('/rest/v1/rpc/create_client_motivation_invite')) {
      return jsonResponse(200, [{
        invite_id: 'invite-1',
        token: OPAQUE_TOKEN,
        expires_at: EXPIRES_AT,
        status: 'pending',
      }]);
    }
    if (u.includes('api.resend.com')) {
      mailModeCalls.push(init);
      return jsonResponse(200, { id: 'email_1' });
    }
    throw new Error(`unexpected url ${u}`);
  };
  return { fetchImpl, calls };
}

const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  RESEND_API_KEY: 're_test_fake_key_not_real',
  COACH_MAIL_FROM: 'KR Kinetics <invitations@example.com>',
};

test('server invitation pins official engine versions and hash', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await sendMotivationInvite({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    req: { headers: { origin: 'http://127.0.0.1:4190' } },
    requestId: 'req-1',
    fetchImpl,
    env: { ...BASE_ENV, COACH_MAIL_MODE: 'disabled', VERCEL_ENV: 'development' },
  });
  assert.equal(result.invite_created, true);
  assert.equal(result.email_sent, false);
  assert.match(result.invite_url, /motivation\.html\?token=/);
  const rpc = calls.find((call) => call.url.includes('create_client_motivation_invite'));
  const body = JSON.parse(rpc.init.body);
  assert.equal(body.p_questionnaire_version, QUESTIONNAIRE_V41);
  assert.equal(body.p_ruleset_version, RULESET_V41);
  assert.equal(body.p_report_model_version, REPORT_MODEL_V42);
  assert.equal(body.p_content_hash, ENGINE.contentHash);
});

test('preview mail is fail-closed for non-allowlisted recipients', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await sendMotivationInvite({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    req: { headers: { origin: 'https://integration-profil-motivationnel-krkinetics.vercel.app' } },
    requestId: 'req-2',
    fetchImpl,
    env: {
      ...BASE_ENV,
      COACH_MAIL_MODE: 'test',
      COACH_MAIL_TEST_RECIPIENTS: 'other@example.com',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'integration-profil-motivationnel-krkinetics.vercel.app',
    },
  });
  assert.equal(result.invite_created, true);
  assert.equal(result.email_sent, false);
  assert.equal(result.email_delivery, 'failed');
  assert.ok(result.invite_url);
  assert.equal(calls.some((call) => call.url.includes('api.resend.com')), false);
});

test('production mail mode is fail-closed outside VERCEL_ENV=production', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await sendMotivationInvite({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    req: { headers: { origin: 'https://integration-profil-motivationnel-krkinetics.vercel.app' } },
    requestId: 'req-3',
    fetchImpl,
    env: {
      ...BASE_ENV,
      COACH_MAIL_MODE: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'integration-profil-motivationnel-krkinetics.vercel.app',
    },
  });
  assert.equal(result.invite_created, true);
  assert.equal(result.email_sent, false);
  assert.equal(calls.some((call) => call.url.includes('api.resend.com')), false);
});

test('motivation email is French, branded, and contains no scores', () => {
  const url = buildMotivationInviteUrl(PRODUCTION_INTAKE_ORIGIN, OPAQUE_TOKEN);
  const message = buildMotivationInviteEmail({ fullName: 'Alex Test', inviteUrl: url });
  assert.equal(message.subject, MOTIVATION_INVITE_SUBJECT);
  assert.match(message.text, /Bonjour Alex/);
  assert.match(message.html, /KR Kinetics/);
  assert.match(message.html, /Profil motivationnel/);
  assert.match(message.text, /14 jours/);
  assert.doesNotMatch(message.html, /score|analysis_snapshot|rapport officiel/i);
  assert.match(message.html, /motivation\.html\?token=/);
  assert.match(url, /motivation\.html\?token=/);
});

test('motivation invite logs never include the raw token', () => {
  const url = `${PRODUCTION_INTAKE_ORIGIN}/motivation.html?token=${OPAQUE_TOKEN}`;
  const redacted = JSON.stringify(redactForLog({
    invite_url: url,
    token: OPAQUE_TOKEN,
    answers: [{ questionCode: 'MOT_AUTO_01', numericValue: 5 }],
  }));
  assert.equal(redacted.includes(OPAQUE_TOKEN), false);
  assert.equal(redacted.includes('MOT_AUTO_01'), false);
});

test('single motivation function stays within the Vercel Hobby limit', () => {
  const files = fs.readdirSync(path.join(root, 'api')).filter((name) => name.endsWith('.js'));
  assert.ok(files.length <= 12, files.join(','));
  assert.ok(files.includes('coach-motivation.js'));
  const { resolveMotivationApiOp } = require(path.join(root, 'api/coach-motivation.js'));
  assert.equal(resolveMotivationApiOp({ url: '/api/coach-send-motivation-invite' }), 'send-invite');
  assert.equal(resolveMotivationApiOp({ url: '/api/coach-motivation?op=send-invite' }), 'send-invite');
  assert.equal(resolveMotivationApiOp({ url: '/api/coach-process-motivation-assessment' }), 'process-assessment');
  assert.equal(resolveMotivationApiOp({ url: '/api/coach-motivation?op=process-assessment' }), 'process-assessment');
  assert.equal(resolveMotivationApiOp({ url: '/api/coach-motivation-pdf' }), 'pdf');
  assert.equal(resolveMotivationApiOp({ url: '/api/coach-motivation?op=pdf' }), 'pdf');
});

test('motivation API routes stay off the service role and reuse intake auth', () => {
  const api = fs.readFileSync(path.join(root, 'api/coach-motivation.js'), 'utf8');
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.match(api, /createCoachApiHandler/);
  assert.match(api, /sendMotivationInvite/);
  assert.match(api, /processSubmittedMotivationAssessment/);
  assert.doesNotMatch(api, /SERVICE_ROLE|service_role/);
  assert.equal(getRateLimitProfile('send-motivation-invite').max, 8);
  assert.equal(getRateLimitProfile('process-motivation-assessment').max, 8);
  assert.ok(vercel.rewrites.some((row) => (
    row.source === '/api/coach-send-motivation-invite'
    && row.destination === '/api/coach-motivation?op=send-invite'
  )));
  assert.ok(vercel.rewrites.some((row) => (
    row.source === '/api/coach-process-motivation-assessment'
    && row.destination === '/api/coach-motivation?op=process-assessment'
  )));
  assert.ok(vercel.rewrites.some((row) => (
    row.source === '/api/coach-motivation-pdf'
    && row.destination === '/api/coach-motivation?op=pdf'
  )));
  assert.equal(fs.existsSync(path.join(root, 'api/coach-send-motivation-invite.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'api/coach-process-motivation-assessment.js')), false);
});
