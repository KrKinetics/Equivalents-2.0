import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUESTIONNAIRE_V43,
  REPORT_MODEL_V44,
  RULESET_V42,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import {
  V43_COHERENT,
  buildCompleteMotivationSubmissionV43,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { processSubmittedMotivationAssessment } from '../../src/coach/server/motivation/process-submitted-motivation.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { buildCanonicalClientIdentity } from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { presentPlanningLandmarksFromAnswers } from '../../src/coach/intake/planning-landmarks-view.mjs';
import { redactForLog } from '../../src/coach/server/http/redact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORG = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESPONSE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ANALYSIS_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ENGINE = resolveMotivationEngine({
  questionnaireVersion: QUESTIONNAIRE_V43,
  rulesetVersion: RULESET_V42,
  reportModelVersion: REPORT_MODEL_V44,
});
const SUBMISSION = buildCompleteMotivationSubmissionV43(V43_COHERENT, {
  assessmentId: RESPONSE_ID,
  clientId: CLIENT_ID,
  clientName: 'Client test KR',
});
const SAMPLE_ANSWERS = {
  age_years: '36',
  height_unit: 'imperial',
  height_feet: '5',
  height_inches: '9',
  weight_lb: '183',
};
const INTAKE_SUBMITTED_AT = '2026-08-10T12:00:00.000Z';
const MOTIVATION_SUBMITTED_AT = '2026-08-12T16:00:00.000Z';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function createFetchMock({ intakeRows = [], analyses = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/rest/v1/clients')) {
      return jsonResponse(200, [{
        id: CLIENT_ID,
        organization_id: ORG,
        full_name: 'Client test KR',
        email: 'client.test@example.com',
        phone: '5145550100',
        service_type: 'complete',
        is_fictional: false,
      }]);
    }
    if (u.includes('/rest/v1/client_motivation_invites')) {
      return jsonResponse(200, [{
        id: INVITE_ID,
        client_id: CLIENT_ID,
        organization_id: ORG,
        questionnaire_version: ENGINE.questionnaireVersion,
        ruleset_version: ENGINE.rulesetVersion,
        report_model_version: ENGINE.reportModelVersion,
        content_hash: ENGINE.contentHash,
        status: 'submitted',
        submitted_at: MOTIVATION_SUBMITTED_AT,
      }]);
    }
    if (u.includes('/rest/v1/client_motivation_responses')) {
      return jsonResponse(200, [{
        id: RESPONSE_ID,
        invite_id: INVITE_ID,
        client_id: CLIENT_ID,
        organization_id: ORG,
        status: 'submitted',
        answers: SUBMISSION.answers,
        presented_question_codes: SUBMISSION.presentedQuestionCodes,
        consent_given: true,
        submitted_at: MOTIVATION_SUBMITTED_AT,
      }]);
    }
    if (u.includes('/rest/v1/client_motivation_analysis_versions')) {
      return jsonResponse(200, analyses);
    }
    if (u.includes('/rest/v1/client_intake_responses')) {
      return jsonResponse(200, intakeRows);
    }
    if (u.includes('/rest/v1/rpc/persist_client_motivation_analysis')) {
      return jsonResponse(200, {
        id: ANALYSIS_ID,
        analysis_version: 1,
        idempotent: false,
        created_at: '2026-08-12T16:08:00.000Z',
      });
    }
    throw new Error(`unexpected url ${u}`);
  };
  return { fetchImpl, calls };
}

const BASE = {
  accessToken: 'tok',
  organizationId: ORG,
  clientId: CLIENT_ID,
  createdByUserId: USER_ID,
  serviceRoleKey: 'service_role_test_key_not_real',
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test_key',
};

const EXPECTED = presentPlanningLandmarksFromAnswers(SAMPLE_ANSWERS, {
  sourceSubmittedAt: INTAKE_SUBMITTED_AT,
});

