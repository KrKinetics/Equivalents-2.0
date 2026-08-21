/**
 * Bloc 3 regression: Classique / Équilibré must not trip calc-portions rate limit
 * or hide 429 as a generic "service unavailable" message.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkRouteRateLimit,
  resetRateLimitBuckets,
  buildRateIdentityKey,
} from '../src/coach/server/http/rate-limit.mjs';
import { getRateLimitProfile } from '../src/coach/server/http/rate-limit-profiles.mjs';
import { validatePortionsBody } from '../src/coach/server/validation/request-validators.mjs';
import {
  formatServerNutritionError,
  SERVER_NUTRITION_RATE_LIMIT_ERROR,
  SERVER_NUTRITION_VALIDATION_ERROR,
  SERVER_NUTRITION_GENERIC_ERROR,
} from '../src/coach/client/server-nutrition-api.mjs';
import { calculatePortions } from '../src/coach/server/calc/portions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLE_BANQUE = Object.freeze({
  pro: 4, fec: 6, leg: 4, fru: 3, lai: 2, lip: 3, whey: 1,
});

test('calc-portions profile allows a normal Classique→Équilibré session burst', () => {
  resetRateLimitBuckets();
  const profile = getRateLimitProfile('calc-portions');
  assert.ok(profile.max >= 120, `calc-portions max too low: ${profile.max}`);
  assert.ok(profile.max > getRateLimitProfile('generate-pdf').max);

  // Simulate open + settle + edits + two auto repartitions (legacy fan-out ~3 calls each).
  const identity = 'u_test:ip_test';
  const simulatedCalls = 8 /* settle */ + 15 /* edits */ + 6 /* classique+equilibre */;
  assert.ok(simulatedCalls < profile.max, 'normal path must stay under limit');
  for (let i = 0; i < simulatedCalls; i += 1) {
    const r = checkRouteRateLimit('calc-portions', identity);
    assert.equal(r.ok, true, `call ${i + 1}/${simulatedCalls} unexpectedly limited`);
  }
});

test('distinct identities do not share calc-portions buckets', () => {
  resetRateLimitBuckets();
  const profile = getRateLimitProfile('calc-portions');
  const a = 'user-a';
  const b = 'user-b';
  for (let i = 0; i < profile.max; i += 1) {
    assert.equal(checkRouteRateLimit('calc-portions', a).ok, true);
  }
  assert.equal(checkRouteRateLimit('calc-portions', a).ok, false);
  assert.equal(checkRouteRateLimit('calc-portions', b).ok, true);
});

test('buildRateIdentityKey hashes opaque user markers (no raw token/email)', () => {
  const key = buildRateIdentityKey({
    req: { headers: { 'x-forwarded-for': '203.0.113.9' } },
    userId: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
  });
  assert.doesNotMatch(key, /eyJhbGciOiJIUzI1NiJ9/);
  assert.doesNotMatch(key, /203\.0\.113\.9/);
  assert.match(key, /^u_[0-9a-f]+:ip_[0-9a-f]+$/);
});

test('nutrition error formatter distinguishes rate_limited vs validation vs generic', () => {
  assert.equal(formatServerNutritionError(429, 'rate_limited'), SERVER_NUTRITION_RATE_LIMIT_ERROR);
  assert.equal(formatServerNutritionError(422, 'validation_failed'), SERVER_NUTRITION_VALIDATION_ERROR);
  assert.equal(formatServerNutritionError(400, 'bad_request'), SERVER_NUTRITION_VALIDATION_ERROR);
  assert.equal(formatServerNutritionError(503, 'unavailable'), SERVER_NUTRITION_GENERIC_ERROR);
  assert.doesNotMatch(SERVER_NUTRITION_RATE_LIMIT_ERROR, /indisponible/i);
});

test('validatePortionsBody normalizes decimal/comma banque and string repartition', () => {
  const ok = validatePortionsBody({
    action: 'auto_repartition',
    mode: 'classique',
    banque: { ...SAMPLE_BANQUE, fec: '6,5', leg: '4.0' },
    heureEntrainement: '17:30',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.banque.fec, 6.5);
  assert.equal(ok.value.mode, 'classique');

  const planned = validatePortionsBody({
    action: 'planned_totals',
    repartition: Array.from({ length: 42 }, (_, i) => (i === 0 ? '1,5' : '0')),
  });
  assert.equal(planned.ok, true);
  assert.equal(planned.value.repartition[0], 1.5);

  const badMode = validatePortionsBody({
    action: 'auto_repartition',
    mode: 'Classique',
    banque: SAMPLE_BANQUE,
  });
  assert.equal(badMode.ok, false);

  const extra = validatePortionsBody({
    action: 'moyennes',
    unexpected: true,
  });
  assert.equal(extra.ok, false);
});

test('server auto_repartition classique and equilibre succeed for sample banque', () => {
  const classic = calculatePortions({
    action: 'auto_repartition',
    banque: SAMPLE_BANQUE,
    mode: 'classique',
  });
  assert.ok(Array.isArray(classic.repartition));
  assert.equal(classic.repartition.length, 49);
  assert.ok(classic.plannedTotals?.kcal > 0);

  const balanced = calculatePortions({
    action: 'auto_repartition',
    banque: SAMPLE_BANQUE,
    mode: 'equilibre',
  });
  assert.ok(Array.isArray(balanced.repartition));
  assert.ok(balanced.plannedTotals?.kcal > 0);
});

test('bridge debounces UI banque and locks auto repartition (source contracts)', () => {
  const bridge = fs.readFileSync(
    path.join(ROOT, 'src/coach/client/server-nutrition-bridge.mjs'),
    'utf8',
  );
  assert.match(bridge, /calculerBanqueFromUi/);
  assert.match(bridge, /repartirInflight/);
  assert.match(bridge, /__plannedTotalsFp === fp/);
  assert.match(bridge, /formatServerNutritionError|err\?\.message/);
  const api = fs.readFileSync(
    path.join(ROOT, 'src/coach/client/server-nutrition-api.mjs'),
    'utf8',
  );
  assert.match(api, /SERVER_NUTRITION_RATE_LIMIT_ERROR/);
  assert.match(api, /formatServerNutritionError/);
});

test('voluntary calc-portions overrun returns rate_limited with Retry-After semantics', () => {
  resetRateLimitBuckets();
  const profile = getRateLimitProfile('calc-portions');
  const id = 'burst-overrun';
  for (let i = 0; i < profile.max; i += 1) {
    assert.equal(checkRouteRateLimit('calc-portions', id).ok, true);
  }
  const blocked = checkRouteRateLimit('calc-portions', id);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.error, 'rate_limited');
  assert.ok(blocked.retryAfterSec >= 1);
});
