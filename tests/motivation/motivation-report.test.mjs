import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { motivationReportOpenPath, MOTIVATION_REPORT_PATH } from '../../src/coach/motivation/report/motivation-report-path.mjs';
import {
  buildMotivationReportViewModel,
  publicMotivationReportMessage,
} from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { isProtectedPath } from '../../src/coach/security/portal-auth.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import { analyzeMotivationAssessment } from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('report path contains only client_id', () => {
  assert.equal(MOTIVATION_REPORT_PATH, '/motivation-report.html');
  assert.equal(
    motivationReportOpenPath(CLIENT_ID),
    `/motivation-report.html?client_id=${CLIENT_ID}`,
  );
  assert.doesNotMatch(motivationReportOpenPath(CLIENT_ID), /token|answers|snapshot/);
  assert.equal(motivationReportOpenPath('not-a-uuid'), MOTIVATION_REPORT_PATH);
});

test('report page is coach-only and never runs the official engine', () => {
  const html = fs.readFileSync(path.join(root, 'coach-portal/motivation-report.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'coach-portal/assets/motivation-report.js'), 'utf8');
  const middleware = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
  assert.equal(isProtectedPath('/motivation-report.html'), true);
  assert.equal(isProtectedPath('/assets/motivation-report.js'), true);
  assert.match(html, /Exporter PDF/);
  assert.match(html, /id="download-pdf"[^>]*hidden[^>]*disabled|id="download-pdf"[^>]*disabled[^>]*hidden/);
  assert.match(html, /id="retry-report"/);
  assert.match(html, /Analyse temporairement indisponible/);
  assert.match(js, /\/api\/coach-process-motivation-assessment/);
  assert.match(js, /\/api\/coach-motivation-pdf/);
  assert.match(js, /Préparation de l’analyse/);
  assert.match(js, /setPdfAvailable\(false\)/);
  assert.match(js, /Réessayer|retry-report/);
  assert.match(js, /analyzed_at/);
  assert.match(js, /submitted_at/);
  assert.match(js, /publicMotivationReportMessage\(data\?\.error\)/);
  assert.match(js, /publicMotivationReportMessage\('not_found'\)/);
  assert.doesNotMatch(js, /analyzedAt:\s*new Date\(/);
  assert.match(middleware, /'\/motivation-report\.html'/);
  assert.doesNotMatch(js, /analyzeMotivationAssessment|calculateDimensionScores|evaluateRuleset/);
  assert.doesNotMatch(js, /analysis_snapshot|p_analysis_snapshot/);
});

test('view-model only renders official snapshot sections that have data', () => {
  const empty = buildMotivationReportViewModel({ report: { schemaVersion: 'report-model-v4.2' } });
  assert.equal(empty.sections.some((section) => section.id === 'nutrition'), false);

  const vm = buildMotivationReportViewModel({
    clientName: 'Alex Test',
    analysisVersion: 1,
    submittedAt: '2026-08-16T17:00:00.000Z',
    provenance: {
      questionnaireVersion: QUESTIONNAIRE_V41,
      rulesetVersion: RULESET_V41,
      reportModelVersion: REPORT_MODEL_V42,
      contentHash: 'a'.repeat(64),
    },
    report: {
      schemaVersion: REPORT_MODEL_V42,
      initialPlan: {
        profileSummary: 'Portrait utile pour le coach.',
        preparationLabel: 'Préparation en développement',
        priorities: ['Clarifier l’objectif'],
      },
      probableStrengths: [{ title: 'Intérêt sportif' }],
      conflicts: [],
    },
  });
  assert.ok(vm.sections.some((section) => section.id === 'summary'));
  assert.ok(vm.sections.some((section) => section.id === 'strengths'));
  assert.equal(vm.sections.some((section) => section.id === 'conflicts'), false);
  const html = buildMotivationReportMarkup(vm, { logoSrc: './logo.png' });
  assert.match(html, /Alex Test/);
  assert.match(html, /Informations techniques/);
  assert.match(html, /questionnaire-v4\.1/);
  assert.doesNotMatch(html, /service_role|stack|SQL/);
});

test('official analyzed snapshot maps into the coach report without browser scoring', () => {
  const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE, {
    clientName: 'Alex Test',
    assessmentId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  });
  const analyzed = analyzeMotivationAssessment({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
    answers: submission.answers,
    presentedQuestionCodes: submission.presentedQuestionCodes,
    clientName: 'Alex Test',
  });
  const vm = buildMotivationReportViewModel({
    report: analyzed.report,
    clientName: 'Alex Test',
    analysisVersion: 1,
    provenance: analyzed.provenance,
  });
  assert.ok(vm.sections.length >= 4);
  assert.equal(vm.provenance.reportModelVersion, REPORT_MODEL_V42);
});

test('public report errors stay generic', () => {
  assert.equal(publicMotivationReportMessage('forbidden'), 'Accès refusé');
  assert.equal(publicMotivationReportMessage('not_found'), 'Client introuvable');
  assert.equal(publicMotivationReportMessage('not_submitted'), 'Questionnaire non soumis');
  assert.equal(publicMotivationReportMessage('hash_mismatch'), 'Version incompatible');
  assert.equal(publicMotivationReportMessage('unknown_engine'), 'Version incompatible');
  assert.equal(publicMotivationReportMessage('unavailable'), 'Analyse temporairement indisponible');
});

test('technical section shows server submission and analysis dates, not a browser clock', () => {
  const vm = buildMotivationReportViewModel({
    clientName: 'Alex Test',
    analysisVersion: 1,
    submittedAt: '2026-08-16T16:00:00.000Z',
    analyzedAt: '2026-08-16T16:05:00.000Z',
    provenance: {
      questionnaireVersion: QUESTIONNAIRE_V41,
      rulesetVersion: RULESET_V41,
      reportModelVersion: REPORT_MODEL_V42,
      contentHash: 'a'.repeat(64),
    },
    report: { schemaVersion: REPORT_MODEL_V42 },
  });
  assert.equal(vm.provenance.submittedAt, '2026-08-16T16:00:00.000Z');
  assert.equal(vm.provenance.analyzedAt, '2026-08-16T16:05:00.000Z');
  const html = buildMotivationReportMarkup(vm);
  assert.match(html, /Soumission/);
  assert.match(html, /Analyse/);
  const idempotent = buildMotivationReportViewModel({
    ...vm,
    analyzedAt: '2026-08-16T16:05:00.000Z',
  });
  assert.equal(idempotent.provenance.analyzedAt, vm.provenance.analyzedAt);
});

test('view-model stays display-only and never imports scoring or rules', () => {
  const src = fs.readFileSync(
    path.join(root, 'src/coach/motivation/report/motivation-report-view-model.mjs'),
    'utf8',
  );
  assert.match(src, /Never scores/);
  assert.doesNotMatch(src, /from ['"].*scoring/);
  assert.doesNotMatch(src, /from ['"].*rules/);
  assert.doesNotMatch(src, /analyzeMotivationAssessment|evaluateRuleset|calculateDimensionScores/);
});

test('coach report hierarchy uses existing snapshot values only', () => {
  const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE, {
    clientName: 'Client test KR',
    assessmentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
  const analyzed = analyzeMotivationAssessment({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
    answers: submission.answers,
    presentedQuestionCodes: submission.presentedQuestionCodes,
    clientName: 'Client test KR',
  });
  const sport = analyzed.report.sport?.scores || [];
  const nutrition = analyzed.report.nutrition?.scores || [];
  const source = sport.length || nutrition.length
    ? [...sport, ...nutrition]
    : analyzed.report.domainInterpretations || [];
  const vm = buildMotivationReportViewModel({
    report: analyzed.report,
    clientName: 'Client test KR',
    analysisVersion: 1,
    submittedAt: '2026-08-16T16:00:00.000Z',
    analyzedAt: '2026-08-16T16:05:00.000Z',
    provenance: analyzed.provenance,
  });
  assert.ok(vm.quickRead.length > 0 && vm.quickRead.length <= 4);
  assert.ok(vm.coachPriorities.length > 0 && vm.coachPriorities.length <= 5);
  assert.equal(vm.dimensions.length, source.length);
  for (const [index, row] of vm.dimensions.entries()) {
    const expected = source[index].score ?? source[index].technicalScore;
    assert.equal(row.score, expected);
  }
  const html = buildMotivationReportMarkup(vm, {
    logoSrc: './assets/logo-kr-kinetics-horizontal.png',
  });
  assert.match(html, /logo-kr-kinetics-horizontal\.png/);
  assert.match(html, /data-section="quick-read"/);
  assert.match(html, /data-section="priorities"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /Verbatim client|verbatim client/i);
  const firstScore = vm.dimensions.find((row) => row.score != null);
  if (firstScore) {
    assert.match(html, new RegExp(`aria-valuenow="${String(firstScore.score).replace('.', '\\.')}"`));
  }
  const order = [
    'hero',
    'quick-read',
    'summary',
    'priorities',
    'vigilance',
    'interview',
    'dimensions',
    'four-week-plan',
    'verbatims',
    'technical',
  ];
  let last = -1;
  for (const id of order) {
    const idx = html.indexOf(`data-section="${id}"`);
    if (idx === -1) continue;
    assert.ok(idx > last, id);
    last = idx;
  }
  assert.ok(html.indexOf('data-section="technical"') > html.indexOf('data-section="dimensions"'));
  const duped = buildMotivationReportViewModel({
    report: {
      schemaVersion: REPORT_MODEL_V42,
      initialPlan: {
        priorities: [
          'Définir ce que signifie « qualité » alimentaire.',
          'Définir ce que signifie « qualité » alimentaire.',
          'Clarifier l’horaire.',
        ],
      },
    },
  });
  assert.deepEqual(duped.coachPriorities, [
    'Définir ce que signifie « qualité » alimentaire.',
    'Clarifier l’horaire.',
  ]);
});

test('process API maps not_submitted to 409 and exposes analyzed_at', () => {
  const { motivationProcessHttpStatus } = require(path.join(root, 'api/coach-motivation.js'));
  const api = fs.readFileSync(path.join(root, 'api/coach-motivation.js'), 'utf8');
  assert.equal(motivationProcessHttpStatus('forbidden'), 403);
  assert.equal(motivationProcessHttpStatus('not_found'), 404);
  assert.equal(motivationProcessHttpStatus('not_submitted'), 409);
  assert.match(api, /analyzed_at:\s*result\.createdAt/);
  assert.match(api, /submitted_at:\s*result\.submittedAt/);
});