test('new analysis snapshots intake landmarks without changing engine versions', async () => {
  const { fetchImpl, calls } = createFetchMock({
    intakeRows: [{
      id: 'intake-b',
      client_id: CLIENT_ID,
      organization_id: ORG,
      status: 'submitted',
      submitted_at: INTAKE_SUBMITTED_AT,
      answers: SAMPLE_ANSWERS,
    }],
  });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.provenance.contentHash, ENGINE.contentHash);
  assert.equal(result.provenance.questionnaireVersion, QUESTIONNAIRE_V43);
  assert.equal(result.provenance.rulesetVersion, RULESET_V42);
  assert.equal(result.provenance.reportModelVersion, REPORT_MODEL_V44);
  assert.equal(result.analysisSnapshot.context.intakePlanning.clientId, CLIENT_ID);
  assert.equal(result.planningLandmarks.age, '36 ans');
  assert.equal(result.planningLandmarks.heightPrimary, '5 pi 9 po');
  assert.equal(result.planningLandmarks.heightSecondary, '175 cm');
  assert.equal(result.planningLandmarks.weightPrimary, '183 lb');
  assert.equal(result.planningLandmarks.weightSecondary, '83,0 kg');
  const persist = calls.find((call) => call.url.includes('persist_client_motivation_analysis'));
  const body = JSON.parse(persist.init.body);
  assert.equal(body.p_content_hash, ENGINE.contentHash);
  assert.equal(body.p_analysis_snapshot.context.intakePlanning.anthropometrics.weightPrimary, '183 lb');
  assert.equal(JSON.stringify(body.p_analysis_snapshot.report).includes('age_years'), false);
});

