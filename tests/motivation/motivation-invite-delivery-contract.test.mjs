/**
 * Mandatory invite-delivery gate.
 * RAW TOKEN → canonical URL → email renderer → Resend payload → public parser.
 * Mocks only create_client_motivation_invite and the Resend HTTP transport.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendMotivationInvite } from '../../src/coach/server/motivation/send-motivation-invite.mjs';
import {
  assertMotivationInviteUrl,
  buildMotivationInviteUrl,
  fingerprintMotivationInviteToken,
  parseMotivationInviteUrl,
} from '../../src/coach/server/motivation/motivation-invite-link.mjs';
import { PRODUCTION_INTAKE_ORIGIN } from '../../src/coach/server/motivation/build-motivation-origin.mjs';
import { readMotivationInviteToken } from '../../src/coach/motivation/client/motivation-invite-token.mjs';
import { redactForLog } from '../../src/coach/server/http/redact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORG = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_EMAIL = 'client.test@example.com';
const EXPIRES_AT = '2026-08-30T12:00:00.000Z';
const RAW_TOKEN = 'raw_invite_token_roundtrip_24ch';
const RAW_TOKEN_B = 'raw_invite_token_resend_B_24chxx';
const ENCODED_TOKEN = 'Tok+en/with=equals&ampersand?x';
const PREVIEW_HOST = 'equivalents-2-0-git-integration-prof-57a4cb-krkinetics-projects.vercel.app';
const PREVIEW_ORIGIN = `https://${PREVIEW_HOST}`;
const PREVIEW_LIVE = `${PREVIEW_ORIGIN}/motivation.html?token=${encodeURIComponent('TEST_TOKEN_ROUNDTRIP_24CH')}`;

const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  RESEND_API_KEY: 're_test_fake_key_not_real',
  COACH_MAIL_FROM: 'KR Kinetics <invitations@example.com>',
  COACH_MAIL_MODE: 'test',
  COACH_MAIL_TEST_RECIPIENTS: CLIENT_EMAIL,
};

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function decodeHtmlAttr(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractHtmlHrefs(html) {
  return [...String(html).matchAll(/<a href="([^"]+)"/g)].map((match) => decodeHtmlAttr(match[1]));
}

function extractTextUrls(text) {
  return String(text).match(/https?:\/\/[^\s]+/g) || [];
}

function assertCanonicalInviteUrl(href, rawToken) {
  const url = new URL(href);
  assert.equal(url.pathname, '/motivation.html');
  assert.equal(url.searchParams.has('token'), true);
  assert.equal(url.searchParams.get('token'), rawToken);
  assert.equal(readMotivationInviteToken(url), rawToken);
  const checked = assertMotivationInviteUrl(href, rawToken);
  assert.equal(checked.ok, true);
  assert.equal(checked.token, rawToken);
}

function createDeliveryFetch({ tokens = [RAW_TOKEN], resendBodies = [] } = {}) {
  const calls = [];
  let tokenIndex = 0;
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
      const token = tokens[Math.min(tokenIndex, tokens.length - 1)];
      tokenIndex += 1;
      return jsonResponse(200, [{
        invite_id: `invite-${tokenIndex}`,
        token,
        expires_at: EXPIRES_AT,
        status: 'pending',
      }]);
    }
    if (u.includes('api.resend.com')) {
      resendBodies.push(JSON.parse(String(init.body || '{}')));
      return jsonResponse(200, { id: `email_${resendBodies.length}` });
    }
    throw new Error(`unexpected url ${u}`);
  };
  return { fetchImpl, calls };
}

async function sendWith({
  tokens = [RAW_TOKEN],
  env = {},
  origin = PREVIEW_ORIGIN,
} = {}) {
  const resendBodies = [];
  const { fetchImpl, calls } = createDeliveryFetch({ tokens, resendBodies });
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((item) => String(item)).join(' '));
  };
  let result;
  try {
    result = await sendMotivationInvite({
      accessToken: 'tok',
      organizationId: ORG,
      clientId: CLIENT_ID,
      req: { headers: { origin } },
      requestId: 'req-delivery',
      fetchImpl,
      env: { ...BASE_ENV, ...env },
    });
  } finally {
    console.log = originalLog;
  }
  return { result, calls, resendBodies, logs };
}

test('assertMotivationInviteUrl refuses a path or token mismatch before send', () => {
  assert.equal(assertMotivationInviteUrl('https://app.krkinetics.com/intake.html?token=abc', RAW_TOKEN).ok, false);
  assert.equal(assertMotivationInviteUrl(`${PRODUCTION_INTAKE_ORIGIN}/motivation.html`, RAW_TOKEN).ok, false);
  assert.equal(
    assertMotivationInviteUrl(`${PRODUCTION_INTAKE_ORIGIN}/motivation.html?token=other-token-value-24ch`, RAW_TOKEN).ok,
    false,
  );
  const good = buildMotivationInviteUrl(PRODUCTION_INTAKE_ORIGIN, RAW_TOKEN);
  assert.equal(assertMotivationInviteUrl(good, RAW_TOKEN).ok, true);
});

test('preview origin: raw token survives URL, HTML, text and Resend JSON', async () => {
  const { result, calls, resendBodies, logs } = await sendWith({
    env: {
      VERCEL_ENV: 'preview',
      VERCEL_URL: PREVIEW_HOST,
    },
  });
  assert.equal(result.invite_created, true);
  assert.equal(result.email_sent, true);
  assert.equal(result.delivery, 'sent');
  assert.equal(result.invite_url_has_token, true);
  assert.equal(result.invite_url_path, '/motivation.html');
  assert.equal(result.invite_token_fingerprint, fingerprintMotivationInviteToken(RAW_TOKEN));
  assert.equal(result.invite_url.includes(RAW_TOKEN), true);
  assertCanonicalInviteUrl(result.invite_url, RAW_TOKEN);

  const createCalls = calls.filter((call) => call.url.includes('create_client_motivation_invite'));
  assert.equal(createCalls.length, 1);
  assert.equal(resendBodies.length, 1);

  const payload = resendBodies[0];
  const hrefs = extractHtmlHrefs(payload.html);
  assert.ok(hrefs.length >= 2, 'CTA and fallback must share the same href');
  for (const href of hrefs) {
    assertCanonicalInviteUrl(href, RAW_TOKEN);
    assert.equal(href, result.invite_url);
  }
  const textUrls = extractTextUrls(payload.text);
  assert.ok(textUrls.length >= 2);
  for (const href of textUrls) {
    assertCanonicalInviteUrl(href, RAW_TOKEN);
    assert.equal(href, result.invite_url);
  }
  assert.match(payload.html, /Si le bouton ne fonctionne pas, copiez ce lien complet/);
  assert.match(payload.text, /Si le bouton ne fonctionne pas, copiez ce lien complet/);
  assert.equal(payload.html.includes('?token='), true);
  const parsedFromHtml = parseMotivationInviteUrl(hrefs[0]);
  assert.equal(parsedFromHtml.token, RAW_TOKEN);
  assert.equal(logs.join('\n').includes(RAW_TOKEN), false);
});

test('production origin: Resend payload round-trips the raw token', async () => {
  const { result, resendBodies } = await sendWith({
    origin: PRODUCTION_INTAKE_ORIGIN,
    env: {
      COACH_MAIL_MODE: 'production',
      VERCEL_ENV: 'production',
    },
  });
  assert.equal(result.email_sent, true);
  assert.match(result.invite_url, /^https:\/\/app\.krkinetics\.com\/motivation\.html\?token=/);
  assertCanonicalInviteUrl(result.invite_url, RAW_TOKEN);
  const hrefs = extractHtmlHrefs(resendBodies[0].html);
  for (const href of hrefs) assertCanonicalInviteUrl(href, RAW_TOKEN);
  for (const href of extractTextUrls(resendBodies[0].text)) assertCanonicalInviteUrl(href, RAW_TOKEN);
});

test('tokens requiring encodeURIComponent survive HTML escape and URL parse', async () => {
  const { result, resendBodies } = await sendWith({
    tokens: [ENCODED_TOKEN],
    env: {
      VERCEL_ENV: 'preview',
      VERCEL_URL: PREVIEW_HOST,
    },
  });
  assert.equal(result.email_sent, true);
  assertCanonicalInviteUrl(result.invite_url, ENCODED_TOKEN);
  const hrefs = extractHtmlHrefs(resendBodies[0].html);
  assert.ok(hrefs[0].includes(encodeURIComponent(ENCODED_TOKEN)));
  assert.equal(hrefs[0].includes(ENCODED_TOKEN), false);
  for (const href of hrefs) {
    const decoded = decodeHtmlAttr(href.replace(/&amp;/g, '&'));
    assertCanonicalInviteUrl(decoded, ENCODED_TOKEN);
  }
  assert.equal(readMotivationInviteToken(new URL(hrefs[0])), ENCODED_TOKEN);
});

test('resend issues token B and never reuses token A; one create per send', async () => {
  const first = await sendWith({
    tokens: [RAW_TOKEN],
    env: { VERCEL_ENV: 'preview', VERCEL_URL: PREVIEW_HOST },
  });
  const second = await sendWith({
    tokens: [RAW_TOKEN_B],
    env: { VERCEL_ENV: 'preview', VERCEL_URL: PREVIEW_HOST },
  });
  assert.equal(first.result.email_sent, true);
  assert.equal(second.result.email_sent, true);
  assertCanonicalInviteUrl(first.result.invite_url, RAW_TOKEN);
  assertCanonicalInviteUrl(second.result.invite_url, RAW_TOKEN_B);
  const secondHrefs = extractHtmlHrefs(second.resendBodies[0].html);
  for (const href of secondHrefs) {
    assertCanonicalInviteUrl(href, RAW_TOKEN_B);
    assert.equal(new URL(href).searchParams.get('token') === RAW_TOKEN, false);
  }
  assert.equal(first.calls.filter((call) => call.url.includes('create_client_motivation_invite')).length, 1);
  assert.equal(second.calls.filter((call) => call.url.includes('create_client_motivation_invite')).length, 1);
  assert.equal(first.resendBodies.length, 1);
  assert.equal(second.resendBodies.length, 1);
});

test('preview bypass is appended only on vercel.app and does not change the token', async () => {
  const bypass = 'preview_bypass_secret_value_32ch_xx';
  const { result, resendBodies, logs } = await sendWith({
    env: {
      VERCEL_ENV: 'preview',
      VERCEL_URL: PREVIEW_HOST,
      VERCEL_AUTOMATION_BYPASS_SECRET: bypass,
    },
  });
  assert.equal(result.email_sent, true);
  assertCanonicalInviteUrl(result.invite_url, RAW_TOKEN);
  const url = new URL(result.invite_url);
  assert.equal(url.searchParams.get('x-vercel-protection-bypass'), bypass);
  assert.equal(url.searchParams.get('x-vercel-set-bypass-cookie'), 'true');
  for (const href of extractHtmlHrefs(resendBodies[0].html)) {
    assertCanonicalInviteUrl(href, RAW_TOKEN);
    assert.equal(href, result.invite_url);
  }
  assert.equal(logs.join('\n').includes(bypass), false);
  assert.equal(logs.join('\n').includes(RAW_TOKEN), false);
});

test('server and mail modules do not rebuild a second invite URL', () => {
  const sendSrc = fs.readFileSync(path.join(root, 'src/coach/server/motivation/send-motivation-invite.mjs'), 'utf8');
  const emailSrc = fs.readFileSync(path.join(root, 'src/coach/server/mail/motivation-invite-email.mjs'), 'utf8');
  const resendSrc = fs.readFileSync(path.join(root, 'src/coach/server/mail/resend-client.mjs'), 'utf8');
  const assertIdx = sendSrc.indexOf('assertMotivationInviteUrl(inviteUrl, invite.token)');
  const sendIdx = sendSrc.indexOf('sendResendEmail(');
  assert.ok(assertIdx > 0 && assertIdx < sendIdx);
  assert.match(sendSrc, /const inviteUrl = buildMotivationInviteUrl/);
  assert.match(sendSrc, /buildMotivationInviteEmail\(\{\s*fullName: authorized\.client\.full_name,\s*inviteUrl,/);
  assert.equal((sendSrc.match(/buildMotivationInviteUrl\(/g) || []).length, 1);
  assert.doesNotMatch(emailSrc, /buildMotivationInviteUrl|motivation\.html\?token=/);
  assert.doesNotMatch(resendSrc, /motivation\.html|inviteUrl|searchParams/);
  assert.match(emailSrc, /href="\$\{escapeHtml\(url\)\}"/);
});

test('vercel.json and middleware do not strip motivation.html query', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const middleware = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
  assert.equal(Array.isArray(vercel.redirects), false);
  assert.equal(
    (vercel.rewrites || []).some((row) => String(row.source).includes('motivation.html')),
    false,
  );
  assert.match(middleware, /pathname === '\/motivation\.html'/);
  assert.match(middleware, /return next\(\{ headers: sec \}\)/);
  assert.doesNotMatch(middleware, /new URL\([^)]*motivation/);
  const distPage = path.join(root, 'dist/coach-vercel/motivation.html');
  if (fs.existsSync(distPage)) {
    assert.match(fs.readFileSync(distPage, 'utf8'), /motivation\.js/);
  }
});

test('Vercel SSO 302 keeps the token inside the nested url param', async () => {
  const res = await fetch(PREVIEW_LIVE, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0 KR-invite-contract' },
  });
  if (res.status === 200) {
    assert.equal(new URL(PREVIEW_LIVE).searchParams.get('token'), 'TEST_TOKEN_ROUNDTRIP_24CH');
    return;
  }
  assert.equal(res.status, 302);
  const location = res.headers.get('location') || '';
  const locUrl = new URL(location);
  assert.equal(locUrl.hostname, 'vercel.com');
  assert.equal(locUrl.pathname, '/sso-api');
  assert.equal(locUrl.searchParams.has('token'), false);
  const nested = new URL(locUrl.searchParams.get('url') || '');
  assert.equal(nested.pathname, '/motivation.html');
  assert.equal(nested.searchParams.get('token'), 'TEST_TOKEN_ROUNDTRIP_24CH');
  assert.equal(readMotivationInviteToken(nested), 'TEST_TOKEN_ROUNDTRIP_24CH');
});

test('public parser receives the query token and rejects a dropped query', () => {
  assert.equal(readMotivationInviteToken('/motivation.html'), '');
  assert.equal(readMotivationInviteToken('https://app.krkinetics.com/motivation.html'), '');
  assert.equal(
    readMotivationInviteToken(`${PRODUCTION_INTAKE_ORIGIN}/motivation.html?token=TEST_TOKEN`),
    'TEST_TOKEN',
  );
  assert.equal(
    readMotivationInviteToken(`${PRODUCTION_INTAKE_ORIGIN}/motivation.html?token=${encodeURIComponent(ENCODED_TOKEN)}`),
    ENCODED_TOKEN,
  );
});

test('logs and coach diagnostics never include the raw token', async () => {
  const { result, logs } = await sendWith({
    env: { VERCEL_ENV: 'preview', VERCEL_URL: PREVIEW_HOST },
  });
  const dumped = `${logs.join('\n')}\n${JSON.stringify(redactForLog({
    invite_url: result.invite_url,
    token: RAW_TOKEN,
    invite_token_fingerprint: result.invite_token_fingerprint,
  }))}`;
  assert.equal(dumped.includes(RAW_TOKEN), false);
  assert.equal(result.invite_token_fingerprint.includes(RAW_TOKEN), false);
});
