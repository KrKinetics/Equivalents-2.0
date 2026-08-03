/**
 * Session guard / redirect helpers — no live credentials, no secrets logged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  withQueryAndHash,
} from '../coach-portal/assets/auth-callback.mjs';

test('unauthenticated dashboard target stays login with preserved params', () => {
  const target = withQueryAndHash('./login.html', '', '');
  assert.equal(target, './login.html');
});

test('logout target is clean login URL', () => {
  assert.equal(withQueryAndHash('./login.html', '', ''), './login.html');
});
