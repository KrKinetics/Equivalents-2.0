import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeMotivationAccess } from '../../src/coach/server/motivation/authorize-motivation-access.mjs';
import { authorizeIntakeReportAccess } from '../../src/coach/intake-report/authorize-intake-report-access.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const CLIENT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function clientFetch(row) {
  return async () => new Response(JSON.stringify(row ? [row] : []), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function realClient(overrides = {}) {
  return {
    id: CLIENT,
    organization_id: ORG,
    full_name: 'Client Réel',
    email: 'client@example.com',
    phone: '',
    service_type: 'complete',
    is_fictional: false,
    ...overrides,
  };
}

const common = {
  accessToken: 'coach-jwt',
  organizationId: ORG,
  clientId: CLIENT,
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test',
};

test('motivation report authorizes a real client in the Coach organization', async () => {
  const result = await authorizeMotivationAccess({ ...common, fetchImpl: clientFetch(realClient()) });
  assert.equal(result.ok, true);
  assert.equal(result.client.id, CLIENT);
});

test('motivation report refuses a fictional or cross-org dossier', async () => {
  const fictional = await authorizeMotivationAccess({
    ...common,
    fetchImpl: clientFetch(realClient({ is_fictional: true })),
  });
  assert.deepEqual(fictional, { ok: false, error: 'forbidden' });

  const crossOrg = await authorizeMotivationAccess({
    ...common,
    fetchImpl: clientFetch(realClient({ organization_id: '22222222-2222-4222-8222-222222222222' })),
  });
  assert.deepEqual(crossOrg, { ok: false, error: 'forbidden' });
});

test('pre-interview report authorizes a real client in the Coach organization', async () => {
  const result = await authorizeIntakeReportAccess({ ...common, fetchImpl: clientFetch(realClient()) });
  assert.equal(result.ok, true);
  assert.equal(result.client.id, CLIENT);
});

test('pre-interview report refuses a fictional dossier', async () => {
  const result = await authorizeIntakeReportAccess({
    ...common,
    fetchImpl: clientFetch(realClient({ is_fictional: true })),
  });
  assert.deepEqual(result, { ok: false, error: 'forbidden' });
});
