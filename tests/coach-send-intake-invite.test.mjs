/**
 * Intake invite email delivery — mocked provider only.
 * Never sends real mail. Never logs tokens, URLs, or API keys.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCoachApiHandler } from '../src/coach/server/http/create-api-handler.mjs';
import { resetRateLimitBuckets } from '../src/coach/server/http/rate-limit.mjs';
import { getRateLimitProfile } from '../src/coach/server/http/rate-limit-profiles.mjs';
import { redactForLog } from '../src/coach/server/http/redact.mjs';
import { validateIntakeInviteBody } from '../src/coach/server/intake/validate-intake-invite-request.mjs';
import { classifyClientEmail } from '../src/coach/server/intake/client-email.mjs';
import { resolveIntakeOrigin, buildIntakeInviteUrl, PRODUCTION_INTAKE_ORIGIN } from '../src/coach/server/intake/build-intake-origin.mjs';
import { sendIntakeInvite } from '../src/coach/server/intake/send-intake-invite.mjs';
import { parseMailFrom, sendResendEmail, RESEND_ENDPOINT } from '../src/coach/server/mail/resend-client.mjs';
import { resolveCoachMailMode, maySendToRecipient, parseTestRecipients } from '../src/coach/server/mail/mail-mode.mjs';
import { buildIntakeInviteEmail, INTAKE_INVITE_SUBJECT } from '../src/coach/server/mail/intake-invite-email.mjs';
import { EXPIRES_IN_DAYS } from '../src/coach/server/intake/create-intake-invite.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORG_KR = '11111111-1111-1111-1111-111111111111';
const ORG_ELEVATE = '22222222-2222-2222-2222-222222222222';
const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OPAQUE_TOKEN = 'opaque_invite_token_value_24ch';
const EXPIRES_AT = '2026-08-29T12:00:00.000Z';
const CLIENT_EMAIL = 'client.test@example.com';
const FAKE_KEY = 're_test_fake_key_not_real';
const FAKE_FROM = 'KR Kinetics <invitations@example.com>';

function mockRes() {
  const headers = {};
  let body = '';
  return {
    headers,
    statusCode: 0,
    setHeader(k, v) { headers[k] = v; },
    end(chunk) { body = chunk == null ? '' : String(chunk); },
    get body() { return body; },
    get json() { return body ? JSON.parse(body) : null; },
  };
}

function mockReq({
  method = 'POST',
  body = {
    client_id: CLIENT_ID,
    organization_id: ORG_KR,
    organization_slug: 'kr-kinetics',
  },
  headers = {},
  cookie = 'coach_access_token=tok',
  origin = 'https://app.krkinetics.com',
} = {}) {
  return {
    method,
    headers: {
      cookie,
      origin,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(JSON.stringify(body))),
      ...headers,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function createFetchMock({
  userStatus = 200,
  userBody = { id: USER_ID },
  memberships = [{ id: 'm-kr', organization_id: ORG_KR, role: 'coach' }],
  orgSlug = 'kr-kinetics',
  clientRow = {
    id: CLIENT_ID,
    organization_id: ORG_KR,
    full_name: 'Alex Test',
    email: CLIENT_EMAIL,
    is_fictional: true,
  },
  clientStatus = 200,
  rpcStatus = 200,
  rpcPayload = [{ invite_id: 'invite-1', token: OPAQUE_TOKEN, expires_at: EXPIRES_AT, status: 'pending' }],
  resendStatus = 200,
  resendPayload = { id: 'email_1' },
  resendThrow = null,
  resendHangMs = 0,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/auth/v1/user')) return jsonResponse(userStatus, userBody);
    if (u.includes('/rest/v1/memberships')) return jsonResponse(200, memberships);
    if (u.includes('/rest/v1/organizations')) {
      return jsonResponse(200, orgSlug ? [{ id: ORG_KR, slug: orgSlug }] : []);
    }
    if (u.includes('/rest/v1/clients')) return jsonResponse(clientStatus, clientRow ? [clientRow] : []);
    if (u.includes('/rest/v1/rpc/create_client_intake_invite')) {
      return jsonResponse(rpcStatus, rpcPayload);
    }
    if (u.includes('api.resend.com')) {
      if (resendThrow) throw resendThrow;
      if (resendHangMs) {
        await new Promise((_, reject) => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), resendHangMs);
        });
      }
      return jsonResponse(resendStatus, resendPayload);
    }
    throw new Error(`unexpected url in test mock: ${u}`);
  };
  return { fetchImpl, calls };
}

const MAIL_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  RESEND_API_KEY: FAKE_KEY,
  COACH_MAIL_FROM: FAKE_FROM,
  COACH_MAIL_MODE: 'production',
  VERCEL_ENV: 'production',
  COACH_PUBLIC_ORIGIN: PRODUCTION_INTAKE_ORIGIN,
};

async function withHandlerEnv(fetchImpl, fn, extraEnv = {}) {
  const keys = [
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'RESEND_API_KEY', 'COACH_MAIL_FROM',
    'COACH_MAIL_MODE', 'COACH_MAIL_TEST_RECIPIENTS', 'VERCEL_ENV', 'VERCEL_URL',
    'COACH_PUBLIC_ORIGIN', 'COACH_RATE_LIMIT_BACKEND',
  ];
  const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, MAIL_ENV, {
    VERCEL_ENV: 'development',
    COACH_RATE_LIMIT_BACKEND: 'memory',
    COACH_MAIL_MODE: 'test',
    COACH_MAIL_TEST_RECIPIENTS: CLIENT_EMAIL,
  }, extraEnv);
  globalThis.fetch = fetchImpl;
  resetRateLimitBuckets();
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

async function loadHandler() {
  return (await import('../api/coach-send-intake-invite.js')).default;
}

function captureLogs(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => {
    lines.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    })
    .then((value) => ({ value, logs: lines.join('\n') }));
}

function assertNoSecrets(text, { allowInviteUrl = false } = {}) {
  const haystack = String(text || '');
  if (!allowInviteUrl) {
    assert.equal(haystack.includes(OPAQUE_TOKEN), false, 'raw token leaked');
    assert.equal(haystack.includes('intake.html?token='), false, 'invite URL leaked');
  }
  assert.equal(haystack.includes(FAKE_KEY), false, 'provider key leaked');
  assert.equal(/re_[A-Za-z0-9]{8,}/.test(haystack), false, 'resend-like key leaked');
  assert.equal(haystack.includes('internal leak'), false, 'provider body leaked');
}

// ─── Unit: validation / origin / mail mode ──────────────────────────────────

test('validator accepts identifiers only and rejects authoritative extras', () => {
  assert.equal(validateIntakeInviteBody({
    client_id: CLIENT_ID,
    organization_id: ORG_KR,
    organization_slug: 'kr-kinetics',
  }).ok, true);
  for (const extra of ['email', 'token', 'invite_url', 'from', 'sender', 'origin', 'service_type']) {
    const body = { client_id: CLIENT_ID, [extra]: 'x' };
    assert.equal(validateIntakeInviteBody(body).ok, false, extra);
  }
  assert.equal(validateIntakeInviteBody({ organization_id: ORG_KR }).ok, false);
  assert.equal(validateIntakeInviteBody({ client_id: 'not-a-uuid' }).ok, false);
});

test('canonical email classification', () => {
  assert.deepEqual(classifyClientEmail('  Client.Test@Example.COM '), { ok: true, email: 'client.test@example.com' });
  assert.equal(classifyClientEmail(null).reason, 'missing');
  assert.equal(classifyClientEmail('').reason, 'missing');
  assert.equal(classifyClientEmail('not-an-email').reason, 'invalid');
  assert.equal(classifyClientEmail('a@b').reason, 'invalid');
});

test('production origin is app.krkinetics.com; preview uses allowlisted preview origin', () => {
  assert.deepEqual(
    resolveIntakeOrigin({ vercelEnv: 'production', publicOrigin: 'https://evil.example' }),
    { ok: true, origin: PRODUCTION_INTAKE_ORIGIN },
  );
  assert.deepEqual(
    resolveIntakeOrigin({
      vercelEnv: 'production',
      publicOrigin: 'https://equivalents-2-0-git-x-krkinetics.vercel.app',
    }),
    { ok: true, origin: PRODUCTION_INTAKE_ORIGIN },
  );
  assert.deepEqual(
    resolveIntakeOrigin({
      vercelEnv: 'preview',
      originHeader: 'https://equivalents-2-0-git-x-krkinetics.vercel.app',
      vercelUrl: 'equivalents-2-0-git-x-krkinetics.vercel.app',
    }),
    { ok: true, origin: 'https://equivalents-2-0-git-x-krkinetics.vercel.app' },
  );
  assert.deepEqual(
    resolveIntakeOrigin({
      vercelEnv: 'preview',
      originHeader: PRODUCTION_INTAKE_ORIGIN,
      vercelUrl: 'equivalents-2-0-git-x-krkinetics.vercel.app',
    }),
    { ok: true, origin: 'https://equivalents-2-0-git-x-krkinetics.vercel.app' },
  );
  assert.equal(
    resolveIntakeOrigin({
      vercelEnv: 'preview',
      originHeader: 'https://evil.example',
      vercelUrl: 'evil.example',
    }).ok,
    false,
  );
  assert.equal(
    buildIntakeInviteUrl(PRODUCTION_INTAKE_ORIGIN, OPAQUE_TOKEN),
    `${PRODUCTION_INTAKE_ORIGIN}/intake.html?token=${encodeURIComponent(OPAQUE_TOKEN)}`,
  );
});

test('mail mode defaults to disabled and test mode allowlists recipients', () => {
  assert.equal(resolveCoachMailMode({}), 'disabled');
  assert.equal(resolveCoachMailMode({
    COACH_MAIL_MODE: 'production',
    VERCEL_ENV: 'preview',
  }), 'disabled');
  assert.equal(resolveCoachMailMode({
    COACH_MAIL_MODE: 'production',
    VERCEL_ENV: 'production',
  }), 'production');
  assert.equal(maySendToRecipient(CLIENT_EMAIL, { mode: 'disabled' }).ok, false);
  assert.equal(maySendToRecipient(CLIENT_EMAIL, {
    mode: 'test',
    testRecipients: parseTestRecipients('other@example.com'),
  }).ok, false);
  assert.equal(maySendToRecipient(CLIENT_EMAIL, {
    mode: 'test',
    testRecipients: parseTestRecipients(CLIENT_EMAIL),
  }).ok, true);
  assert.equal(maySendToRecipient(CLIENT_EMAIL, { mode: 'production' }).ok, true);
});

test('mail from rejects missing, malformed, and Resend onboarding identity', () => {
  assert.equal(parseMailFrom('').ok, false);
  assert.equal(parseMailFrom('KR Kinetics <onboarding@resend.dev>').ok, false);
  assert.equal(parseMailFrom(FAKE_FROM).ok, true);
});

test('invite email is French, branded, and free of internal data', () => {
  const url = `${PRODUCTION_INTAKE_ORIGIN}/intake.html?token=${OPAQUE_TOKEN}`;
  const mail = buildIntakeInviteEmail({ fullName: 'Alex Test', inviteUrl: url });
  assert.equal(mail.subject, INTAKE_INVITE_SUBJECT);
  assert.match(mail.text, /Bonjour Alex,/);
  assert.match(mail.text, /Compléter mon questionnaire/);
  assert.match(mail.text, /14 jours/);
  assert.match(mail.html, /#071b41/);
  assert.match(mail.html, /#ed1136/);
  assert.doesNotMatch(mail.html, /service_type|organization_id|client_id|notes|kcal|protéine/i);
  assert.equal(EXPIRES_IN_DAYS, 14);
});

test('redaction hides intake URLs and mail keys', () => {
  const redacted = redactForLog({
    invite_url: `${PRODUCTION_INTAKE_ORIGIN}/intake.html?token=${OPAQUE_TOKEN}`,
    recipient_email: CLIENT_EMAIL,
    note: `see ${PRODUCTION_INTAKE_ORIGIN}/intake.html?token=${OPAQUE_TOKEN}`,
  });
  assert.equal(redacted.invite_url, '[redacted]');
  assert.equal(redacted.recipient_email, '[redacted]');
  assert.match(String(redacted.note), /token=\[redacted\]/);
  assert.equal(String(redacted.note).includes(OPAQUE_TOKEN), false);
});

test('send-intake-invite rate profile matches PDF class', () => {
  const invite = getRateLimitProfile('send-intake-invite');
  const pdf = getRateLimitProfile('generate-pdf');
  assert.equal(invite.max, 8);
  assert.equal(invite.windowMs, 60_000);
  assert.equal(invite.max, pdf.max);
});

// ─── Provider unit ──────────────────────────────────────────────────────────

test('resend client fails closed without key/from and never returns provider bodies', async () => {
  const missingKey = await sendResendEmail({
    apiKey: '',
    from: FAKE_FROM,
    to: CLIENT_EMAIL,
    subject: 'x',
    html: 'x',
    text: 'x',
    fetchImpl: async () => { throw new Error('should not send'); },
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.reason, 'missing_api_key');

  const missingFrom = await sendResendEmail({
    apiKey: FAKE_KEY,
    from: '',
    to: CLIENT_EMAIL,
    subject: 'x',
    html: 'x',
    text: 'x',
    fetchImpl: async () => { throw new Error('should not send'); },
  });
  assert.equal(missingFrom.ok, false);

  const httpFail = await sendResendEmail({
    apiKey: FAKE_KEY,
    from: FAKE_FROM,
    to: CLIENT_EMAIL,
    subject: 'x',
    html: 'x',
    text: 'x',
    fetchImpl: async () => jsonResponse(500, { message: 'provider secret body', name: FAKE_KEY }),
  });
  assert.equal(httpFail.ok, false);
  assert.equal(JSON.stringify(httpFail).includes('provider secret body'), false);
  assert.equal(JSON.stringify(httpFail).includes(FAKE_KEY), false);
});

test('resend malformed response, timeout, and network stay safe', async () => {
  const malformed = await sendResendEmail({
    apiKey: FAKE_KEY,
    from: FAKE_FROM,
    to: CLIENT_EMAIL,
    subject: 'x',
    html: 'x',
    text: 'x',
    fetchImpl: async () => jsonResponse(200, { error: { message: 'nope' } }),
  });
  assert.equal(malformed.reason, 'provider_malformed');

  const timedOut = await sendResendEmail({
    apiKey: FAKE_KEY,
    from: FAKE_FROM,
    to: CLIENT_EMAIL,
    subject: 'x',
    html: 'x',
    text: 'x',
    timeoutMs: 20,
    fetchImpl: (_url, init) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }),
  });
  assert.equal(timedOut.reason, 'provider_timeout');

  const network = await sendResendEmail({
    apiKey: FAKE_KEY,
    from: FAKE_FROM,
    to: CLIENT_EMAIL,
    subject: 'x',
    html: 'x',
    text: 'x',
    fetchImpl: async () => { throw new Error(`ECONNRESET ${FAKE_KEY}`); },
  });
  assert.equal(network.reason, 'provider_network');
  assert.equal(JSON.stringify(network).includes(FAKE_KEY), false);
});

// ─── Business logic ─────────────────────────────────────────────────────────

test('authorized coach send uses stored email and omits invite_url on success', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const { value, logs } = await captureLogs(() => sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq(),
    requestId: 'req-1',
    fetchImpl,
    env: MAIL_ENV,
  }));
  assert.equal(value.invite_created, true);
  assert.equal(value.email_sent, true);
  assert.equal(value.email_delivery, 'sent');
  assert.equal(value.recipient_email, CLIENT_EMAIL);
  assert.equal(value.invite_url, undefined);
  assert.equal(value.token, undefined);
  const rpc = calls.find((c) => c.url.includes('create_client_intake_invite'));
  assert.equal(JSON.parse(rpc.init.body).p_expires_in_days, 14);
  const resend = calls.find((c) => c.url === RESEND_ENDPOINT);
  const payload = JSON.parse(resend.init.body);
  assert.deepEqual(payload.to, [CLIENT_EMAIL]);
  assert.equal(payload.from, FAKE_FROM);
  assertNoSecrets(logs);
});

test('body-supplied email never reaches Resend; canonical row email is used', async () => {
  const { fetchImpl, calls } = createFetchMock({
    clientRow: {
      id: CLIENT_ID,
      organization_id: ORG_KR,
      full_name: 'Alex Test',
      email: CLIENT_EMAIL,
      is_fictional: true,
    },
  });
  await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq({ body: { client_id: CLIENT_ID, email: 'attacker@evil.test' } }),
    requestId: 'req-2',
    fetchImpl,
    env: MAIL_ENV,
  });
  const resend = calls.find((c) => c.url === RESEND_ENDPOINT);
  assert.deepEqual(JSON.parse(resend.init.body).to, [CLIENT_EMAIL]);
});

test('missing and invalid canonical email skip Resend and return invite_url', async () => {
  for (const email of [null, '', 'not-valid']) {
    const { fetchImpl, calls } = createFetchMock({
      clientRow: {
        id: CLIENT_ID,
        organization_id: ORG_KR,
        full_name: 'Alex Test',
        email,
        is_fictional: true,
      },
    });
    const result = await sendIntakeInvite({
      accessToken: 'tok',
      organizationId: ORG_KR,
      clientId: CLIENT_ID,
      req: mockReq(),
      requestId: 'req-skip',
      fetchImpl,
      env: MAIL_ENV,
    });
    assert.equal(result.invite_created, true);
    assert.equal(result.email_sent, false);
    assert.ok(['skipped_missing_email', 'skipped_invalid_email'].includes(result.email_delivery));
    assert.match(result.invite_url, /\/intake\.html\?token=/);
    assert.equal(calls.some((c) => c.url === RESEND_ENDPOINT), false);
  }
});

test('cross-org client is forbidden and does not create an invite', async () => {
  const { fetchImpl, calls } = createFetchMock({
    clientRow: {
      id: CLIENT_ID,
      organization_id: ORG_ELEVATE,
      full_name: 'Other Org',
      email: CLIENT_EMAIL,
      is_fictional: true,
    },
  });
  const result = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq(),
    requestId: 'req-xorg',
    fetchImpl,
    env: MAIL_ENV,
  });
  assert.equal(result.__httpError, true);
  assert.equal(result.error, 'forbidden');
  assert.equal(calls.some((c) => c.url.includes('create_client_intake_invite')), false);
  assert.equal(calls.some((c) => c.url === RESEND_ENDPOINT), false);
});

test('missing API key or From after invite creation is a safe email failure', async () => {
  for (const extraEnv of [{ RESEND_API_KEY: '' }, { COACH_MAIL_FROM: '' }]) {
    const { fetchImpl, calls } = createFetchMock();
    const result = await sendIntakeInvite({
      accessToken: 'tok',
      organizationId: ORG_KR,
      clientId: CLIENT_ID,
      req: mockReq(),
      requestId: 'req-cfg',
      fetchImpl,
      env: { ...MAIL_ENV, ...extraEnv },
    });
    assert.equal(result.invite_created, true);
    assert.equal(result.email_sent, false);
    assert.equal(result.email_delivery, 'failed');
    assert.ok(result.invite_url);
    assert.equal(result.token, undefined);
    assert.equal(calls.some((c) => c.url.includes('create_client_intake_invite')), true);
  }
});

test('provider HTTP failure keeps the invite and returns fallback URL only', async () => {
  const { fetchImpl } = createFetchMock({
    resendStatus: 500,
    resendPayload: { statusCode: 500, message: 'internal leak', name: FAKE_KEY },
  });
  const { value, logs } = await captureLogs(() => sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq(),
    requestId: 'req-fail',
    fetchImpl,
    env: MAIL_ENV,
  }));
  assert.equal(value.email_sent, false);
  assert.equal(value.email_delivery, 'failed');
  assert.ok(value.invite_url);
  assert.equal(JSON.stringify(value).includes('internal leak'), false);
  assertNoSecrets(logs);
  assertNoSecrets(JSON.stringify(value), { allowInviteUrl: true });
  assert.equal('token' in value, false);
});

test('disabled mail mode never calls Resend', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq(),
    requestId: 'req-disabled',
    fetchImpl,
    env: { ...MAIL_ENV, COACH_MAIL_MODE: 'disabled' },
  });
  assert.equal(result.email_sent, false);
  assert.equal(result.email_delivery, 'failed');
  assert.equal(calls.some((c) => c.url === RESEND_ENDPOINT), false);
});

test('production mail mode on Preview never calls Resend', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq({ origin: 'https://equivalents-2-0-git-x-krkinetics.vercel.app' }),
    requestId: 'req-prod-on-preview',
    fetchImpl,
    env: {
      ...MAIL_ENV,
      VERCEL_ENV: 'preview',
      COACH_MAIL_MODE: 'production',
      VERCEL_URL: 'equivalents-2-0-git-x-krkinetics.vercel.app',
    },
  });
  assert.equal(result.email_sent, false);
  assert.equal(result.email_delivery, 'failed');
  assert.equal(calls.some((c) => c.url === RESEND_ENDPOINT), false);
});

test('test mode blocks non-allowlisted recipients and allows listed ones', async () => {
  const blocked = createFetchMock();
  const blockedResult = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq(),
    requestId: 'req-test-block',
    fetchImpl: blocked.fetchImpl,
    env: {
      ...MAIL_ENV,
      VERCEL_ENV: 'preview',
      COACH_MAIL_MODE: 'test',
      COACH_MAIL_TEST_RECIPIENTS: 'only@test.example',
      VERCEL_URL: 'equivalents-2-0-git-x-krkinetics.vercel.app',
    },
  });
  assert.equal(blockedResult.email_sent, false);
  assert.equal(blocked.calls.some((c) => c.url === RESEND_ENDPOINT), false);

  const allowed = createFetchMock();
  const allowedResult = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq({ origin: 'https://equivalents-2-0-git-x-krkinetics.vercel.app' }),
    requestId: 'req-test-allow',
    fetchImpl: allowed.fetchImpl,
    env: {
      ...MAIL_ENV,
      VERCEL_ENV: 'preview',
      COACH_MAIL_MODE: 'test',
      COACH_MAIL_TEST_RECIPIENTS: CLIENT_EMAIL,
      VERCEL_URL: 'equivalents-2-0-git-x-krkinetics.vercel.app',
    },
  });
  assert.equal(allowedResult.email_sent, true);
  assert.equal(allowed.calls.some((c) => c.url === RESEND_ENDPOINT), true);
  assert.equal(allowedResult.invite_url, undefined);
});

test('RPC failure before send does not call Resend', async () => {
  const { fetchImpl, calls } = createFetchMock({ rpcStatus: 400, rpcPayload: { message: 'Client unavailable' } });
  const result = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    req: mockReq(),
    requestId: 'req-rpc',
    fetchImpl,
    env: MAIL_ENV,
  });
  assert.equal(result.__httpError, true);
  assert.equal(result.error, 'unavailable');
  assert.equal(JSON.stringify(result).includes('Client unavailable'), false);
  assert.equal(calls.some((c) => c.url === RESEND_ENDPOINT), false);
});

// ─── HTTP handler ───────────────────────────────────────────────────────────

test('handler: unauthenticated request is 401', async () => {
  const { fetchImpl } = createFetchMock();
  await withHandlerEnv(fetchImpl, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq({ cookie: '' }), res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json, { error: 'unauthorized' });
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  });
});

test('handler: unexpected body email is 400 and never invites', async () => {
  const { fetchImpl, calls } = createFetchMock();
  await withHandlerEnv(fetchImpl, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq({
      body: { client_id: CLIENT_ID, email: 'attacker@evil.test' },
    }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json, { error: 'bad_request' });
    assert.equal(calls.some((c) => c.url.includes('create_client_intake_invite')), false);
  });
});

test('handler: unauthorized role is forbidden', async () => {
  const { fetchImpl } = createFetchMock({
    memberships: [{ id: 'm-kr', organization_id: ORG_KR, role: 'intern' }],
  });
  await withHandlerEnv(fetchImpl, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.json, { error: 'forbidden' });
  });
});

test('handler: cross-org organization selector is forbidden', async () => {
  const { fetchImpl } = createFetchMock();
  await withHandlerEnv(fetchImpl, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq({
      body: { client_id: CLIENT_ID, organization_id: ORG_ELEVATE, organization_slug: 'elevate-fitness' },
    }), res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.json, { error: 'forbidden' });
  });
});

test('handler: success and failure contracts plus no-store', async () => {
  const ok = createFetchMock();
  await withHandlerEnv(ok.fetchImpl, async () => {
    const handler = await loadHandler();
    const { value, logs } = await captureLogs(async () => {
      const res = mockRes();
      await handler(mockReq(), res);
      return res;
    });
    assert.equal(value.statusCode, 200);
    assert.equal(value.json.email_sent, true);
    assert.equal(value.json.invite_url, undefined);
    assert.equal(value.headers['Cache-Control'], 'private, no-store');
    assertNoSecrets(logs);
    assertNoSecrets(value.body);
  });

  const fail = createFetchMock({ resendStatus: 502, resendPayload: { message: 'upstream' } });
  await withHandlerEnv(fail.fetchImpl, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.email_sent, false);
    assert.ok(res.json.invite_url);
    assert.equal(res.body.includes('upstream'), false);
    assert.equal(res.body.includes(OPAQUE_TOKEN) === false || res.json.invite_url.includes(OPAQUE_TOKEN), true);
  });
});

test('handler: GET rejected; OPTIONS allowed', async () => {
  const { fetchImpl } = createFetchMock();
  await withHandlerEnv(fetchImpl, async () => {
    const handler = await loadHandler();
    const getRes = mockRes();
    await handler(mockReq({ method: 'GET' }), getRes);
    assert.equal(getRes.statusCode, 405);
    const optRes = mockRes();
    await handler(mockReq({ method: 'OPTIONS' }), optRes);
    assert.equal(optRes.statusCode, 204);
  });
});

test('createCoachApiHandler rate-limit profile is wired for send-intake-invite', async () => {
  resetRateLimitBuckets();
  const { fetchImpl } = createFetchMock();
  await withHandlerEnv(fetchImpl, async () => {
    const handler = createCoachApiHandler({
      routeName: 'send-intake-invite',
      validate: validateIntakeInviteBody,
      async handle() { return { ok: true }; },
    });
    for (let i = 0; i < 8; i += 1) {
      const res = mockRes();
      await handler(mockReq(), res);
      assert.equal(res.statusCode, 200, `request ${i}`);
    }
    const blocked = mockRes();
    await handler(mockReq(), blocked);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json.error, 'rate_limited');
  });
});

// ─── Static containment ─────────────────────────────────────────────────────

test('static: dashboard uses the API, pending UI, and never browser RPC', () => {
  const dashboardJs = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');
  const preview = fs.readFileSync(path.join(root, 'scripts/coach-workspace-preview.mjs'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'api/coach-send-intake-invite.js'), 'utf8');
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const intakeJs = fs.readFileSync(path.join(root, 'coach-portal/assets/intake.js'), 'utf8');
  assert.match(dashboardJs, /\/api\/coach-send-intake-invite/);
  assert.match(dashboardJs, /intakeInFlight/);
  assert.match(dashboardJs, /Envoi…/);
  assert.match(dashboardJs, /credentials: 'include'/);
  assert.doesNotMatch(dashboardJs, /create_client_intake_invite/);
  assert.doesNotMatch(dashboardJs, /RESEND_API_KEY|COACH_MAIL_FROM/);
  assert.match(preview, /coach-send-intake-invite/);
  assert.match(api, /createCoachApiHandler/);
  assert.doesNotMatch(api, /SERVICE_ROLE_KEY|service_role_key/);
  assert.match(example, /# RESEND_API_KEY=/);
  assert.match(example, /# COACH_MAIL_FROM=/);
  assert.match(example, /# COACH_MAIL_MODE=disabled/);
  assert.doesNotMatch(example, /^RESEND_API_KEY=\S+/m);
  assert.match(intakeJs, /rpc\('get_client_intake'/);
  assert.match(fs.readFileSync(path.join(root, 'src/coach/server/intake/build-intake-origin.mjs'), 'utf8'), /intake\.html\?token=/);
});

test('static: PR #36 nutrition CTA gating is unchanged in dashboard', () => {
  const dashboardJs = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');
  assert.match(dashboardJs, /clientHasNutritionAccess\(row\.service_type\)/);
  assert.match(dashboardJs, /NUTRITION_WORKSPACE_CTA_LABEL/);
  assert.match(dashboardJs, /groupClientsByService/);
  assert.doesNotMatch(dashboardJs, /Ouvrir le dossier/);
});
