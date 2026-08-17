import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { motivationPersistenceBearer } = require('../../api/coach-motivation.js');

test('motivation persistence prefers the configured service role secret', () => {
  const bearer = motivationPersistenceBearer('coach-access-token', {
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  });
  assert.equal(bearer, 'service-role-secret');
});

test('motivation persistence falls back to the authenticated Coach JWT when the service role is absent', () => {
  const bearer = motivationPersistenceBearer('coach-access-token', {});
  assert.equal(bearer, 'coach-access-token');
});

test('motivation persistence has no anonymous bearer fallback', () => {
  const bearer = motivationPersistenceBearer('', {});
  assert.equal(bearer, '');
});
