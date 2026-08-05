/**
 * Production rate-limit must never fail-open to a fresh memory bucket
 * when the Supabase RPC is configured but unavailable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDistributedRateLimit,
  resetRateLimitBuckets,
  resolveDeployEnv,
  resolveRateLimitBackend,
  RETRY_AFTER_UNAVAILABLE_SEC,
} from '../src/coach/server/http/rate-limit.mjs';
import { consumeSupabaseRateLimit } from '../src/coach/server/http/rate-limit-supabase.mjs';
import { createCoachApiHandler } from '../src/coach/server/http/create-api-handler.mjs';
import { PUBLIC_ERROR } from '../src/coach/server/http/errors.mjs';
import {
  formatServerNutritionError,
  SERVER_NUTRITION_RATE_BACKEND_ERROR,
  SERVER_NUTRITION_RATE_LIMIT_ERROR,
} from '../src/coach/client/server-nutrition-api.mjs';

function mockRes() {
  const headers = Object.create(null);
  return {
    statusCode: 200,
    headers,
    body: '',
    json: null,
    setHeader(k, v) { headers[String(k).toLowerCase()] = String(v); },
    end(chunk) {
      this.body = chunk == null ? '' : String(chunk);
      try { this.json = JSON.parse(this.body); } catch { this.json = null; }
    },
  };
}

function mockReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(JSON.stringify(body))),
      ...headers,
    },
    body,
  };
}

test('resolveDeployEnv maps VERCEL_ENV and NODE_ENV=test', () => {
  assert.equal(resolveDeployEnv({ vercelEnv: 'production' }), 'production');
  assert.equal(resolveDeployEnv({ vercelEnv: 'preview' }), 'preview');
  assert.equal(resolveDeployEnv({ vercelEnv: '', nodeEnv: 'test' }), 'test');
});

test('memory backend forbidden in Production; allowed in test/dev', async () => {
  resetRateLimitBuckets();
  const prod = await checkDistributedRateLimit({
    routeName: 'calc-portions',
    identityKey: 'u_a',
    deployEnv: 'production',
    backend: 'memory',
  });
  assert.equal(prod.ok, false);
  assert.equal(prod.status, 503);
  assert.equal(prod.error, 'rate_limit_misconfigured');
  assert.ok(prod.retryAfterSec >= 1);

  const unsetProd = await checkDistributedRateLimit({
    routeName: 'calc-portions',
    identityKey: 'u_b',
    deployEnv: 'production',
    backend: null,
  });
  assert.equal(unsetProd.error, 'rate_limit_misconfigured');

  resetRateLimitBuckets();
  const testOk = await checkDistributedRateLimit({
    routeName: 'calc-portions',
    identityKey: 'u_c',
    deployEnv: 'test',
    backend: 'memory',
  });
  assert.equal(testOk.ok, true);
  assert.equal(testOk.backend, 'memory');
});

test('supabase under limit → allow; limit reached → 429 (no memory)', async () => {
  resetRateLimitBuckets();
  let hits = 0;
  const fetchImpl = async () => {
    hits += 1;
    if (hits <= 2) {
      return {
        ok: true,
        status: 200,
        async json() { return { allowed: true, ok: true, hit_count: hits }; },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() { return { allowed: false, ok: false, retry_after_sec: 17 }; },
    };
  };

  const a = await checkDistributedRateLimit({
    routeName: 'calc-portions',
    identityKey: 'same',
    deployEnv: 'production',
    backend: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_x',
    fetchImpl,
  });
  assert.equal(a.ok, true);

  const b = await checkDistributedRateLimit({
    routeName: 'calc-portions',
    identityKey: 'same',
    deployEnv: 'production',
    backend: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_x',
    fetchImpl,
  });
  assert.equal(b.ok, true);

  const c = await checkDistributedRateLimit({
    routeName: 'calc-portions',
    identityKey: 'same',
    deployEnv: 'production',
    backend: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_x',
    fetchImpl,
  });
  assert.equal(c.ok, false);
  assert.equal(c.status, 429);
  assert.equal(c.error, 'rate_limited');
  assert.equal(c.retryAfterSec, 17);
  assert.equal(c.backend, 'supabase');
  assert.equal(resolveRateLimitBackend({ configured: 'supabase' }), 'supabase');
});

test('RPC network / 5xx / timeout → 503 unavailable; never memory allow', async () => {
  resetRateLimitBuckets();

  const network = await consumeSupabaseRateLimit({
    bucketKey: 'k', max: 5, windowMs: 60_000,
    supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_x',
    fetchImpl: async () => { throw new Error('ECONNRESET'); },
  });
  assert.equal(network.kind, 'unavailable');
  assert.equal(network.category, 'rpc_network');

  const five = await consumeSupabaseRateLimit({
    bucketKey: 'k', max: 5, windowMs: 60_000,
    supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_x',
    fetchImpl: async () => ({ ok: false, status: 503, async json() { return {}; } }),
  });
  assert.equal(five.kind, 'unavailable');
  assert.equal(five.category, 'rpc_5xx');

  const timeout = await consumeSupabaseRateLimit({
    bucketKey: 'k', max: 5, windowMs: 60_000,
    supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_x',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => {
      await new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    },
  });
  assert.equal(timeout.kind, 'unavailable');
  assert.equal(timeout.category, 'rpc_timeout');

  // Inject failure by pointing at a dead host with short timeout path through check
  const decision = await checkDistributedRateLimit({
    routeName: 'calc-portions',
    identityKey: 'prod-user',
    deployEnv: 'production',
    backend: 'supabase',
    supabaseUrl: 'https://127.0.0.1:9',
    publishableKey: 'sb_publishable_x',
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 503);
  assert.equal(decision.error, 'rate_limit_unavailable');
  assert.equal(decision.retryAfterSec, RETRY_AFTER_UNAVAILABLE_SEC);
  assert.notEqual(decision.error, 'rate_limited');
});

test('handler: RPC unavailable returns 503 before business handler; Retry-After set', async () => {
  resetRateLimitBuckets();
  let handled = 0;
  const prev = process.env.COACH_RATE_LIMIT_BACKEND;
  const prevVercel = process.env.VERCEL_ENV;
  process.env.COACH_RATE_LIMIT_BACKEND = 'supabase';
  process.env.VERCEL_ENV = 'production';
  process.env.SUPABASE_URL = 'https://127.0.0.1:9';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';

  try {
    const handler = createCoachApiHandler({
      routeName: 'calc-portions',
      validate: (body) => ({ ok: true, value: body || {} }),
      async handle() {
        handled += 1;
        return { ok: true };
      },
    });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'moyennes' } }), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.json?.error, 'rate_limit_unavailable');
    assert.ok(res.json?.requestId);
    assert.ok(Number(res.headers['retry-after']) >= 1);
    assert.equal(handled, 0, 'business handler must not run after rate-limit failure');
  } finally {
    if (prev == null) delete process.env.COACH_RATE_LIMIT_BACKEND;
    else process.env.COACH_RATE_LIMIT_BACKEND = prev;
    if (prevVercel == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
  }
});

test('two identities / endpoints do not share buckets (memory); Retry-After on 429', async () => {
  resetRateLimitBuckets();
  const profileRoute = 'generate-pdf';
  // Burn shared key for pdf profile (max 8)
  for (let i = 0; i < 8; i += 1) {
    const r = await checkDistributedRateLimit({
      routeName: profileRoute,
      identityKey: 'user-a',
      deployEnv: 'test',
      backend: 'memory',
    });
    assert.equal(r.ok, true);
  }
  const blocked = await checkDistributedRateLimit({
    routeName: profileRoute,
    identityKey: 'user-a',
    deployEnv: 'test',
    backend: 'memory',
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.retryAfterSec >= 1);

  const otherUser = await checkDistributedRateLimit({
    routeName: profileRoute,
    identityKey: 'user-b',
    deployEnv: 'test',
    backend: 'memory',
  });
  assert.equal(otherUser.ok, true);

  const otherRoute = await checkDistributedRateLimit({
    routeName: 'calc-energy',
    identityKey: 'user-a',
    deployEnv: 'test',
    backend: 'memory',
  });
  assert.equal(otherRoute.ok, true);
});

test('public catalog + UX messages for 429 vs 503 rate-limit codes', () => {
  assert.equal(PUBLIC_ERROR.rate_limit_unavailable.status, 503);
  assert.equal(PUBLIC_ERROR.rate_limit_misconfigured.status, 503);
  assert.equal(formatServerNutritionError(429, 'rate_limited'), SERVER_NUTRITION_RATE_LIMIT_ERROR);
  assert.equal(
    formatServerNutritionError(503, 'rate_limit_unavailable'),
    SERVER_NUTRITION_RATE_BACKEND_ERROR,
  );
  assert.equal(
    formatServerNutritionError(503, 'rate_limit_misconfigured'),
    SERVER_NUTRITION_RATE_BACKEND_ERROR,
  );
});

test('migration SQL still has no anon/authenticated table grants', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260805140000_coach_rate_limit_buckets.sql'),
    'utf8',
  );
  assert.match(sql, /revoke all on table public\.coach_rate_buckets from anon, authenticated/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/i);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete|all) on table public\.coach_rate_buckets to anon/i);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete|all) on table public\.coach_rate_buckets to authenticated/i);
});
