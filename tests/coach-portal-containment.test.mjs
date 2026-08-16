/**
 * Phase 1 containment: auth gate helpers, Magic Link anti-enumeration,
 * deploy tree must not publish coach-data.json, clients org immutability SQL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAGIC_LINK_UNIFORM_MESSAGE,
  formatLoginFailure,
} from '../coach-portal/assets/login-otp.mjs';
import {
  COACH_ACCESS_COOKIE,
  isProtectedPath,
  isPublicPath,
  parseCookies,
  readAccessToken,
  requireCoachSession,
} from '../src/coach/security/portal-auth.mjs';
import { assertDeployTreeSafe } from '../scripts/coach-portal-deploy-lib.mjs';
import { buildCoachVercelBundle } from '../scripts/coach-vercel-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FAKE_PUBLIC = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_for_build',
};

test('protected path matrix covers dashboard, workspace, coach modules', () => {
  assert.equal(isProtectedPath('/dashboard.html'), true);
  assert.equal(isProtectedPath('/workspace/'), true);
  assert.equal(isProtectedPath('/workspace/index.html'), true);
  assert.equal(isProtectedPath('/workspace/vendor/jspdf.umd.min.js'), true);
  assert.equal(isProtectedPath('/src/coach/workspace/workspace-access.mjs'), true);
  assert.equal(isProtectedPath('/src/coach/domain/client-service-entitlements.mjs'), true);
  assert.equal(isProtectedPath('/assets/dashboard.js'), true);
  assert.equal(isProtectedPath('/assets/pre-interview-report.js'), true);
  assert.equal(isProtectedPath('/pre-interview-report.html'), true);
  assert.equal(isProtectedPath('/motivation-report.html'), true);
  assert.equal(isProtectedPath('/assets/motivation-report.js'), true);
  assert.equal(isProtectedPath('/assets/workspace-bootstrap.mjs'), true);
  assert.equal(isProtectedPath('/motivation-qa.html'), true);
  assert.equal(isProtectedPath('/assets/motivation-qa.js'), true);
  assert.equal(isProtectedPath('/motivation.html'), false);
  assert.equal(isProtectedPath('/assets/motivation.js'), false);
  assert.equal(isProtectedPath('/src/coach/motivation/client/official-bundle.mjs'), false);
  assert.equal(isProtectedPath('/login.html'), false);
  assert.equal(isProtectedPath('/config.js'), false);
  assert.equal(isPublicPath('/login.html'), true);
  assert.equal(isPublicPath('/assets/login.js'), true);
  assert.equal(isPublicPath('/motivation.html'), true);
  assert.equal(isPublicPath('/src/coach/motivation/client/public-questionnaire.mjs'), true);
});

test('Magic Link formatter never distinguishes invited vs unknown vs rate-limit', () => {
  const samples = [
    'Email rate limit exceeded',
    'Signups not allowed for otp',
    'User not found',
    'Unable to validate email address: invalid format',
    'unexpected provider failure xyz',
  ];
  for (const msg of samples) {
    const formatted = formatLoginFailure(new Error(msg));
    assert.equal(formatted.message, MAGIC_LINK_UNIFORM_MESSAGE);
  }
  assert.match(MAGIC_LINK_UNIFORM_MESSAGE, /Si ce courriel est autorisé/i);
});

test('cookie helpers parse access token from cookie or Authorization', () => {
  const token = 'test.jwt.token';
  assert.equal(
    readAccessToken({ cookieHeader: `${COACH_ACCESS_COOKIE}=${encodeURIComponent(token)}` }),
    token,
  );
  assert.equal(
    readAccessToken({ authorization: `Bearer ${token}` }),
    token,
  );
  assert.deepEqual(parseCookies('a=1; b=two'), { a: '1', b: 'two' });
});

test('requireCoachSession rejects missing token without calling network', async () => {
  const result = await requireCoachSession({
    accessToken: null,
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_x',
    fetchImpl: async () => {
      throw new Error('network should not be called');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test('requireCoachSession accepts valid user with membership (mocked)', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/auth/v1/user')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: 'user-1', email: 'coach@example.com' };
        },
      };
    }
    if (String(url).includes('/rest/v1/memberships')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [{ id: 'm1', organization_id: 'org-1', role: 'coach' }];
        },
      };
    }
    throw new Error(`unexpected url ${url}`);
  };
  const result = await requireCoachSession({
    accessToken: 'valid.token',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_x',
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.memberships.length, 1);
});

test('vercel bundle excludes public workspace/coach-data.json and keeps no service_role', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-contain-'));
  const { outDir, serverNutritionEngine } = buildCoachVercelBundle({ outDir: tmp, env: FAKE_PUBLIC });
  assert.equal(serverNutritionEngine, true);
  assert.equal(fs.existsSync(path.join(outDir, 'workspace', 'coach-data.json')), false);
  assert.equal(fs.existsSync(path.join(outDir, 'workspace', 'index.html')), true);
  assertDeployTreeSafe(outDir);
  const config = fs.readFileSync(path.join(outDir, 'config.js'), 'utf8');
  assert.doesNotMatch(config, /service_role|SERVICE_ROLE/);
  assert.match(config, /serverNutritionEngine":true/);
  const html = fs.readFileSync(path.join(outDir, 'workspace', 'index.html'), 'utf8');
  assert.match(html, /data-coach-server-nutrition="1"/);
  assert.match(html, /server-nutrition-bridge\.mjs/);
  assert.doesNotMatch(html, /\/api\/coach-data/);
});

test('clients organization_id immutability migration is present', () => {
  const sql = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260804180000_clients_organization_immutable.sql'),
    'utf8',
  );
  assert.match(sql, /clients_prevent_organization_move/);
  assert.match(sql, /organization_id is immutable/i);
  assert.match(sql, /set search_path = public/i);
});

test('vercel.json sets containment headers without legacy coach-data routes', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const sources = cfg.headers.map((h) => h.source);
  assert.ok(sources.includes('/(.*)'));
  const globalHeaders = cfg.headers.find((h) => h.source === '/(.*)').headers;
  const keys = globalHeaders.map((h) => h.key);
  assert.ok(keys.includes('Content-Security-Policy'));
  assert.ok(!keys.includes('Content-Security-Policy-Report-Only'));
  assert.ok(keys.includes('X-Frame-Options'));
  assert.ok(keys.includes('Permissions-Policy'));
  assert.ok(keys.includes('Strict-Transport-Security'));
  const csp = globalHeaders.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /unsafe-inline/); // portal shell is strict
  assert.doesNotMatch(csp, /esm\.sh/);
  const workspaceHeaders = cfg.headers.find((h) => h.source === '/workspace/(.*)').headers;
  const workspaceCsp = workspaceHeaders.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(workspaceCsp, /script-src 'self' 'unsafe-inline'/); // residual calculator onclick
  assert.equal(
    cfg.rewrites.some((r) => r.source === '/workspace/coach-data.json' || r.destination === '/api/coach-data'),
    false,
  );
  assert.equal(cfg.functions?.['api/coach-data.js'], undefined);
  assert.ok(cfg.functions?.['api/coach-generate-pdf.js']?.includeFiles);
});
