/**
 * Login redirect safety — would have caught login↔dashboard reload loops.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginLoginAutoRedirect,
  clearLoginAutoRedirectGuard,
  resolveSafeNextPath,
  shouldAutoRedirectAfterSessionRecover,
} from '../coach-portal/assets/login-redirect.mjs';
import { isProtectedPath, isPublicPath } from '../src/coach/security/portal-auth.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('resolveSafeNextPath allows workspace and dashboard only', () => {
  assert.equal(resolveSafeNextPath(''), './dashboard.html');
  assert.equal(resolveSafeNextPath('?next=/dashboard.html'), '/dashboard.html');
  assert.equal(
    resolveSafeNextPath('?next=/workspace/?client_id=abc'),
    '/workspace/?client_id=abc',
  );
});

test('resolveSafeNextPath refuses login.html and open redirects', () => {
  assert.equal(resolveSafeNextPath('?next=/login.html'), './dashboard.html');
  assert.equal(resolveSafeNextPath('?next=/login.html?x=1'), './dashboard.html');
  assert.equal(resolveSafeNextPath('?next=//evil.example'), './dashboard.html');
  assert.equal(resolveSafeNextPath('?next=https://evil.example/'), './dashboard.html');
  assert.equal(resolveSafeNextPath('?next=/index.html'), './dashboard.html');
  assert.equal(resolveSafeNextPath('?next=/api/session'), './dashboard.html');
});

test('auto-redirect requires session + cookie sync + guard slot', () => {
  assert.equal(shouldAutoRedirectAfterSessionRecover({
    hasSession: true,
    cookieSynced: true,
    allowRedirect: true,
  }), true);
  assert.equal(shouldAutoRedirectAfterSessionRecover({
    hasSession: true,
    cookieSynced: false,
    allowRedirect: true,
  }), false);
  assert.equal(shouldAutoRedirectAfterSessionRecover({
    hasSession: false,
    cookieSynced: true,
    allowRedirect: true,
  }), false);
  assert.equal(shouldAutoRedirectAfterSessionRecover({
    hasSession: true,
    cookieSynced: true,
    allowRedirect: false,
  }), false);
});

test('beginLoginAutoRedirect allows one hop then blocks the loop', () => {
  const storage = memoryStorage();
  const t0 = 1_000_000;
  assert.equal(beginLoginAutoRedirect(storage, t0), true);
  assert.equal(beginLoginAutoRedirect(storage, t0 + 100), false);
  // After block, guard is cleared — a later intentional login can proceed.
  assert.equal(beginLoginAutoRedirect(storage, t0 + 200), true);
});

test('clearLoginAutoRedirectGuard resets loop state', () => {
  const storage = memoryStorage();
  assert.equal(beginLoginAutoRedirect(storage, 50), true);
  clearLoginAutoRedirectGuard(storage);
  assert.equal(beginLoginAutoRedirect(storage, 60), true);
});

test('login.html is public; middleware may match it for CSP but must not auth-gate it', () => {
  assert.equal(isPublicPath('/login.html'), true);
  assert.equal(isProtectedPath('/login.html'), false);
  assert.equal(isProtectedPath('/assets/login.js'), false);
  assert.equal(isProtectedPath('/config.js'), false);
  assert.equal(isProtectedPath('/assets/login-redirect.mjs'), false);

  const mw = fs.readFileSync(path.join(ROOT, 'middleware.js'), 'utf8');
  assert.match(mw, /matcher:\s*\[/);
  // login.html is in the matcher for enforced CSP headers only.
  assert.match(mw, /'\/login\.html'/);
  // Auth gate must skip login — public branch returns next() before verifyToken.
  const publicGateIdx = mw.indexOf("pathname === '/login.html'");
  const verifyIdx = mw.indexOf('await verifyToken(token)');
  assert.ok(publicGateIdx > 0, 'login.html public gate present');
  assert.ok(verifyIdx > publicGateIdx, 'verifyToken runs only after public login gate');
});

test('login boot never reloads on auth events alone', () => {
  const loginJs = fs.readFileSync(path.join(ROOT, 'coach-portal/assets/login.js'), 'utf8');
  const authSession = fs.readFileSync(path.join(ROOT, 'coach-portal/assets/auth-session.js'), 'utf8');
  assert.match(loginJs, /redirectAfterAuthenticatedSession/);
  assert.match(loginJs, /shouldAutoRedirectAfterSessionRecover/);
  assert.match(authSession, /never reload from auth events/i);
  assert.doesNotMatch(loginJs, /location\.reload\s*\(/);
  // onAuthStateChange body must not navigate — only cookie sync helpers.
  const listener = authSession.match(/onAuthStateChange\(\(event, session\) => \{([\s\S]*?)\}\);/)?.[1] || '';
  assert.doesNotMatch(listener, /location\.(reload|assign|replace)\s*\(/);
  assert.doesNotMatch(listener, /redirectClean|redirectPreserving/);
});

test('supabase client is a singleton (single auth listener surface)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'coach-portal/assets/supabase-client.js'), 'utf8');
  assert.match(src, /clientSingleton/);
  assert.match(src, /if \(clientSingleton\) return clientSingleton/);
});
