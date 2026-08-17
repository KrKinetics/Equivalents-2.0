import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOTIVATION_RESEND_OPENED_CONFIRMATION,
  latestMotivationInviteByClient,
  motivationActionLabel,
  resolveMotivationInviteStatus,
} from '../../src/coach/client/motivation-dashboard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboardJs = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NOW = new Date('2026-08-16T18:00:00.000Z');

test('no invite shows Aucun lien and Envoyer le lien', () => {
  const status = resolveMotivationInviteStatus(null, NOW);
  assert.equal(status.key, 'none');
  assert.equal(status.label, 'Aucun lien');
  assert.equal(status.action, 'send');
  assert.equal(status.showReport, false);
  assert.equal(motivationActionLabel({ email: 'alex@example.com' }, status), 'Envoyer le lien');
});

test('pending invite shows Lien non ouvert', () => {
  const status = resolveMotivationInviteStatus({
    status: 'pending',
    created_at: '2026-08-16T12:00:00.000Z',
    expires_at: '2026-08-30T12:00:00.000Z',
  }, NOW);
  assert.equal(status.key, 'pending');
  assert.equal(status.label, 'Lien non ouvert');
  assert.equal(status.action, 'resend');
  assert.equal(status.confirmReplace, false);
});

test('opened invite shows En cours and requires replacement confirmation', () => {
  const status = resolveMotivationInviteStatus({
    status: 'opened',
    opened_at: '2026-08-16T15:00:00.000Z',
    created_at: '2026-08-16T12:00:00.000Z',
    expires_at: '2026-08-30T12:00:00.000Z',
  }, NOW);
  assert.equal(status.key, 'opened');
  assert.equal(status.label, 'En cours');
  assert.equal(status.confirmReplace, true);
  assert.match(MOTIVATION_RESEND_OPENED_CONFIRMATION, /remplacera le lien actuel/);
  assert.match(MOTIVATION_RESEND_OPENED_CONFIRMATION, /ne pourra plus être poursuivie/);
});

test('expired invite shows Expiré', () => {
  const status = resolveMotivationInviteStatus({
    status: 'pending',
    expires_at: '2026-08-01T12:00:00.000Z',
    created_at: '2026-07-15T12:00:00.000Z',
  }, NOW);
  assert.equal(status.key, 'expired');
  assert.equal(status.label, 'Expiré');
  assert.equal(status.action, 'send');
});

test('submitted invite shows Soumis and Ouvrir le rapport only', () => {
  const status = resolveMotivationInviteStatus({
    status: 'submitted',
    submitted_at: '2026-08-16T17:00:00.000Z',
    expires_at: '2026-08-01T12:00:00.000Z',
  }, NOW);
  assert.equal(status.key, 'submitted');
  assert.equal(status.label, 'Soumis');
  assert.equal(status.action, 'none');
  assert.equal(status.showReport, true);
  assert.equal(motivationActionLabel({ email: 'alex@example.com' }, status), '');
});

test('A: newer pending is the reference over an older revoked', () => {
  const map = latestMotivationInviteByClient([
    { client_id: CLIENT_A, status: 'pending', created_at: '2026-08-16T16:00:00.000Z' },
    { client_id: CLIENT_A, status: 'revoked', created_at: '2026-08-16T15:00:00.000Z' },
  ]);
  assert.equal(map.get(CLIENT_A).status, 'pending');
  assert.equal(map.get(CLIENT_A).created_at, '2026-08-16T16:00:00.000Z');
});

test('B: newer revoked is the reference and does not resurrect an older pending', () => {
  const map = latestMotivationInviteByClient([
    { client_id: CLIENT_A, status: 'revoked', created_at: '2026-08-16T16:00:00.000Z' },
    { client_id: CLIENT_A, status: 'pending', created_at: '2026-08-16T15:00:00.000Z' },
  ]);
  assert.equal(map.get(CLIENT_A).status, 'revoked');
  assert.equal(map.get(CLIENT_A).created_at, '2026-08-16T16:00:00.000Z');
});

test('C: latest invite is isolated per client', () => {
  const map = latestMotivationInviteByClient([
    { client_id: CLIENT_A, status: 'pending', created_at: '2026-08-16T16:00:00.000Z' },
    { client_id: CLIENT_B, status: 'opened', created_at: '2026-08-16T16:00:00.000Z' },
    { client_id: CLIENT_A, status: 'revoked', created_at: '2026-08-16T15:00:00.000Z' },
    { client_id: CLIENT_B, status: 'submitted', created_at: '2026-08-16T14:00:00.000Z' },
  ]);
  assert.equal(map.get(CLIENT_A).status, 'pending');
  assert.equal(map.get(CLIENT_B).status, 'opened');
  assert.equal(map.size, 2);
});

test('dashboard wires motivation independently of intake and nutrition', () => {
  assert.match(dashboardJs, /client_motivation_invites/);
  assert.match(dashboardJs, /latestMotivationInviteByClient/);
  assert.match(dashboardJs, /\/api\/coach-send-motivation-invite/);
  assert.match(dashboardJs, /invite_token_fingerprint/);
  assert.match(dashboardJs, /jeton présent/);
  assert.match(dashboardJs, /data-group="motivation"/);
  assert.match(dashboardJs, /Profil motivationnel/);
  assert.match(dashboardJs, /btn-motivation-report/);
  assert.match(dashboardJs, /Ouvrir le rapport/);
  assert.match(dashboardJs, /MOTIVATION_RESEND_OPENED_CONFIRMATION/);
  assert.doesNotMatch(dashboardJs, /Questionnaire d’habitudes/);
  assert.doesNotMatch(dashboardJs, /À venir/);
  assert.doesNotMatch(dashboardJs, /analyzeMotivationAssessment|calculateDimensionScores/);
  assert.doesNotMatch(dashboardJs, /questionnaire_version|content_hash/);
  assert.match(dashboardJs, /Questionnaire d’entrevue/);
  assert.match(dashboardJs, /Structure alimentaire/);
  assert.match(dashboardJs, /\/api\/coach-send-intake-invite/);
  assert.doesNotMatch(dashboardJs, /clientHasNutritionAccess\(row\.service_type\)[\s\S]{0,80}btn-motivation/);
});