test('idempotent historical snapshot is not rewritten by a later intake', async () => {
  const snapshotted = {
    schemaVersion: REPORT_MODEL_V44,
    client_id: CLIENT_ID,
    report: { schemaVersion: REPORT_MODEL_V44, metadata: { clientName: 'Client test KR' } },
    provenance: {
      questionnaireVersion: QUESTIONNAIRE_V43,
      rulesetVersion: RULESET_V42,
      reportModelVersion: REPORT_MODEL_V44,
      contentHash: ENGINE.contentHash,
    },
    context: {
      intakePlanning: {
        clientId: CLIENT_ID,
        sourceIntakeResponseId: 'intake-b',
        sourceSubmittedAt: INTAKE_SUBMITTED_AT,
        anthropometrics: {
          age: '36 ans',
          heightPrimary: '5 pi 9 po',
          heightSecondary: '175 cm',
          weightPrimary: '183 lb',
          weightSecondary: '83,0 kg',
        },
      },
    },
  };
  const { fetchImpl, calls } = createFetchMock({
    analyses: [{
      id: ANALYSIS_ID,
      analysis_version: 1,
      questionnaire_version: ENGINE.questionnaireVersion,
      ruleset_version: ENGINE.rulesetVersion,
      report_model_version: ENGINE.reportModelVersion,
      content_hash: ENGINE.contentHash,
      created_at: '2026-08-12T16:08:00.000Z',
      analysis_snapshot: snapshotted,
    }],
    intakeRows: [{
      id: 'intake-c',
      client_id: CLIENT_ID,
      organization_id: ORG,
      status: 'submitted',
      submitted_at: '2026-08-20T12:00:00.000Z',
      answers: { ...SAMPLE_ANSWERS, weight_lb: '190' },
    }],
  });
  const result = await processSubmittedMotivationAssessment({ ...BASE, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.planningLandmarks.weightPrimary, '183 lb');
  assert.equal(result.analysisSnapshot.context.intakePlanning.anthropometrics.weightPrimary, '183 lb');
  assert.equal(calls.some((call) => call.url.includes('persist_client_motivation_analysis')), false);
});

test('legacy snapshot without context keeps a working report and no fake zeros', () => {
  const identity = buildCanonicalClientIdentity({
    id: CLIENT_ID,
    full_name: 'Client test KR',
    email: 'client.test@example.com',
    phone: '5145550100',
    service_type: 'complete',
  }).identity;
  const vm = buildMotivationReportViewModel({
    report: { schemaVersion: REPORT_MODEL_V44, metadata: { clientName: 'Client test KR', clientId: CLIENT_ID } },
    identity,
    clientName: 'Client test KR',
  });
  assert.equal(vm.planningLandmarks, null);
  const html = buildMotivationReportMarkup(vm);
  assert.doesNotMatch(html, /REPÈRES DE PLANIFICATION/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, />0 ans<|>0 lb</);
});

test('web and PDF landmarks stay identical for the same analysis', async () => {
  const identity = buildCanonicalClientIdentity({
    id: CLIENT_ID,
    full_name: 'Client test KR',
    email: 'client.test@example.com',
    phone: '5145550100',
    service_type: 'complete',
  }).identity;
  const analyzed = (await import('../../src/coach/motivation/engine/analyze-motivation.mjs')).analyzeMotivationAssessment({
    questionnaireVersion: QUESTIONNAIRE_V43,
    rulesetVersion: RULESET_V42,
    reportModelVersion: REPORT_MODEL_V44,
    answers: SUBMISSION.answers,
    presentedQuestionCodes: SUBMISSION.presentedQuestionCodes,
    assessmentId: RESPONSE_ID,
    clientId: CLIENT_ID,
    clientName: 'Client test KR',
    status: 'completed',
    completedAt: new Date(MOTIVATION_SUBMITTED_AT),
  });
  const vm = buildMotivationReportViewModel({
    report: analyzed.report,
    identity,
    planningLandmarks: EXPECTED,
    submittedAt: MOTIVATION_SUBMITTED_AT,
    analyzedAt: '2026-08-12T16:08:00.000Z',
    analysisVersion: 1,
    provenance: analyzed.provenance,
  });
  assert.equal(vm.planningLandmarks.age, EXPECTED.age);
  assert.equal(vm.hero.planningLandmarks.heightPrimary, EXPECTED.heightPrimary);
  const html = buildMotivationReportMarkup(vm);
  assert.match(html, /REPÈRES DE PLANIFICATION/);
  assert.match(html, /36 ans/);
  assert.match(html, /5 pi 9 po/);
  assert.match(html, /175 cm/);
  assert.match(html, /183 lb/);
  assert.match(html, /83,0 kg/);
  assert.match(html, /Pré-entrevue soumise le/);
  assert.ok(html.indexOf('REPÈRES DE PLANIFICATION') < html.indexOf('Lecture rapide'));

  const rendered = await renderMotivationPdf(analyzed.report, {
    identity,
    analysisVersion: 1,
    submittedAt: MOTIVATION_SUBMITTED_AT,
    analyzedAt: '2026-08-12T16:08:00.000Z',
    planningLandmarks: EXPECTED,
  });
  const pages = await extractPdfPagesText(rendered.buffer);
  const pdfText = pages.map((page) => page.text).join('\n');
  assert.match(pages[0].text, /REPÈRES DE PLANIFICATION/);
  assert.equal(vm.planningLandmarks.age, EXPECTED.age);
  assert.match(pdfText, /36 ans/);
  assert.match(pdfText, /5 pi 9 po/);
  assert.match(pdfText, /175 cm/);
  assert.match(pdfText, /183 lb/);
  assert.match(pdfText, /83,0 kg/);
  assert.equal(vm.planningLandmarks.age === '36 ans', true);
  assert.equal(vm.planningLandmarks.heightPrimary, '5 pi 9 po');
  assert.equal(vm.planningLandmarks.heightSecondary, '175 cm');
  assert.equal(vm.planningLandmarks.weightPrimary, '183 lb');
  assert.equal(vm.planningLandmarks.weightSecondary, '83,0 kg');
});

test('process API and PDF path expose landmarks without raw intake answers', () => {
  const api = fs.readFileSync(path.join(root, 'api/coach-motivation.js'), 'utf8');
  const pdf = fs.readFileSync(path.join(root, 'src/coach/server/motivation/generate-motivation-pdf.mjs'), 'utf8');
  const processSrc = fs.readFileSync(path.join(root, 'src/coach/server/motivation/process-submitted-motivation.mjs'), 'utf8');
  assert.match(api, /planning_landmarks: result\.planningLandmarks/);
  assert.match(pdf, /planningLandmarks: processed\.planningLandmarks/);
  assert.match(processSrc, /loadClientPlanningLandmarks/);
  assert.doesNotMatch(api, /answers: result/);
});

test('cross-client snapshot context is dropped before display', () => {
  const identity = buildCanonicalClientIdentity({
    id: CLIENT_ID,
    full_name: 'Client test KR',
    email: 'client.test@example.com',
    service_type: 'complete',
  }).identity;
  const vm = buildMotivationReportViewModel({
    report: { schemaVersion: REPORT_MODEL_V44, metadata: { clientId: CLIENT_ID } },
    identity,
    analysisSnapshot: {
      client_id: CLIENT_ID,
      context: {
        intakePlanning: {
          clientId: OTHER_CLIENT,
          anthropometrics: EXPECTED,
        },
      },
    },
  });
  assert.equal(vm.planningLandmarks, null);
});

test('logs never include planning landmark values', () => {
  const dumped = JSON.stringify(redactForLog({
    planning_landmarks: EXPECTED,
    age: '36 ans',
    heightPrimary: '5 pi 9 po',
    weightPrimary: '183 lb',
  }));
  assert.equal(dumped.includes('36'), false);
  assert.equal(dumped.includes('183'), false);
});
