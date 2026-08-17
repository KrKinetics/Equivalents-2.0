import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadClientPlanningLandmarks,
  planningLandmarksFromAnalysisSnapshot,
  toIntakePlanningContext,
} from '../../src/coach/server/intake/load-client-planning-landmarks.mjs';
import { buildIntakeAnthropometricsView } from '../../src/coach/intake/intake-anthropometrics.mjs';
import { redactForLog } from '../../src/coach/server/http/redact.mjs';

const ORG = '11111111-1111-1111-1111-111111111111';
const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INTAKE_A = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INTAKE_B = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INTAKE_C = '33333333-cccc-4ccc-8ccc-cccccccccccc';

const SAMPLE_ANSWERS = {
  age_years: '36',
  height_unit: 'imperial',
  height_feet: '5',
  height_inches: '9',
  weight_lb: '183',
};

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function row({
  id,
  clientId,
  submittedAt,
  answers = SAMPLE_ANSWERS,
  organizationId = ORG,
} = {}) {
  return {
    id,
    client_id: clientId,
    organization_id: organizationId,
    status: 'submitted',
    submitted_at: submittedAt,
    answers,
  };
}

test('same client: latest admissible intake wins and conversions stay canonical', async () => {
  const expected = buildIntakeAnthropometricsView(SAMPLE_ANSWERS);
  const fetchImpl = async () => jsonResponse(200, [
    row({ id: INTAKE_B, clientId: CLIENT_A, submittedAt: '2026-08-10T12:00:00.000Z' }),
    row({
      id: INTAKE_A,
      clientId: CLIENT_A,
      submittedAt: '2026-08-01T12:00:00.000Z',
      answers: { ...SAMPLE_ANSWERS, weight_lb: '180' },
    }),
  ]);
  const planning = await loadClientPlanningLandmarks({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_A,
    submittedBeforeOrAt: '2026-08-12T12:00:00.000Z',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key',
    fetchImpl,
  });
  assert.equal(planning.clientId, CLIENT_A);
  assert.equal(planning.sourceIntakeResponseId, INTAKE_B);
  assert.equal(planning.anthropometrics.age, '36 ans');
  assert.equal(planning.anthropometrics.heightPrimary, '5 pi 9 po');
  assert.equal(planning.anthropometrics.heightSecondary, '175 cm');
  assert.equal(planning.anthropometrics.weightPrimary, '183 lb');
  assert.equal(planning.anthropometrics.weightSecondary, '83,0 kg');
  assert.deepEqual(planning.anthropometrics, {
    age: expected.age,
    heightPrimary: expected.heightPrimary,
    heightSecondary: expected.heightSecondary,
    weightPrimary: expected.weightPrimary,
    weightSecondary: expected.weightSecondary,
  });
});

test('cross-client leak is rejected even if the payload is mixed', async () => {
  const fetchImpl = async () => jsonResponse(200, [
    row({ id: INTAKE_B, clientId: CLIENT_B, submittedAt: '2026-08-10T12:00:00.000Z' }),
  ]);
  const planning = await loadClientPlanningLandmarks({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_A,
    submittedBeforeOrAt: '2026-08-12T12:00:00.000Z',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key',
    fetchImpl,
  });
  assert.equal(planning, null);
});

test('later intake after motivation cutoff is ignored', async () => {
  const fetchImpl = async () => jsonResponse(200, [
    row({
      id: INTAKE_C,
      clientId: CLIENT_A,
      submittedAt: '2026-08-20T12:00:00.000Z',
      answers: { ...SAMPLE_ANSWERS, weight_lb: '190' },
    }),
    row({ id: INTAKE_B, clientId: CLIENT_A, submittedAt: '2026-08-10T12:00:00.000Z' }),
  ]);
  const planning = await loadClientPlanningLandmarks({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_A,
    submittedBeforeOrAt: '2026-08-12T12:00:00.000Z',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key',
    fetchImpl,
  });
  assert.equal(planning.sourceIntakeResponseId, INTAKE_B);
  assert.equal(planning.anthropometrics.weightPrimary, '183 lb');
});

test('intake after a historical motivation date yields no landmarks', async () => {
  const fetchImpl = async () => jsonResponse(200, [
    row({ id: INTAKE_C, clientId: CLIENT_A, submittedAt: '2026-08-12T12:00:00.000Z' }),
  ]);
  const planning = await loadClientPlanningLandmarks({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_A,
    submittedBeforeOrAt: '2026-08-10T12:00:00.000Z',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key',
    fetchImpl,
  });
  assert.equal(planning, null);
});

test('legacy empty answers never invent zeros', async () => {
  const fetchImpl = async () => jsonResponse(200, [
    row({
      id: INTAKE_A,
      clientId: CLIENT_A,
      submittedAt: '2026-08-01T12:00:00.000Z',
      answers: { objective_primary: 'Perte de masse adipeuse' },
    }),
  ]);
  const planning = await loadClientPlanningLandmarks({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_A,
    submittedBeforeOrAt: '2026-08-12T12:00:00.000Z',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key',
    fetchImpl,
  });
  assert.equal(planning, null);
});

test('snapshot helper refuses a mismatched client and redacts values', () => {
  const context = toIntakePlanningContext({
    clientId: CLIENT_A,
    sourceIntakeResponseId: INTAKE_B,
    sourceSubmittedAt: '2026-08-10T12:00:00.000Z',
    anthropometrics: buildIntakeAnthropometricsView(SAMPLE_ANSWERS),
  });
  const leaked = planningLandmarksFromAnalysisSnapshot({
    client_id: CLIENT_B,
    context: { intakePlanning: context },
  });
  assert.equal(leaked, null);
  const ok = planningLandmarksFromAnalysisSnapshot({
    client_id: CLIENT_A,
    context: { intakePlanning: context },
  });
  assert.equal(ok.age, '36 ans');
  const redacted = JSON.stringify(redactForLog({
    planningLandmarks: ok,
    age: ok.age,
    weightPrimary: ok.weightPrimary,
  }));
  assert.equal(redacted.includes('36 ans'), false);
  assert.equal(redacted.includes('183'), false);
});
