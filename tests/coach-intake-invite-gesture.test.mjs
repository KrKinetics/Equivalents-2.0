/**
 * Regression: dashboard invite-send success must not be rewritten as failure
 * when a subsequent client-list refresh throws.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTAKE_REFRESH_FAILURE_NOTICE,
  INTAKE_SEND_FAILURE_STATUS,
  composeRefreshFailureStatus,
  runIntakeInviteButtonAction,
  runIntakeInviteGesture,
} from '../src/coach/client/intake-invite-gesture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardJs = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');

const SENT_STATUS = 'Invitation envoyée à preview-qa@example.test.';
const FALLBACK_STATUS = 'Le lien a été créé, mais le courriel n’a pas pu être envoyé.';
const FALLBACK_URL = 'https://example.test/intake.html?token=opaque-test-token';

function harness() {
  let status = '';
  let kind = '';
  let posts = 0;
  let copies = 0;
  let refreshes = 0;
  let buttonRestored = false;
  const inFlight = new Set();
  return {
    status: () => status,
    kind: () => kind,
    posts: () => posts,
    copies: () => copies,
    refreshes: () => refreshes,
    inFlight,
    setStatus(message, nextKind = '') {
      status = message;
      kind = nextKind;
    },
    getStatus() {
      return status;
    },
    countPost() {
      posts += 1;
    },
    applyResult(result) {
      if (result?.email_sent === true) {
        const to = typeof result.recipient_email === 'string' ? result.recipient_email : '';
        status = to ? `Invitation envoyée à ${to}.` : 'Invitation envoyée.';
        kind = 'ok';
        return;
      }
      if (result?.invite_url) copies += 1;
      if (
        result?.email_delivery === 'skipped_missing_email'
        || result?.email_delivery === 'skipped_invalid_email'
      ) {
        status = 'Aucun courriel valide n’est enregistré pour ce client. Le lien a été créé — copiez-le manuellement.';
        kind = 'error';
        return;
      }
      status = FALLBACK_STATUS;
      kind = 'error';
    },
    restoreButton() {
      buttonRestored = true;
    },
    buttonRestored: () => buttonRestored,
  };
}

test('CASE 1 — email sent remains authoritative when refresh throws', async () => {
  const h = harness();
  const result = {
    invite_created: true,
    email_sent: true,
    email_delivery: 'sent',
    recipient_email: 'preview-qa@example.test',
  };
  const outcome = await runIntakeInviteButtonAction({
    clientId: 'client-1',
    inFlight: h.inFlight,
    send: async () => {
      h.countPost();
      return result;
    },
    applyResult: (payload) => h.applyResult(payload),
    refresh: async () => {
      throw new Error('refresh failed');
    },
    setStatus: (message, kind) => h.setStatus(message, kind),
    getStatus: () => h.getStatus(),
  });
  h.restoreButton();
  assert.equal(outcome.committed, true);
  assert.equal(outcome.refreshed, false);
  assert.equal(h.posts(), 1);
  assert.equal(h.copies(), 0);
  assert.match(h.status(), /Invitation envoyée à preview-qa@example\.test/);
  assert.match(h.status(), new RegExp(INTAKE_REFRESH_FAILURE_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(h.status(), /Création du lien refusée/);
  assert.equal(h.kind(), 'ok');
  assert.equal(h.inFlight.has('client-1'), false);
  assert.equal(h.buttonRestored(), true);
});

test('CASE 2 — HTTP send failure never claims success and does not retry', async () => {
  const h = harness();
  const outcome = await runIntakeInviteButtonAction({
    clientId: 'client-1',
    inFlight: h.inFlight,
    send: async () => {
      h.countPost();
      throw new Error('Création du lien refusée.');
    },
    applyResult: (payload) => h.applyResult(payload),
    refresh: async () => {
      throw new Error('refresh must not run after send failure');
    },
    setStatus: (message, kind) => h.setStatus(message, kind),
    getStatus: () => h.getStatus(),
  });
  assert.equal(outcome.committed, false);
  assert.equal(h.posts(), 1);
  assert.equal(h.status(), INTAKE_SEND_FAILURE_STATUS);
  assert.equal(h.kind(), 'error');
  assert.doesNotMatch(h.status(), /Invitation envoyée/);
  assert.equal(h.copies(), 0);
});

test('CASE 3 — fallback invite_url stays authoritative when refresh throws', async () => {
  const h = harness();
  const result = {
    invite_created: true,
    email_sent: false,
    email_delivery: 'failed',
    invite_url: FALLBACK_URL,
    recipient_email: 'preview-qa@example.test',
  };
  const outcome = await runIntakeInviteButtonAction({
    clientId: 'client-1',
    inFlight: h.inFlight,
    send: async () => {
      h.countPost();
      return result;
    },
    applyResult: (payload) => h.applyResult(payload),
    refresh: async () => {
      throw new Error('refresh failed');
    },
    setStatus: (message, kind) => h.setStatus(message, kind),
    getStatus: () => h.getStatus(),
  });
  assert.equal(outcome.committed, true);
  assert.equal(outcome.refreshed, false);
  assert.equal(h.posts(), 1);
  assert.equal(h.copies(), 1);
  assert.equal(h.status().startsWith(FALLBACK_STATUS), true);
  assert.match(h.status(), new RegExp(INTAKE_REFRESH_FAILURE_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(h.status(), /Création du lien refusée/);
  assert.equal(h.kind(), 'error');
});

test('CASE 4 — normal success + refresh leaves sent status unchanged', async () => {
  const h = harness();
  let refreshed = false;
  const result = {
    invite_created: true,
    email_sent: true,
    email_delivery: 'sent',
    recipient_email: 'preview-qa@example.test',
  };
  const outcome = await runIntakeInviteButtonAction({
    clientId: 'client-1',
    inFlight: h.inFlight,
    send: async () => {
      h.countPost();
      return result;
    },
    applyResult: (payload) => h.applyResult(payload),
    refresh: async () => {
      refreshed = true;
    },
    setStatus: (message, kind) => h.setStatus(message, kind),
    getStatus: () => h.getStatus(),
  });
  assert.equal(outcome.committed, true);
  assert.equal(outcome.refreshed, true);
  assert.equal(refreshed, true);
  assert.equal(h.posts(), 1);
  assert.equal(h.copies(), 0);
  assert.equal(h.status(), SENT_STATUS);
  assert.equal(h.kind(), 'ok');
  assert.doesNotMatch(h.status(), new RegExp(INTAKE_REFRESH_FAILURE_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('one POST per gesture: in-flight second call is skipped', async () => {
  const h = harness();
  let releaseSend;
  const sendStarted = new Promise((resolve) => {
    releaseSend = resolve;
  });
  const first = runIntakeInviteButtonAction({
    clientId: 'client-1',
    inFlight: h.inFlight,
    send: async () => {
      h.countPost();
      await sendStarted;
      return { email_sent: true, recipient_email: 'preview-qa@example.test' };
    },
    applyResult: (payload) => h.applyResult(payload),
    refresh: async () => {},
    setStatus: (message, kind) => h.setStatus(message, kind),
    getStatus: () => h.getStatus(),
  });
  const second = await runIntakeInviteButtonAction({
    clientId: 'client-1',
    inFlight: h.inFlight,
    send: async () => {
      h.countPost();
      return { email_sent: true };
    },
    applyResult: (payload) => h.applyResult(payload),
    refresh: async () => {},
    setStatus: (message, kind) => h.setStatus(message, kind),
    getStatus: () => h.getStatus(),
  });
  assert.equal(second.skipped, true);
  releaseSend();
  await first;
  assert.equal(h.posts(), 1);
});

test('composeRefreshFailureStatus never introduces send-failure copy', () => {
  const combined = composeRefreshFailureStatus(SENT_STATUS);
  assert.match(combined, /Invitation envoyée/);
  assert.doesNotMatch(combined, /Création du lien refusée/);
  assert.equal(composeRefreshFailureStatus(combined), combined);
});

test('dashboard wires send and refresh on isolated failure boundaries', () => {
  assert.match(dashboardJs, /runIntakeInviteButtonAction/);
  assert.match(dashboardJs, /\/src\/coach\/client\/intake-invite-gesture\.mjs/);
  assert.match(dashboardJs, /send: \(\) => sendIntakeInvite\(id\)/);
  assert.match(dashboardJs, /refresh: loadClients/);
  assert.match(dashboardJs, /applyResult: applyInviteResult/);
  assert.match(dashboardJs, /intakeInFlight/);
  assert.doesNotMatch(
    dashboardJs,
    /const result = await sendIntakeInvite\(id\);\s*await loadClients\(\);\s*applyInviteResult\(result\);/,
  );
  assert.match(dashboardJs, /if \(result\?\.email_sent === true\)/);
  assert.match(dashboardJs, /if \(result\?\.invite_url\) \{\r?\n\s*await copyText\(result\.invite_url\);/);
});
