/**
 * Phase 2B — server auth module tests (mocked network only).
 * Never touches Production data. Never logs tokens or emails.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_API_BODY_BYTES,
  DEFAULT_ALLOWED_ROLES,
  PUBLIC_AUTH_ERROR,
  toPublicAuthError,
  assertBodyWithinLimit,
  resolveAuthorizedMembership,
  requireRequestAuth,
  publicAuthResponseBody,
} from '../src/coach/server/require-request-auth.mjs';
import { COACH_ACCESS_COOKIE } from '../src/coach/security/portal-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ORG_KR = '11111111-1111-1111-1111-111111111111';
const ORG_ELEVATE = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'user-coach-1';

function mockFetchFactory({
  userStatus = 200,
  userBody = { id: USER_ID },
  membershipStatus = 200,
  memberships = [{ id: 'm-kr', organization_id: ORG_KR, role: 'coach' }],
  orgStatus = 200,
  orgSlug = 'kr-kinetics',
} = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return {
        ok: userStatus >= 200 && userStatus < 300,
        status: userStatus,
        async json() { return userBody; },
      };
    }
    if (u.includes('/rest/v1/memberships')) {
      return {
        ok: membershipStatus >= 200 && membershipStatus < 300,
        status: membershipStatus,
        async json() { return memberships; },
      };
    }
    if (u.includes('/rest/v1/organizations')) {
      return {
        ok: orgStatus >= 200 && orgStatus < 300,
        status: orgStatus,
        async json() {
          return orgSlug ? [{ id: ORG_KR, slug: orgSlug }] : [];
        },
      };
    }
    throw new Error(`unexpected url in test mock: ${u}`);
  };
}

const baseEnv = {
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test_key',
};

test('constants: max body and allowed roles documented', () => {
  assert.equal(MAX_API_BODY_BYTES, 262144);
  assert.deepEqual(DEFAULT_ALLOWED_ROLES, ['coach', 'platform_owner']);
});

test('assertBodyWithinLimit rejects oversized Content-Length', () => {
  assert.equal(assertBodyWithinLimit(100).ok, true);
  const big = assertBodyWithinLimit(MAX_API_BODY_BYTES + 1);
  assert.equal(big.ok, false);
  assert.equal(big.error, 'payload_too_large');
  assert.equal(big.status, 413);
});

test('toPublicAuthError collapses sensitive reasons', () => {
  assert.deepEqual(toPublicAuthError('missing_token'), PUBLIC_AUTH_ERROR.unauthorized);
  assert.deepEqual(toPublicAuthError('invalid_or_expired'), PUBLIC_AUTH_ERROR.unauthorized);
  assert.deepEqual(toPublicAuthError('org_mismatch'), PUBLIC_AUTH_ERROR.forbidden);
  assert.deepEqual(toPublicAuthError('slug_mismatch'), PUBLIC_AUTH_ERROR.forbidden);
  assert.deepEqual(toPublicAuthError('role_not_allowed'), PUBLIC_AUTH_ERROR.forbidden);
  assert.deepEqual(toPublicAuthError('no_organization'), PUBLIC_AUTH_ERROR.forbidden);
  assert.deepEqual(toPublicAuthError('missing_config'), PUBLIC_AUTH_ERROR.misconfigured);
});

test('publicAuthResponseBody never includes reason/user/org', () => {
  const body = publicAuthResponseBody({ status: 403, error: 'forbidden', reason: 'org_mismatch' });
  assert.deepEqual(body, { error: 'forbidden' });
  assert.equal(JSON.stringify(body).includes('org_mismatch'), false);
});

test('resolveAuthorizedMembership: deny default empty', () => {
  assert.equal(resolveAuthorizedMembership([]).ok, false);
});

test('resolveAuthorizedMembership: rejects client org not in session (KR→Elevate)', () => {
  const memberships = [{ id: 'm1', organization_id: ORG_KR, role: 'coach' }];
  const result = resolveAuthorizedMembership(memberships, {
    requestedOrganizationId: ORG_ELEVATE,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'org_mismatch');
});

test('resolveAuthorizedMembership: rejects Elevate→KR', () => {
  const memberships = [{ id: 'm1', organization_id: ORG_ELEVATE, role: 'coach' }];
  const result = resolveAuthorizedMembership(memberships, {
    requestedOrganizationId: ORG_KR,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'org_mismatch');
});

test('resolveAuthorizedMembership: rejects insufficient role', () => {
  const memberships = [{ id: 'm1', organization_id: ORG_KR, role: 'viewer' }];
  const result = resolveAuthorizedMembership(memberships, {
    allowedRoles: DEFAULT_ALLOWED_ROLES,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'role_not_allowed');
});

test('resolveAuthorizedMembership: accepts coach and platform_owner', () => {
  assert.equal(
    resolveAuthorizedMembership([{ id: 'm1', organization_id: ORG_KR, role: 'coach' }]).ok,
    true,
  );
  assert.equal(
    resolveAuthorizedMembership([{ id: 'm1', organization_id: ORG_KR, role: 'platform_owner' }]).ok,
    true,
  );
});

test('requireRequestAuth: no session / missing token', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    fetchImpl: async () => { throw new Error('network should not run'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error, 'unauthorized');
});

test('requireRequestAuth: invalid token', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'invalid',
    fetchImpl: mockFetchFactory({ userStatus: 401, userBody: {} }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unauthorized');
});

test('requireRequestAuth: expired token treated as unauthorized', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'expired',
    fetchImpl: mockFetchFactory({ userStatus: 403, userBody: {} }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unauthorized');
});

test('requireRequestAuth: unknown user (no id)', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    fetchImpl: mockFetchFactory({ userBody: {} }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unauthorized');
});

test('requireRequestAuth: membership absent', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    fetchImpl: mockFetchFactory({ memberships: [] }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
  assert.equal(result.reason, 'no_organization');
});

test('requireRequestAuth: cookie header accepted', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    cookieHeader: `${COACH_ACCESS_COOKIE}=${encodeURIComponent('cookie-token')}`,
    fetchImpl: mockFetchFactory(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.userId, USER_ID);
  assert.equal(result.organizationId, ORG_KR);
  assert.equal(result.role, 'coach');
});

test('requireRequestAuth: Bearer header accepted', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    authorization: 'Bearer bearer-token',
    fetchImpl: mockFetchFactory(),
  });
  assert.equal(result.ok, true);
});

test('requireRequestAuth: valid org + role', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_KR,
    fetchImpl: mockFetchFactory(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.organizationId, ORG_KR);
});

test('requireRequestAuth: KR session cannot select Elevate org', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_ELEVATE,
    fetchImpl: mockFetchFactory({
      memberships: [{ id: 'm-kr', organization_id: ORG_KR, role: 'coach' }],
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
  assert.equal(result.reason, 'org_mismatch');
});

test('requireRequestAuth: Elevate session cannot select KR org', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_KR,
    fetchImpl: mockFetchFactory({
      memberships: [{ id: 'm-el', organization_id: ORG_ELEVATE, role: 'coach' }],
      orgSlug: 'elevate-fitness',
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
});

test('requireRequestAuth: slug mismatch KR vs Elevate', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_KR,
    requestedOrganizationSlug: 'elevate-fitness',
    fetchImpl: mockFetchFactory({ orgSlug: 'kr-kinetics' }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
  assert.equal(result.reason, 'slug_mismatch');
});

test('requireRequestAuth: slug match succeeds', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_KR,
    requestedOrganizationSlug: 'kr-kinetics',
    fetchImpl: mockFetchFactory({ orgSlug: 'kr-kinetics' }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.organizationSlug, 'kr-kinetics');
});

test('requireRequestAuth: role insufficient', async () => {
  const result = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    allowedRoles: ['platform_owner'],
    fetchImpl: mockFetchFactory({
      memberships: [{ id: 'm1', organization_id: ORG_KR, role: 'coach' }],
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
});

test('module source never uses a service role secret identifier', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'coach', 'server', 'require-request-auth.mjs'),
    'utf8',
  );
  // Exact env/key tokens must not appear (prose may say "service role secret").
  assert.doesNotMatch(src, /SERVICE_ROLE|service_role_key|SUPABASE_SERVICE_ROLE/);
  assert.doesNotMatch(src, /createClient\([^)]*service/i);
  assert.match(src, /Every future API handler MUST call requireRequestAuth/i);
});

test('golden and auth fixtures contain no secrets', () => {
  const goldenDir = path.join(root, 'tests', 'fixtures', 'golden');
  for (const name of fs.readdirSync(goldenDir)) {
    if (!name.endsWith('.json')) continue;
    const text = fs.readFileSync(path.join(goldenDir, name), 'utf8');
    assert.doesNotMatch(text, /SERVICE_ROLE|service_role_key|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/);
    assert.doesNotMatch(text, /sb_secret_|SUPABASE_SERVICE_ROLE/i);
  }
});

test('api/coach-data.js unchanged contract still streams full bank (Phase 1 temporary)', () => {
  const src = fs.readFileSync(path.join(root, 'api', 'coach-data.js'), 'utf8');
  assert.match(src, /createReadStream/);
  assert.match(src, /requireCoachSession/);
  assert.doesNotMatch(src, /requireRequestAuth/);
});
