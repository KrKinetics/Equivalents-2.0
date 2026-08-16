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
import { formatCoachDateTime } from '../../src/coach/motivation/lib/report-timestamp.mjs';
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

test('web timestamps use America/Toronto and match the shared formatter', () => {
  const submittedAt = '2026-08-16T19:55:00.000Z';
  const analyzedAt = '2026-08-16T20:38:00.000Z';
  assert.match(formatCoachDateTime(submittedAt), /15 h 55/);
  assert.match(formatCoachDateTime(analyzedAt), /16 h 38/);
  assert.doesNotMatch(formatCoachDateTime(submittedAt), /19 h 55/);
  const html = buildMotivationReportMarkup(buildMotivationReportViewModel({
    report: { schemaVersion: REPORT_MODEL_V42 },
    clientName: 'Client test KR',
    submittedAt,
    analyzedAt,
  }));
  assert.match(html, /15 h 55/);
  assert.match(html, /16 h 38/);
  assert.doesNotMatch(html, /19 h 55|20 h 38/);
  const src = fs.readFileSync(
    path.join(root, 'src/coach/motivation/report/build-motivation-report-html.mjs'),
    'utf8',
  );
  assert.match(src, /formatCoachDateTime/);
});

test('vigilance keeps findings only and never injects validationQuestion', () => {
  const validation = 'Lorsque vous parlez d’un manque de planification, la difficulté concerne-t-elle surtout la préparation?';
  const interview = 'Quelle version minimale seriez-vous prêt à faire après une semaine difficile?';
  const snapshot = {
    schemaVersion: REPORT_MODEL_V42,
    initialPlan: {
      mainRisks: ['Risque d’abandon après une semaine chargée.'],
      priorityInterviewQuestions: [interview],
      nutritionApproach: 'Approche flexible déjà décrite.',
    },
    findings: [{ title: 'Constat de reprise fragile.', validationQuestion: validation }],
    conflicts: [{
      message: 'Contradiction entre planification déclarée et calculée.',
      validationQuestion: validation,
    }],
    nutrition: {
      narrativeSections: [{ paragraphs: ['Approche flexible déjà décrite.'] }],
    },
  };
  const before = JSON.stringify(snapshot);
  const vm = buildMotivationReportViewModel({ report: snapshot, clientName: 'Client test KR' });
  assert.equal(JSON.stringify(snapshot), before);
  assert.ok(vm.vigilance.includes('Risque d’abandon après une semaine chargée.'));
  assert.ok(vm.vigilance.includes('Constat de reprise fragile.'));
  assert.ok(vm.vigilance.includes('Contradiction entre planification déclarée et calculée.'));
  assert.equal(vm.vigilance.some((item) => item === validation), false);
  assert.deepEqual(vm.interviewQuestions, [interview]);
  assert.equal(vm.interviewQuestions.includes(validation), false);
  assert.equal(vm.nutrition.lecture.includes('Approche flexible déjà décrite.'), false);
  assert.equal(vm.nutrition.structure, 'Approche flexible déjà décrite.');
  const html = buildMotivationReportMarkup(vm);
  const vigStart = html.indexOf('data-section="vigilance"');
  const vigNext = html.indexOf('data-section="', vigStart + 20);
  const vigHtml = html.slice(vigStart, vigNext === -1 ? undefined : vigNext);
  assert.doesNotMatch(vigHtml, /manque de planification/);
  assert.equal((html.match(/Approche flexible déjà décrite\./g) || []).length, 1);
});

test('nutrition subsection keeps only NUT_OBS_* obstacles and never generic OBS_*', () => {
  const snapshot = {
    schemaVersion: REPORT_MODEL_V42,
    declaredObstacles: [
      { rawLabel: 'horaire chargé', category: 'other' },
      { rawLabel: 'Manque de temps', category: 'other' },
    ],
    normalizedObstacles: [
      { normalizedLabel: 'horaire chargé', canonicalId: 'other_other' },
      { normalizedLabel: 'Manque de temps', canonicalId: 'other_other' },
    ],
    directAnswers: [
      { questionCode: 'OBS_01', questionText: 'Obstacles entraînement', displayValue: 'horaire chargé' },
      { questionCode: 'NUT_OBS_01', questionText: 'Obstacles alimentaires', displayValue: 'Manque de temps' },
    ],
    openAnswers: [
      { questionCode: 'OBS_01', originalAnswer: 'horaire chargé' },
    ],
    nutrition: {
      narrativeSections: [{ paragraphs: ['Lecture nutrition existante.'] }],
    },
    initialPlan: { nutritionApproach: 'Approche flexible.' },
  };
  const before = JSON.stringify(snapshot);
  const vm = buildMotivationReportViewModel({ report: snapshot, clientName: 'Client test KR' });
  assert.equal(JSON.stringify(snapshot), before);
  assert.ok(vm.nutrition);
  assert.ok(vm.nutrition.obstacles.includes('Manque de temps'));
  assert.equal(vm.nutrition.obstacles.some((item) => /horaire chargé/i.test(item)), false);
  const html = buildMotivationReportMarkup(vm);
  const start = html.indexOf('data-section="nutrition"');
  const next = html.indexOf('data-section="', start + 20);
  const nutritionHtml = html.slice(start, next === -1 ? undefined : next);
  assert.match(nutritionHtml, /Manque de temps/);
  assert.doesNotMatch(nutritionHtml, /horaire chargé/);

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
  const live = buildMotivationReportViewModel({ report: analyzed.report });
  assert.ok(live.nutrition?.obstacles.some((item) => /Manque de temps/i.test(item)));
  assert.equal(live.nutrition?.obstacles.some((item) => /horaire chargé/i.test(item)), false);
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
