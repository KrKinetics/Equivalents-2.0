import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  assert.match(js, /\/api\/coach-process-motivation-assessment/);
  assert.match(js, /\/api\/coach-motivation-pdf/);
  assert.match(js, /Préparation de l’analyse/);
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
