import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeMotivationAccess } from '../src/coach/server/motivation/authorize-motivation-access.mjs';

const base = {
  accessToken: 'jwt',
  organizationId: 'org-a',
  clientId: 'client-a',
  supabaseUrl: 'https://example.test',
  publishableKey: 'key',
};

function client(overrides = {}) {
  return {
    id: 'client-a',
    organization_id: 'org-a',
    full_name: 'Client Réel',
    email: 'client@example.test',
    phone: '5145551212',
    service_type: 'complete',
    is_fictional: false,
    ...overrides,
  };
}

function fetchRows(rows, ok = true) {
  return async () => ({ ok, json: async () => rows });
}

test('motivation access allows a real client in the selected organization', async () => {
  const result = await authorizeMotivationAccess({
    ...base,
    fetchImpl: fetchRows([client()]),
  });
  assert.equal(result.ok, true);
  assert.equal(result.client.id, 'client-a');
  assert.equal(result.client.organization_id, 'org-a');
  assert.equal(result.client.full_name, 'Client Réel');
});

test('motivation access refuses fictional clients', async () => {
  const result = await authorizeMotivationAccess({
    ...base,
    fetchImpl: fetchRows([client({ is_fictional: true })]),
  });
  assert.deepEqual(result, { ok: false, error: 'forbidden' });
});

test('motivation access refuses a real client from another organization', async () => {
  const result = await authorizeMotivationAccess({
    ...base,
    fetchImpl: fetchRows([client({ organization_id: 'org-b' })]),
  });
  assert.deepEqual(result, { ok: false, error: 'forbidden' });
});

test('motivation access fails closed on missing inputs and upstream errors', async () => {
  assert.deepEqual(
    await authorizeMotivationAccess({ ...base, accessToken: '' }),
    { ok: false, error: 'forbidden' },
  );
  assert.deepEqual(
    await authorizeMotivationAccess({ ...base, fetchImpl: fetchRows([], false) }),
    { ok: false, error: 'forbidden' },
  );
  assert.deepEqual(
    await authorizeMotivationAccess({
      ...base,
      fetchImpl: async () => { throw new Error('network'); },
    }),
    { ok: false, error: 'forbidden' },
  );
});
