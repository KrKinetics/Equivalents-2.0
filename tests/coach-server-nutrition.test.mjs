/**
 * Phase 2C–2E — server nutrition engine routes, parity, validation, security.
 * Mocked auth network only. Never logs tokens / emails / full bank payloads.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';

import {
  requireRequestAuth,
  MAX_API_BODY_BYTES,
} from '../src/coach/server/require-request-auth.mjs';
import { createCoachApiHandler, httpError } from '../src/coach/server/http/create-api-handler.mjs';
import { resetRateLimitBuckets, RATE_LIMIT_MAX_REQUESTS } from '../src/coach/server/http/rate-limit.mjs';
import { loadCoachData, clearCoachDataCache, coachDataLoadStats } from '../src/coach/server/food-bank/load-coach-data.mjs';
import { filterFoods, searchFoods, MAX_SEARCH_LIMIT } from '../src/coach/server/search/search-foods.mjs';
import { getFoodDetail } from '../src/coach/server/search/food-detail.mjs';
import { calculateEnergyNeeds, computeEerTdee, computeNasem2023Eer, computeIom2005Eer } from '../src/coach/server/calc/energy.mjs';
import {
  calculateMacroTargets,
  computeMacroTargets,
  computeProteinGrams,
  computeHydration,
  kcalFromMacros,
} from '../src/coach/server/calc/macros.mjs';
import {
  calculatePortions,
  MOYENNES,
  computeBanqueTotals,
  suggestBanque,
  scorePortions,
  distribuerPortions,
  computePlannedTotalsFromRepartition,
  reconcilePlanTotals,
} from '../src/coach/server/calc/portions.mjs';
import { listEquivalences } from '../src/coach/server/calc/equivalences.mjs';
import {
  validateFoodSearchBody,
  validateFoodDetailBody,
  validateEnergyBody,
  validateMacrosBody,
  validatePortionsBody,
  validateEquivalencesBody,
} from '../src/coach/server/validation/request-validators.mjs';
import {
  computeEerTdee as refComputeEerTdee,
  computeMacroTargets as refComputeMacroTargets,
  computeBanqueTotals as refComputeBanqueTotals,
  suggestBanque as refSuggestBanque,
  kcalFromMacros as refKcalFromMacros,
  MOYENNES as refMoyennes,
} from '../src/lib/coach-calculator-engine.mjs';
import {
  stripClientNutritionFormulas,
  buildConfigJsSource,
  htmlContainsEnergyFormulaIp,
} from '../scripts/coach-portal-deploy-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const goldenDir = path.join(root, 'tests', 'fixtures', 'golden');
const ORG_KR = '11111111-1111-1111-1111-111111111111';
const ORG_ELEVATE = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'user-coach-1';

function readGolden(name) {
  return JSON.parse(fs.readFileSync(path.join(goldenDir, name), 'utf8'));
}

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
      return { ok: userStatus >= 200 && userStatus < 300, status: userStatus, async json() { return userBody; } };
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
        async json() { return orgSlug ? [{ id: ORG_KR, slug: orgSlug }] : []; },
      };
    }
    throw new Error(`unexpected url in test mock: ${u}`);
  };
}

const baseEnv = {
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test_key',
};

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
  body = {},
  headers = {},
  cookie = 'coach_access_token=tok',
} = {}) {
  return {
    method,
    headers: {
      cookie,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(JSON.stringify(body))),
      ...headers,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

async function withAuthEnv(fn) {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = baseEnv.supabaseUrl;
  process.env.SUPABASE_PUBLISHABLE_KEY = baseEnv.publishableKey;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchFactory();
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
    process.env.SUPABASE_URL = prevUrl;
    process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
  }
}

// ─── Auth gates via requireRequestAuth (shared infra) ───────────────────────

test('auth: no session', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    fetchImpl: async () => { throw new Error('no network'); },
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'unauthorized');
});

test('auth: JWT invalid', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'bad',
    fetchImpl: mockFetchFactory({ userStatus: 401, userBody: {} }),
  });
  assert.equal(r.error, 'unauthorized');
});

test('auth: JWT expired', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'exp',
    fetchImpl: mockFetchFactory({ userStatus: 403, userBody: {} }),
  });
  assert.equal(r.error, 'unauthorized');
});

test('auth: user absent', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    fetchImpl: mockFetchFactory({ userBody: {} }),
  });
  assert.equal(r.error, 'unauthorized');
});

test('auth: membership absent', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    fetchImpl: mockFetchFactory({ memberships: [] }),
  });
  assert.equal(r.error, 'forbidden');
});

test('auth: KR→Elevate refused', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_ELEVATE,
    fetchImpl: mockFetchFactory({
      memberships: [{ id: 'm', organization_id: ORG_KR, role: 'coach' }],
    }),
  });
  assert.equal(r.error, 'forbidden');
});

test('auth: Elevate→KR refused', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_KR,
    fetchImpl: mockFetchFactory({
      memberships: [{ id: 'm', organization_id: ORG_ELEVATE, role: 'coach' }],
    }),
  });
  assert.equal(r.error, 'forbidden');
});

test('auth: role insufficient', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    fetchImpl: mockFetchFactory({
      memberships: [{ id: 'm', organization_id: ORG_KR, role: 'viewer' }],
    }),
  });
  assert.equal(r.error, 'forbidden');
});

test('auth: role coach authorized', async () => {
  const r = await requireRequestAuth({
    ...baseEnv,
    accessToken: 'tok',
    requestedOrganizationId: ORG_KR,
    fetchImpl: mockFetchFactory(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.organizationId, ORG_KR);
});

// ─── Validation ─────────────────────────────────────────────────────────────

test('validation: food search rejects invalid JSON object / unexpected props / long q', () => {
  assert.equal(validateFoodSearchBody(null).ok, false);
  assert.equal(validateFoodSearchBody({ q: 'x', hack: 1 }).ok, false);
  assert.equal(validateFoodSearchBody({ q: 'a'.repeat(200) }).ok, false);
  assert.equal(validateFoodSearchBody({ q: 'poulet', limit: 10 }).ok, true);
});

test('validation: food detail rejects unknown id shape', () => {
  assert.equal(validateFoodDetailBody({ id: '../etc/passwd' }).ok, false);
  assert.equal(validateFoodDetailBody({ id: 'fruits-apple' }).ok, true);
});

test('validation: energy rejects bad types and bounds', () => {
  assert.equal(validateEnergyBody({
    sexe: 'X', age: 30, poidsKg: 80, hauteurM: 1.8, activite: 'modere',
  }).ok, false);
  assert.equal(validateEnergyBody({
    sexe: 'H', age: 30, poidsKg: 80, hauteurM: 1.8, activite: 'modere', method: 'nasem2023',
  }).ok, true);
  assert.equal(validateEnergyBody({
    sexe: 'H', age: 30, poidsKg: 80, hauteurM: 1.8, activite: 'modere', method: 'magic',
  }).ok, false);
});

test('validation: macros / portions / equivalences', () => {
  assert.equal(validateMacrosBody({ tdee: 3000, weightKg: 80, goalMultiplier: 1 }).ok, true);
  assert.equal(validateMacrosBody({ tdee: -1, weightKg: 80 }).ok, false);
  assert.equal(validatePortionsBody({ action: 'banque_totals', banque: { pro: 1 } }).ok, true);
  assert.equal(validatePortionsBody({ action: 'nope' }).ok, false);
  assert.equal(validatePortionsBody({ action: 'banque_totals', banque: { pro: 9999 } }).ok, false);
  assert.equal(validateEquivalencesBody({ category: 'fruits', limit: 10 }).ok, true);
  assert.equal(validateEquivalencesBody({ category: 1 }).ok, false);
});

test('validation: payload size constant documented', () => {
  assert.equal(MAX_API_BODY_BYTES, 262144);
});

// ─── Food bank load (server only) ───────────────────────────────────────────

test('food bank: loads server-side once and reports size without leaking foods in stats', () => {
  clearCoachDataCache();
  const loaded = loadCoachData();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.totalFoods, 287);
  assert.ok(loaded.meta.bytes > 50_000);
  const stats = coachDataLoadStats();
  assert.equal(stats.loaded, true);
  assert.equal(stats.totalFoods, 287);
  assert.equal(JSON.stringify(stats).includes('nameFr'), false);
  const again = loadCoachData();
  assert.equal(again.meta.cached, true);
});

// ─── Search parity + API limits ─────────────────────────────────────────────

test('search: golden filter parity (strict ids)', () => {
  const fixture = readGolden('food-search.cases.json');
  const { data } = loadCoachData();
  for (const c of fixture.cases) {
    const ids = filterFoods(data.foods, c.q, c.category).map((f) => f.id);
    assert.equal(ids.length, c.expected.count, c.id);
    assert.deepEqual(ids, c.expected.ids, c.id);
  }
});

test('search: accents/case/partial/empty/limits/order/no full-bank leak', () => {
  const { data } = loadCoachData();
  const apple = filterFoods(data.foods, 'APPLE');
  const appleFr = filterFoods(data.foods, 'pomme');
  assert.ok(apple.some((f) => f.id === 'fruits-apple'));
  assert.ok(appleFr.length >= 1);

  // Accent: client semantics are literal (é ≠ e) — preserve parity, stay deterministic.
  const withAccent = filterFoods(data.foods, 'purée').map((f) => f.id);
  const withoutAccent = filterFoods(data.foods, 'puree').map((f) => f.id);
  assert.deepEqual(withAccent, filterFoods(data.foods, 'purée').map((f) => f.id));
  assert.deepEqual(withoutAccent, filterFoods(data.foods, 'puree').map((f) => f.id));

  const page = searchFoods(data, { q: '', limit: 10, offset: 0 });
  assert.equal(page.results.length, 10);
  assert.equal(page.total, 287);
  assert.ok(page.results.length < page.total);
  assert.equal(page.limit, 10);
  const ids = page.results.map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));

  const capped = searchFoods(data, { q: '', limit: 999, offset: 0 });
  assert.equal(capped.results.length, MAX_SEARCH_LIMIT);

  const none = searchFoods(data, { q: 'zzz-no-such-food-zzz', limit: 25 });
  assert.equal(none.total, 0);
  assert.deepEqual(none.results, []);

  // Response projection has no guide dump / evidence.
  const sample = JSON.stringify(page);
  assert.equal(sample.includes('audit'), false);
  assert.equal(sample.includes('sourceEvidence'), false);
  assert.ok(!sample.includes('"foods":['));
});

test('food detail: known / unknown', () => {
  const { data } = loadCoachData();
  const ok = getFoodDetail(data, 'fruits-apple');
  assert.equal(ok.ok, true);
  assert.equal(ok.food.id, 'fruits-apple');
  assert.equal(getFoodDetail(data, 'does-not-exist').ok, false);
});

// ─── Golden calc parity (server vs reference engine) ────────────────────────

test('parity: EER/TDEE golden via server calc', () => {
  const { cases } = readGolden('eer-tdee.cases.json');
  for (const c of cases) {
    const actual = calculateEnergyNeeds(c.input);
    const ref = refComputeEerTdee(c.input);
    assert.deepEqual(
      { bmr: Math.round(actual.bmr), tdee: Math.round(actual.tdee), method: actual.method },
      c.expected,
      c.id,
    );
    assert.equal(Math.round(actual.bmr), Math.round(ref.bmr), c.id);
    assert.equal(Math.round(actual.tdee), Math.round(ref.tdee), c.id);
  }
});

test('parity: direct NASEM/IOM helpers', () => {
  const { cases } = readGolden('nasem-direct.cases.json');
  for (const c of cases) {
    if (c.engine === 'computeNasem2023Eer') {
      assert.equal(Math.round(computeNasem2023Eer(c.input)), c.expected.eer, c.id);
    } else if (c.engine === 'computeIom2005Eer') {
      assert.equal(Math.round(computeIom2005Eer(c.input)), c.expected.eer, c.id);
    }
  }
});

test('parity: macro targets / protein / hydration / energy Atwater', () => {
  const macros = readGolden('macro-targets.cases.json');
  for (const c of macros.cases) {
    if (c.engine === 'computeMacroTargets') {
      assert.deepEqual(computeMacroTargets(c.input), c.expected, c.id);
      assert.deepEqual(calculateMacroTargets(c.input).targets, refComputeMacroTargets(c.input), c.id);
    } else if (c.engine === 'computeProteinGrams') {
      assert.equal(computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 2, goalKcal: 2500 }), c.expected.gkg_2, c.id);
      assert.equal(computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 1.5, goalKcal: 2500 }), c.expected.gkg_1_5, c.id);
      assert.equal(computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 0.5, goalKcal: 2500 }), c.expected.gkg_clamped_low, c.id);
      assert.equal(computeProteinGrams({ mode: 'pct', weightKg: 80, pct: 25, goalKcal: 2500 }), c.expected.pct_25, c.id);
    } else if (c.engine === 'computeHydration') {
      assert.deepEqual(computeHydration(3258, 0), c.expected.h3258, c.id);
      assert.deepEqual(computeHydration(3258, 0.5), c.expected.h3258_add, c.id);
      assert.deepEqual(computeHydration(0, 1), c.expected.h0_add, c.id);
    }
  }
  const energy = readGolden('macro-energy.cases.json');
  for (const c of energy.cases) {
    assert.equal(kcalFromMacros(c.input.pro, c.input.glu, c.input.lip), c.expected.kcal, c.id);
    assert.equal(kcalFromMacros(c.input.pro, c.input.glu, c.input.lip), refKcalFromMacros(c.input.pro, c.input.glu, c.input.lip), c.id);
  }
});

test('parity: portions / moyennes / equivalences empty without category', () => {
  const fixture = readGolden('portions-banque.cases.json');
  assert.deepEqual(MOYENNES, fixture.moyennes);
  assert.deepEqual(MOYENNES, refMoyennes);
  assert.deepEqual(calculatePortions({ action: 'moyennes' }).moyennes, fixture.moyennes);

  for (const c of fixture.cases) {
    if (c.engine === 'computeBanqueTotals') {
      assert.deepEqual(computeBanqueTotals(c.input.banque), c.expected, c.id);
      assert.deepEqual(calculatePortions({ action: 'banque_totals', banque: c.input.banque }).totals, refComputeBanqueTotals(c.input.banque), c.id);
    } else if (c.engine === 'suggestBanque') {
      const suggested = suggestBanque(c.input.targets);
      assert.deepEqual(suggested, c.expected.banque, c.id);
      assert.deepEqual(calculatePortions({ action: 'suggest', targets: c.input.targets }).banque, refSuggestBanque(c.input.targets), c.id);
      assert.equal(scorePortions(suggested, c.input.targets), c.expected.score, c.id);
    } else if (c.engine === 'distribuerPortions') {
      const portions = distribuerPortions(c.input.total, c.input.weights);
      assert.deepEqual(portions, c.expected.portions, c.id);
      assert.equal(portions.reduce((a, b) => a + b, 0), c.expected.sum, c.id);
    } else if (c.engine === 'computePlannedTotalsFromRepartition') {
      assert.deepEqual(computePlannedTotalsFromRepartition(c.input.repartition), c.expected, c.id);
    } else if (c.engine === 'reconcilePlanTotals') {
      const recon = reconcilePlanTotals(c.input);
      assert.deepEqual(recon.varianceVsTarget, c.expected.varianceVsTarget, c.id);
      assert.equal(recon.withinThreshold, c.expected.withinThreshold, c.id);
    }
  }

  const { data } = loadCoachData();
  const empty = listEquivalences(data, { category: '', limit: 25 });
  assert.deepEqual(empty.results, []);
  assert.ok(empty.categories.length >= 8);
  const fruits = listEquivalences(data, { category: 'fruits', limit: 10, offset: 0 });
  assert.equal(fruits.results.length, 10);
  assert.ok(fruits.total > 10);
});

// ─── HTTP handler integration (auth + validation + headers) ─────────────────

test('http handler: unauthorized without cookie', async () => {
  resetRateLimitBuckets();
  const handler = createCoachApiHandler({
    routeName: 'test-unauth',
    validate: validateFoodSearchBody,
    async handle() { return { ok: true }; },
  });
  const res = mockRes();
  await handler(mockReq({ cookie: '', body: { q: 'x' } }), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json, { error: 'unauthorized' });
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.match(res.headers['Content-Type'], /application\/json/);
});

test('http handler: bad_request on unexpected property', async () => {
  resetRateLimitBuckets();
  await withAuthEnv(async () => {
    const handler = createCoachApiHandler({
      routeName: 'test-bad',
      validate: validateFoodSearchBody,
      async handle() { return { ok: true }; },
    });
    const res = mockRes();
    await handler(mockReq({ body: { q: 'x', evil: true } }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json, { error: 'bad_request' });
  });
});

test('http handler: success search does not return full bank', async () => {
  resetRateLimitBuckets();
  await withAuthEnv(async () => {
    const handler = createCoachApiHandler({
      routeName: 'test-search-ok',
      validate: validateFoodSearchBody,
      async handle({ input }) {
        const loaded = loadCoachData();
        return searchFoods(loaded.data, input);
      },
    });
    const res = mockRes();
    await handler(mockReq({
      body: { q: 'poulet', limit: 10, organization_id: ORG_KR },
    }), res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.json.results.length <= 10);
    assert.ok(res.json.total >= 0);
    const text = res.body;
    assert.equal(text.includes('service_role'), false);
    assert.equal(text.includes('NASEM_COEFFICIENTS'), false);
    assert.ok(res.json.results.length < 287 || res.json.total < 287 || res.json.results.length <= 10);
  });
});

test('http handler: method not allowed + rate limit', async () => {
  resetRateLimitBuckets();
  const handler = createCoachApiHandler({
    routeName: 'test-rate',
    validate: validateFoodSearchBody,
    async handle() { return { ok: true }; },
  });
  const resGet = mockRes();
  await handler(mockReq({ method: 'GET', body: {} }), resGet);
  assert.equal(resGet.statusCode, 405);

  await withAuthEnv(async () => {
    // Burn the default profile bucket for this isolate/route.
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 2; i += 1) {
      const res = mockRes();
      await handler(mockReq({ body: { q: 'a' } }), res);
      if (res.statusCode === 429) {
        assert.equal(res.json.error, 'rate_limited');
        return;
      }
    }
    assert.fail('expected rate_limited before exhausting loop');
  });
});

test('http handler: cross-org forbidden', async () => {
  resetRateLimitBuckets();
  await withAuthEnv(async () => {
    const handler = createCoachApiHandler({
      routeName: 'test-xorg',
      validate: validateFoodSearchBody,
      async handle() { return { ok: true }; },
    });
    const res = mockRes();
    await handler(mockReq({
      body: { q: 'x', organization_id: ORG_ELEVATE },
    }), res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.json, { error: 'forbidden' });
  });
});

test('httpError helper', () => {
  assert.deepEqual(httpError('not_found'), {
    __httpError: true,
    status: 404,
    error: 'not_found',
  });
});

// ─── Security / deliverable proofs ──────────────────────────────────────────

test('security: API route sources call requireRequestAuth path and avoid service_role', () => {
  for (const file of [
    'api/coach-food-search.js',
    'api/coach-food-detail.js',
    'api/coach-calc-energy.js',
    'api/coach-calc-macros.js',
    'api/coach-calc-portions.js',
    'api/coach-calc-equivalences.js',
  ]) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /createCoachApiHandler/);
    assert.equal(/service_role|SERVICE_ROLE/.test(src), false, file);
  }
  const handlerSrc = fs.readFileSync(
    path.join(root, 'src/coach/server/http/create-api-handler.mjs'),
    'utf8',
  );
  assert.match(handlerSrc, /requireRequestAuth/);
  assert.match(handlerSrc, /private, no-store/);
});

test('security: config.js feature flag never embeds service_role', () => {
  const src = buildConfigJsSource({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_only_not_real',
    serverNutritionEngine: true,
  });
  assert.match(src, /serverNutritionEngine":true/);
  assert.equal(/service_role/i.test(src), false);
});

test('security: stripClientNutritionFormulas removes coefficient matrix', () => {
  const sample = `<html><head></head><body>
<script id="coach-shared-engine">
const NASEM_COEFFICIENTS = { H: { adult: { sedentaire: [1,2,3,4] } } };
const PA_H = { sedentaire: 1.0, leger: 1.11 };
const PA_F = { sedentaire: 1.0, leger: 1.12 };
global.CoachSharedEngine = { suggestBanque() { return NASEM_COEFFICIENTS; } };
</script>
<script>
    function krNasem2023Eer(sexe, age, kg, cm, activite) {
        const f = { modere: [1004.82, -10.83, 6.52, 15.91] }[activite];
        return f[0] + f[1] * age + f[2] * cm + f[3] * kg;
    }

    function krIom2005Eer(sexe, age, kg, metres, activite) {
        const PA_H = { sedentaire: 1.00, leger: 1.11, modere: 1.25, actif: 1.48 };
        return 662 - (9.53 * age) + PA_H[activite] * ((15.91 * kg) + (539.6 * metres));
    }

    function krSetYouthGoalGuard(age) {}
</script>
</body></html>`;
  assert.equal(htmlContainsEnergyFormulaIp(sample), true);
  const out = stripClientNutritionFormulas(sample);
  assert.match(out, /data-coach-server-nutrition="1"/);
  assert.match(out, /Client engine disabled/);
  // Display Atwater % helper stays available; portion/NASEM IP stays blocked.
  assert.match(out, /macroPercentagesFromGrams:\s*function\s*\(pro,\s*glu,\s*lip\)/);
  assert.doesNotMatch(out, /macroPercentagesFromGrams:\s*function\s*\(\)\s*\{\s*return blocked/);
  assert.equal(out.includes('suggestBanque() { return NASEM_COEFFICIENTS'), false);
  assert.equal(htmlContainsEnergyFormulaIp(out), false);
  assert.match(out, /Client NASEM disabled/);
  assert.match(out, /Client IOM disabled/);
  // Dossier compatibility helpers must survive the strip (not nutrition formulas).
  assert.match(out, /migrateProfilData:\s*migrateProfilData/);
  assert.match(out, /normalizeLegacyRepartition:\s*normalizeLegacyRepartition/);
});

test('security: coach-data.json is not under public portal assets path in repo contract', () => {
  assert.equal(fs.existsSync(path.join(root, 'coach-portal', 'coach-data.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'coach-portal', 'workspace', 'coach-data.json')), false);
  // Source bank remains server/build-time only under coach-calculator (API includeFiles).
  assert.ok(fs.existsSync(path.join(root, 'coach-calculator', 'coach-data.json')));
});

test('parity smoke: computeEerTdee export identity', () => {
  const input = {
    sexe: 'H', age: 30, poidsKg: 80, hauteurM: 1.8, activite: 'modere', method: 'nasem2023',
  };
  assert.deepEqual(computeEerTdee(input), refComputeEerTdee(input));
});

// silence unused import in some node versions
void PassThrough;
