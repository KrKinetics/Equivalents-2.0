import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'coach-portal/motivation.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'coach-portal/assets/motivation.js'), 'utf8');
const qaHtml = fs.readFileSync(path.join(root, 'coach-portal/motivation-qa.html'), 'utf8');
const qaJs = fs.readFileSync(path.join(root, 'coach-portal/assets/motivation-qa.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');

test('public motivation page is KR Kinetics branded and token-gated', () => {
  assert.match(html, /Profil motivationnel/);
  assert.match(html, /logo-kr-kinetics-horizontal/);
  assert.match(html, /id="consent"/);
  assert.match(html, /pas un diagnostic médical/);
  assert.match(js, /get_client_motivation/);
  assert.match(js, /save_client_motivation/);
  assert.match(js, /submit_client_motivation/);
  assert.match(js, /assertOfficialMotivationBundle/);
  assert.match(js, /p_consent_given: true/);
  assert.doesNotMatch(js, /analyzeMotivationAssessment|analysis_snapshot|persist_client_motivation_analysis/);
  assert.doesNotMatch(js, /p_analysis_snapshot|scoring|ruleset/);
});

test('expired or incompatible links fail closed in the public page', () => {
  assert.match(js, /incompatible|n’est plus compatible|nouveau lien/);
  assert.match(js, /Le lien est invalide, expiré ou a été remplacé/);
  assert.match(js, /invite_status === 'submitted'/);
});

test('QA tool is coach-only preview and can process official analysis', () => {
  const middleware = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
  assert.match(qaHtml, /QA — Profil motivationnel/);
  assert.match(qaJs, /previewTools/);
  assert.match(qaJs, /\/api\/coach-send-motivation-invite/);
  assert.match(qaJs, /\/api\/coach-process-motivation-assessment/);
  assert.match(qaJs, /is_fictional/);
  assert.doesNotMatch(qaJs, /SUPABASE_SERVICE_ROLE|service_role/);
  assert.match(middleware, /'\/motivation-qa\.html'/);
  assert.match(middleware, /'\/assets\/motivation-qa\.js'/);
});

test('dashboard Profil motivationnel replaces the habits placeholder', () => {
  assert.match(dashboardJs, /Profil motivationnel/);
  assert.match(dashboardJs, /coach-send-motivation-invite/);
  assert.doesNotMatch(dashboardJs, /Questionnaire d’habitudes/);
  assert.doesNotMatch(dashboardJs, /À venir/);
  assert.doesNotMatch(dashboardJs, /motivation-qa/);
});
