/**
 * Bloc 3 hardening contracts: CSP, redaction, rate profiles, JSON safety, session anti-enum.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPortalCspPolicy,
  buildWorkspaceCspPolicy,
} from '../src/coach/server/http/csp-policy.mjs';
import { redactForLog, hashRateIdentity } from '../src/coach/server/http/redact.mjs';
import {
  checkRateLimit,
  resetRateLimitBuckets,
  buildRateIdentityKey,
} from '../src/coach/server/http/rate-limit.mjs';
import { getRateLimitProfile } from '../src/coach/server/http/rate-limit-profiles.mjs';
import {
  assertSafeJsonShape,
  assertJsonContentType,
  parseJsonBody,
} from '../src/coach/server/http/parse-json-body.mjs';
import { PUBLIC_ERROR } from '../src/coach/server/http/errors.mjs';
import {
  formatPasswordLoginFailure,
  PASSWORD_AUTH_FAILURE_MESSAGE,
} from '../coach-portal/assets/login-password.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('portal CSP is enforced-ready: no unsafe-inline scripts, no esm.sh, no unsafe-eval', () => {
  const csp = buildPortalCspPolicy();
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /esm\.sh/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self' https:\/\/\*\.supabase\.co/);
});

test('workspace CSP documents residual unsafe-inline for legacy calculator handlers', () => {
  const csp = buildWorkspaceCspPolicy();
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(csp, /esm\.sh/);
  assert.doesNotMatch(csp, /unsafe-eval/);
});

test('vercel.json uses enforced CSP (not Report-Only) and vendors supabase', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const global = cfg.headers.find((h) => h.source === '/(.*)').headers;
  assert.ok(global.some((h) => h.key === 'Content-Security-Policy'));
  assert.ok(!global.some((h) => h.key === 'Content-Security-Policy-Report-Only'));
  assert.ok(fs.existsSync(path.join(root, 'coach-portal/assets/vendor/supabase-bundle.mjs')));
  const supabaseClient = fs.readFileSync(path.join(root, 'coach-portal/assets/supabase-client.js'), 'utf8');
  assert.match(supabaseClient, /from '\.\/vendor\/supabase-bundle\.mjs'/);
  assert.doesNotMatch(supabaseClient, /https:\/\/esm\.sh/);
  const indexHtml = fs.readFileSync(path.join(root, 'coach-portal/index.html'), 'utf8');
  assert.match(indexHtml, /portal-boot\.mjs/);
  assert.doesNotMatch(indexHtml, /<script type="module">/);
});

test('redaction strips JWT, email, bearer, and sensitive keys', () => {
  const redacted = redactForLog({
    authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.aaa.bbb',
    email: 'coach@example.com',
    note: 'hello eyJhbGciOiJIUzI1NiJ9.aaa.bbb world',
    nested: { cookie: 'coach_access_token=abc', ok: 1 },
  });
  assert.equal(redacted.authorization, '[redacted]');
  assert.equal(redacted.email, '[redacted]');
  assert.match(String(redacted.note), /\[redacted-jwt\]/);
  assert.equal(redacted.nested.cookie, '[redacted]');
  assert.equal(redacted.nested.ok, 1);
  assert.match(hashRateIdentity('1.2.3.4'), /^ip_[0-9a-f]+$/);
});

test('rate profiles: PDF stricter than food search; 429 + Retry-After semantics', () => {
  resetRateLimitBuckets();
  const pdf = getRateLimitProfile('generate-pdf');
  const search = getRateLimitProfile('food-search');
  assert.ok(pdf.max < search.max);
  const key = 'generate-pdf:test-user';
  for (let i = 0; i < pdf.max; i += 1) {
    assert.equal(checkRateLimit(key, pdf).ok, true);
  }
  const blocked = checkRateLimit(key, pdf);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.retryAfterSec >= 1);
});

test('JSON safety rejects prototype pollution and wrong Content-Type', async () => {
  assert.equal(assertSafeJsonShape({ a: 1 }).ok, true);
  assert.equal(assertSafeJsonShape(JSON.parse('{"__proto__":{"x":1}}')).ok, false);
  assert.equal(assertJsonContentType({ headers: {} }).error, 'unsupported_media_type');
  assert.equal(assertJsonContentType({ headers: { 'content-type': 'text/plain' } }).error, 'unsupported_media_type');
  const bad = await parseJsonBody({
    headers: { 'content-type': 'application/json', 'content-length': '2' },
    body: '{',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'malformed_request');
});

test('password failures share one public message (anti-enumeration)', () => {
  const a = formatPasswordLoginFailure(new Error('Invalid login credentials'));
  const b = formatPasswordLoginFailure(new Error('Signups not allowed'));
  const c = formatPasswordLoginFailure(new Error('Email not confirmed'));
  assert.equal(a.message, PASSWORD_AUTH_FAILURE_MESSAGE);
  assert.equal(b.message, PASSWORD_AUTH_FAILURE_MESSAGE);
  assert.equal(c.message, PASSWORD_AUTH_FAILURE_MESSAGE);
  assert.doesNotMatch(a.message, /Invalid login|Signups|not confirmed/i);
});

test('session handler no longer returns verified.reason strings', () => {
  const src = fs.readFileSync(path.join(root, 'api/session.js'), 'utf8');
  assert.doesNotMatch(src, /error:\s*verified\.reason/);
  assert.doesNotMatch(src, /JSON\.stringify\(\{\s*error:\s*verified\.reason/);
  assert.match(src, /checkDistributedRateLimit/);
  assert.match(src, /PUBLIC_ERROR\.unauthorized/);
});

test('public error catalog includes Bloc 3 codes', () => {
  assert.equal(PUBLIC_ERROR.malformed_request.status, 400);
  assert.equal(PUBLIC_ERROR.validation_failed.status, 422);
  assert.equal(PUBLIC_ERROR.unsupported_media_type.status, 415);
  assert.equal(PUBLIC_ERROR.internal_error.status, 500);
  assert.equal(PUBLIC_ERROR.rate_limited.status, 429);
  assert.equal(PUBLIC_ERROR.rate_limit_unavailable.status, 503);
  assert.equal(PUBLIC_ERROR.rate_limit_misconfigured.status, 503);
});

test('rate-limit migration SQL exists and is reversible (not applied by tests)', () => {
  const mig = path.join(root, 'supabase/migrations/20260805140000_coach_rate_limit_buckets.sql');
  const rb = path.join(root, 'supabase/rollbacks/20260805140000_coach_rate_limit_buckets_rollback.sql');
  assert.ok(fs.existsSync(mig));
  assert.ok(fs.existsSync(rb));
  const sql = fs.readFileSync(mig, 'utf8');
  assert.match(sql, /coach_consume_rate_limit/);
  assert.match(sql, /security definer/i);
  assert.doesNotMatch(sql, /service_role.*grant execute on function public.coach_consume_rate_limit/i);
});

test('buildRateIdentityKey uses hashed IP/user/org — never raw address or ids', () => {
  const key = buildRateIdentityKey({
    req: { headers: { 'x-forwarded-for': '203.0.113.9' }, socket: {} },
    userId: 'user-1',
    organizationId: 'org-1',
  });
  assert.doesNotMatch(key, /203\.0\.113\.9/);
  assert.doesNotMatch(key, /user-1|org-1/);
  assert.match(key, /^u_[0-9a-f]+:o_[0-9a-f]+:ip_[0-9a-f]+$/);
});
