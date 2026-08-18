/**
 * Client-facing invite origin must never pin to an immutable Vercel deployment.
 * Intake and motivation share one resolver.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN,
  INTEGRATION_PROFIL_MOTIVATIONNEL_REF,
  PRODUCTION_CLIENT_ORIGIN,
  isImmutableVercelDeploymentHost,
  resolveClientFacingOrigin,
} from '../../src/coach/server/http/client-facing-origin.mjs';
import { buildIntakeInviteUrl } from '../../src/coach/server/intake/build-intake-origin.mjs';
import { sendIntakeInvite } from '../../src/coach/server/intake/send-intake-invite.mjs';
import { sendMotivationInvite } from '../../src/coach/server/motivation/send-motivation-invite.mjs';
import { buildMotivationInviteUrl } from '../../src/coach/server/motivation/motivation-invite-link.mjs';
import { redactForLog } from '../../src/coach/server/http/redact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORG = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RAW_TOKEN = 'opaque_origin_roundtrip_token24';
const CLIENT_EMAIL = 'client.test@example.com';
const IMMUTABLE_A = 'equivalents-2-0-lytnvua6o-krkinetics-projects.vercel.app';
const IMMUTABLE_B = 'equivalents-2-0-abc123xyz-krkinetics-projects.vercel.app';
const IMMUTABLE_AFTER_DEPLOY = 'equivalents-2-0-newhash99-krkinetics-projects.vercel.app';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function createInviteFetch({ rpcPath }) {
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
        is_fictional: false,
      }]);
    }
    if (u.includes(rpcPath)) {
      return jsonResponse(200, [{
        invite_id: 'invite-origin-1',
        token: RAW_TOKEN,
        expires_at: '2026-08-30T12:00:00.000Z',
        status: 'pending',
      }]);
    }
    throw new Error(`unexpected url ${u}`);
  };
  return { fetchImpl, calls };
}

const PREVIEW_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  RESEND_API_KEY: 're_test_fake_key_not_real',
  COACH_MAIL_FROM: 'KR Kinetics <invitations@example.com>',
  COACH_MAIL_MODE: 'disabled',
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: INTEGRATION_PROFIL_MOTIVATIONNEL_REF,
};

async function withCapturedLogs(fn) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((item) => String(item)).join(' '));
  };
  try {
    return { value: await fn(), logs };
  } finally {
    console.log = originalLog;
  }
}

test('immutable Vercel deployment hosts are detected and git aliases are not', () => {
  assert.equal(isImmutableVercelDeploymentHost(IMMUTABLE_A), true);
  assert.equal(isImmutableVercelDeploymentHost(IMMUTABLE_B), true);
  assert.equal(isImmutableVercelDeploymentHost(IMMUTABLE_AFTER_DEPLOY), true);
  assert.equal(
    isImmutableVercelDeploymentHost('equivalents-2-0-git-integration-prof-57a4cb-krkinetics-projects.vercel.app'),
    false,
  );
});

test('1. immutable Preview A request origin → intake URL uses the stable branch alias', async () => {
  const { fetchImpl } = createInviteFetch({ rpcPath: '/rest/v1/rpc/create_client_intake_invite' });
  const result = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    req: { headers: { origin: `https://${IMMUTABLE_A}` } },
    requestId: 'req-intake-a',
    fetchImpl,
    env: { ...PREVIEW_ENV, VERCEL_URL: IMMUTABLE_A },
  });
  assert.equal(result.invite_created, true);
  assert.ok(result.invite_url);
  const url = new URL(result.invite_url);
  assert.equal(url.origin, INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN);
  assert.equal(url.pathname, '/intake.html');
  assert.equal(url.hostname.includes(IMMUTABLE_A.split('.')[0]), false);
  assert.equal(isImmutableVercelDeploymentHost(url.hostname), false);
});

test('2. immutable Preview B request origin → motivation URL uses the stable branch alias', async () => {
  const { fetchImpl } = createInviteFetch({ rpcPath: '/rest/v1/rpc/create_client_motivation_invite' });
  const result = await sendMotivationInvite({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    req: { headers: { origin: `https://${IMMUTABLE_B}` } },
    requestId: 'req-motivation-b',
    fetchImpl,
    env: { ...PREVIEW_ENV, VERCEL_URL: IMMUTABLE_B },
  });
  assert.equal(result.invite_created, true);
  assert.ok(result.invite_url);
  const url = new URL(result.invite_url);
  assert.equal(url.origin, INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN);
  assert.equal(url.pathname, '/motivation.html');
  assert.equal(url.hostname, new URL(INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN).hostname);
  assert.equal(isImmutableVercelDeploymentHost(url.hostname), false);
});

test('3. after a new deploy, the same stable alias remains canonical', () => {
  const before = resolveClientFacingOrigin({
    environment: 'preview',
    requestOrigin: `https://${IMMUTABLE_A}`,
    vercelGitCommitRef: INTEGRATION_PROFIL_MOTIVATIONNEL_REF,
  });
  const after = resolveClientFacingOrigin({
    environment: 'preview',
    requestOrigin: `https://${IMMUTABLE_AFTER_DEPLOY}`,
    vercelGitCommitRef: INTEGRATION_PROFIL_MOTIVATIONNEL_REF,
  });
  assert.deepEqual(before, { ok: true, origin: INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN });
  assert.deepEqual(after, { ok: true, origin: INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN });
  assert.equal(before.origin, after.origin);
});

test('4. production request always uses app.krkinetics.com', () => {
  const resolved = resolveClientFacingOrigin({
    environment: 'production',
    requestOrigin: `https://${IMMUTABLE_A}`,
    vercelGitCommitRef: INTEGRATION_PROFIL_MOTIVATIONNEL_REF,
    publicOrigin: INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN,
  });
  assert.deepEqual(resolved, { ok: true, origin: PRODUCTION_CLIENT_ORIGIN });
  assert.equal(
    buildIntakeInviteUrl(resolved.origin, RAW_TOKEN),
    `${PRODUCTION_CLIENT_ORIGIN}/intake.html?token=${encodeURIComponent(RAW_TOKEN)}`,
  );
  assert.equal(
    buildMotivationInviteUrl(resolved.origin, RAW_TOKEN),
    `${PRODUCTION_CLIENT_ORIGIN}/motivation.html?token=${encodeURIComponent(RAW_TOKEN)}`,
  );
});

test('5. token roundtrip is unchanged through the canonical origin', async () => {
  const { fetchImpl } = createInviteFetch({ rpcPath: '/rest/v1/rpc/create_client_intake_invite' });
  const result = await sendIntakeInvite({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    req: { headers: { origin: `https://${IMMUTABLE_A}` } },
    requestId: 'req-roundtrip',
    fetchImpl,
    env: { ...PREVIEW_ENV, VERCEL_URL: IMMUTABLE_A },
  });
  const url = new URL(result.invite_url);
  assert.equal(url.searchParams.get('token'), RAW_TOKEN);
  assert.equal(decodeURIComponent(url.searchParams.get('token')), RAW_TOKEN);
});

test('6. invite logs never include the raw token', async () => {
  const { fetchImpl } = createInviteFetch({ rpcPath: '/rest/v1/rpc/create_client_motivation_invite' });
  const { value, logs } = await withCapturedLogs(() => sendMotivationInvite({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    req: { headers: { origin: `https://${IMMUTABLE_B}` } },
    requestId: 'req-nolog',
    fetchImpl,
    env: { ...PREVIEW_ENV, VERCEL_URL: IMMUTABLE_B },
  }));
  const dumped = `${logs.join('\n')}\n${JSON.stringify(redactForLog({
    invite_url: value.invite_url,
    token: RAW_TOKEN,
  }))}`;
  assert.equal(dumped.includes(RAW_TOKEN), false);
});

test('other Preview branches fail closed unless a safe origin is configured', () => {
  assert.deepEqual(
    resolveClientFacingOrigin({
      environment: 'preview',
      requestOrigin: `https://${IMMUTABLE_A}`,
      vercelGitCommitRef: 'some-other-branch',
    }),
    { ok: false, reason: 'preview_origin_unresolved' },
  );
  assert.deepEqual(
    resolveClientFacingOrigin({
      environment: 'preview',
      requestOrigin: INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN,
      vercelGitCommitRef: 'some-other-branch',
      publicOrigin: `https://${IMMUTABLE_A}`,
    }),
    { ok: false, reason: 'preview_origin_unresolved' },
  );
  assert.deepEqual(
    resolveClientFacingOrigin({
      environment: 'preview',
      requestOrigin: `https://${IMMUTABLE_A}`,
      vercelGitCommitRef: 'some-other-branch',
      publicOrigin: INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN,
    }),
    { ok: true, origin: INTEGRATION_PROFIL_MOTIVATIONNEL_ORIGIN },
  );
});

test('intake and motivation share one origin helper and never read VERCEL_URL', () => {
  const helper = fs.readFileSync(path.join(root, 'src/coach/server/http/client-facing-origin.mjs'), 'utf8');
  const intakeOrigin = fs.readFileSync(path.join(root, 'src/coach/server/intake/build-intake-origin.mjs'), 'utf8');
  const motivationOrigin = fs.readFileSync(path.join(root, 'src/coach/server/motivation/build-motivation-origin.mjs'), 'utf8');
  const intakeSend = fs.readFileSync(path.join(root, 'src/coach/server/intake/send-intake-invite.mjs'), 'utf8');
  const motivationSend = fs.readFileSync(path.join(root, 'src/coach/server/motivation/send-motivation-invite.mjs'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');

  assert.match(helper, /export function resolveClientFacingOrigin/);
  assert.doesNotMatch(helper, /VERCEL_URL/);
  assert.match(intakeOrigin, /resolveClientFacingOrigin/);
  assert.match(motivationOrigin, /resolveClientFacingOrigin/);
  assert.match(intakeSend, /vercelGitCommitRef: env\.VERCEL_GIT_COMMIT_REF/);
  assert.match(motivationSend, /vercelGitCommitRef: env\.VERCEL_GIT_COMMIT_REF/);
  assert.match(intakeSend, /resolveIntakeOrigin/);
  assert.match(motivationSend, /resolveIntakeOrigin/);
  assert.doesNotMatch(dashboard, /intake\.html\?token=/);
  assert.doesNotMatch(dashboard, /motivation\.html\?token=/);
});
