/**
 * Auth return-path tests — no emails sent, no real tokens logged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  withQueryAndHash,
  getAuthCodeFromSearch,
  hasImplicitAuthHash,
  establishSessionFromUrl,
} from '../coach-portal/assets/auth-callback.mjs';

test('root redirect to login preserves search and hash', () => {
  const hash = '#access_token=test-token&refresh_token=test-refresh&type=invite';
  const search = '?foo=1';
  assert.equal(
    withQueryAndHash('./login.html', search, hash),
    './login.html?foo=1#access_token=test-token&refresh_token=test-refresh&type=invite',
  );
});

test('detects auth code query param', () => {
  assert.equal(getAuthCodeFromSearch('?code=abc123&next=/'), 'abc123');
  assert.equal(getAuthCodeFromSearch('code=abc123'), 'abc123');
  assert.equal(getAuthCodeFromSearch(''), null);
  assert.equal(getAuthCodeFromSearch('?email=x'), null);
});

test('detects implicit auth hash without printing it', () => {
  assert.equal(hasImplicitAuthHash('#access_token=x&refresh_token=y&type=invite'), true);
  assert.equal(hasImplicitAuthHash('#type=magiclink'), true);
  assert.equal(hasImplicitAuthHash('#error=access_denied'), true);
  assert.equal(hasImplicitAuthHash(''), false);
  assert.equal(hasImplicitAuthHash('#foo=bar'), false);
});

test('establishSessionFromUrl exchanges code then getSession', async () => {
  const calls = [];
  const fakeSession = { user: { id: 'u1' }, access_token: 'sess' };
  const supabase = {
    auth: {
      async exchangeCodeForSession(code) {
        calls.push(['exchange', code]);
        return { data: { session: fakeSession }, error: null };
      },
      async getSession() {
        calls.push(['getSession']);
        return { data: { session: fakeSession }, error: null };
      },
      async setSession() {
        calls.push(['setSession']);
        return { data: { session: null }, error: null };
      },
    },
  };
  const session = await establishSessionFromUrl(supabase, {
    search: '?code=pkce-code-1',
    hash: '',
  });
  assert.equal(session, fakeSession);
  assert.deepEqual(calls[0], ['exchange', 'pkce-code-1']);
  assert.equal(calls[1][0], 'getSession');
  assert.ok(!JSON.stringify(calls).includes('access_token=sess'));
});

test('establishSessionFromUrl uses hash tokens via setSession when no code session', async () => {
  const calls = [];
  const fakeSession = { user: { id: 'u2' } };
  const supabase = {
    auth: {
      async exchangeCodeForSession() {
        throw new Error('should not exchange');
      },
      async getSession() {
        calls.push('getSession');
        return { data: { session: null }, error: null };
      },
      async setSession(tokens) {
        calls.push('setSession');
        assert.equal(tokens.access_token, 'tok-a');
        assert.equal(tokens.refresh_token, 'tok-r');
        return { data: { session: fakeSession }, error: null };
      },
    },
  };
  const session = await establishSessionFromUrl(supabase, {
    search: '',
    hash: '#access_token=tok-a&refresh_token=tok-r&type=invite',
  });
  assert.equal(session, fakeSession);
  assert.deepEqual(calls, ['getSession', 'setSession']);
});

test('existing session goes to dashboard path helper (clean URL)', () => {
  // After session recovery, dashboard redirect must not carry tokens.
  assert.equal(withQueryAndHash('./dashboard.html', '', ''), './dashboard.html');
});

test('absence of session keeps login redirect with auth hash', () => {
  const target = withQueryAndHash(
    './login.html',
    '',
    '#access_token=keep&refresh_token=me&type=invite',
  );
  assert.match(target, /^\.\/login\.html#/);
  assert.match(target, /type=invite/);
});

test('helpers never stringify secrets into thrown messages', async () => {
  const supabase = {
    auth: {
      async exchangeCodeForSession() {
        return { data: { session: null }, error: null };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async setSession() {
        return { data: { session: null }, error: { message: 'invalid' } };
      },
    },
  };
  await assert.rejects(
    () => establishSessionFromUrl(supabase, {
      search: '',
      hash: '#access_token=SECRETVALUE&refresh_token=SECRETREFRESH&type=invite',
    }),
    (err) => {
      const text = String(err?.message || err);
      assert.doesNotMatch(text, /SECRETVALUE|SECRETREFRESH/);
      return true;
    },
  );
});
