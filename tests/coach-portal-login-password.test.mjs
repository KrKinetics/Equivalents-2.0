/**
 * Password login wiring — mocked Supabase client (no live auth, no emails).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_SUCCESS_MESSAGE,
  buildSignInWithPasswordPayload,
  formatPasswordLoginFailure,
  signInWithPassword,
} from '../coach-portal/assets/login-password.mjs';
import {
  buildSignInWithOtpPayload,
  requestMagicLink,
} from '../coach-portal/assets/login-otp.mjs';

test('signInWithPassword called once with email and password', async () => {
  const calls = [];
  const supabase = {
    auth: {
      async signInWithPassword(payload) {
        calls.push(payload);
        return {
          data: { session: { user: { id: 'u-kr' } } },
          error: null,
        };
      },
    },
  };
  const session = await signInWithPassword(supabase, 'kr@example.com', 'secret');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { email: 'kr@example.com', password: 'secret' });
  assert.equal(session.user.id, 'u-kr');
});

test('payload builder matches expected password shape', () => {
  assert.deepEqual(
    buildSignInWithPasswordPayload('a@b.c', 'pw'),
    { email: 'a@b.c', password: 'pw' },
  );
});

test('wrong password is refused with explicit message', async () => {
  const supabase = {
    auth: {
      async signInWithPassword() {
        return { data: { session: null }, error: Object.assign(new Error('Invalid login credentials'), { status: 400 }) };
      },
    },
  };
  await assert.rejects(() => signInWithPassword(supabase, 'kr@example.com', 'bad'), /Invalid login credentials/i);
  const formatted = formatPasswordLoginFailure(
    Object.assign(new Error('Invalid login credentials'), { status: 400 }),
  );
  assert.equal(formatted.kind, 'invalid');
  assert.match(formatted.message, /Connexion impossible/i);
});

test('unknown / unauthorized account shares anti-enumeration copy', () => {
  const formatted = formatPasswordLoginFailure(new Error('Signups not allowed for otp'));
  assert.equal(formatted.kind, 'invalid');
  assert.match(formatted.message, /Connexion impossible/i);
});

test('unconfirmed account shares anti-enumeration copy', () => {
  const formatted = formatPasswordLoginFailure(new Error('Email not confirmed'));
  assert.equal(formatted.kind, 'unconfirmed');
  assert.match(formatted.message, /Connexion impossible/i);
});

test('success message is explicit', () => {
  assert.match(PASSWORD_SUCCESS_MESSAGE, /Connexion réussie/i);
});

test('no automatic user creation helpers in password path', () => {
  const payload = buildSignInWithPasswordPayload('x@y.z', 'pw');
  assert.equal('options' in payload, false);
  assert.equal(JSON.stringify(payload).includes('signUp'), false);
  assert.equal(JSON.stringify(payload).includes('shouldCreateUser'), false);
});

test('Magic Link remains secondary path with shouldCreateUser false', async () => {
  const otp = buildSignInWithOtpPayload('coach@example.com', 'http://127.0.0.1:4190/');
  assert.equal(otp.options.shouldCreateUser, false);

  const calls = [];
  const supabase = {
    auth: {
      async signInWithOtp(payload) {
        calls.push(payload);
        return { data: {}, error: null };
      },
      async signInWithPassword() {
        throw new Error('password path must not run in this test');
      },
    },
  };
  await requestMagicLink(supabase, 'coach@example.com', 'http://127.0.0.1:4190/');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.shouldCreateUser, false);
});

test('helpers never stringify secrets into thrown messages', () => {
  const secret = 'super-secret-password-value';
  const formatted = formatPasswordLoginFailure(new Error('Invalid login credentials'));
  assert.equal(JSON.stringify(formatted).includes(secret), false);
  assert.equal(JSON.stringify(buildSignInWithPasswordPayload('a@b.c', secret)).includes('service_role'), false);
});
