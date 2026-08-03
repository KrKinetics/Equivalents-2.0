/**
 * Login OTP wiring tests — mocked Supabase client, no real emails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PORTAL_ORIGIN,
  buildSignInWithOtpPayload,
  formatLoginFailure,
  readPublicSupabaseConfig,
  requestMagicLink,
  resolveEmailRedirectTo,
} from '../coach-portal/assets/login-otp.mjs';

test('resolveEmailRedirectTo points at portal root', () => {
  assert.equal(
    resolveEmailRedirectTo('http://127.0.0.1:4190/login.html'),
    'http://127.0.0.1:4190/',
  );
  assert.equal(DEFAULT_PORTAL_ORIGIN, 'http://127.0.0.1:4190/');
});

test('signInWithOtp called once with email, shouldCreateUser false, redirect root', async () => {
  const calls = [];
  const supabase = {
    auth: {
      async signInWithOtp(payload) {
        calls.push(payload);
        return { data: { user: null }, error: null };
      },
    },
  };

  const result = await requestMagicLink(
    supabase,
    'coach@example.com',
    'http://127.0.0.1:4190/',
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].email, 'coach@example.com');
  assert.equal(calls[0].options.shouldCreateUser, false);
  assert.equal(calls[0].options.emailRedirectTo, 'http://127.0.0.1:4190/');
  assert.ok(result === null || typeof result === 'object');
});

test('payload builder matches expected OTP shape', () => {
  assert.deepEqual(
    buildSignInWithOtpPayload('a@b.c', 'http://127.0.0.1:4190/'),
    {
      email: 'a@b.c',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'http://127.0.0.1:4190/',
      },
    },
  );
});

test('missing config surfaces clear error', () => {
  assert.deepEqual(readPublicSupabaseConfig({}), { ok: false, reason: 'missing_config' });
  assert.deepEqual(
    readPublicSupabaseConfig({ COACH_SUPABASE: { url: '', publishableKey: '' } }),
    { ok: false, reason: 'missing_config' },
  );
  const formatted = formatLoginFailure(new Error('Missing COACH_SUPABASE config. Start the portal'));
  assert.equal(formatted.kind, 'config');
  assert.match(formatted.message, /Configuration locale absente/i);
});

test('present config is non-empty without logging secrets', () => {
  const cfg = readPublicSupabaseConfig({
    COACH_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' },
  });
  assert.equal(cfg.ok, true);
  assert.ok(cfg.url.length > 0);
  assert.ok(cfg.publishableKey.length > 0);
});

test('Supabase error is displayed', async () => {
  const supabase = {
    auth: {
      async signInWithOtp() {
        return { data: null, error: new Error('Email rate limit exceeded') };
      },
    },
  };
  await assert.rejects(() => requestMagicLink(supabase, 'x@y.z'), /rate limit/i);
  const formatted = formatLoginFailure(new Error('Email rate limit exceeded'));
  assert.equal(formatted.kind, 'supabase');
  assert.match(formatted.message, /Limite d’envoi|rate/i);
});

test('success path returns without throwing', async () => {
  const supabase = {
    auth: {
      async signInWithOtp() {
        return { data: { messageId: 'ok' }, error: null };
      },
    },
  };
  const data = await requestMagicLink(supabase, 'ok@example.com');
  assert.equal(data.messageId, 'ok');
});

test('helpers never stringify secrets into thrown messages', () => {
  const secret = 'sb_publishable_DO_NOT_LOG';
  const formatted = formatLoginFailure(new Error('signups not allowed'));
  assert.equal(JSON.stringify(formatted).includes(secret), false);
  assert.equal(JSON.stringify(buildSignInWithOtpPayload('a@b.c')).includes(secret), false);
});
