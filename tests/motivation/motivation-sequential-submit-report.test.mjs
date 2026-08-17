/**
 * True sequential questionnaire E2E using official client helpers.
 * presentedQuestionCodes come from the browser path, never from
 * expectedNarrativeQuestionCodes().
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeMotivationAssessment,
} from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import { AdaptiveSelectionMismatchError } from '../../src/coach/motivation/engine/presented-questions.mjs';
import { buildCanonicalClientIdentity } from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import {
  V43_LIVE_WHY_NOW_REPLAY,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { V42_FRAGILE } from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { walkOfficialClientQuestionnaire } from './walk-client-questionnaire.mjs';

const CLIENT = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  full_name: 'Alex Sequential',
  email: 'alex.sequential@example.com',
  phone: '5145550198',
  service_type: 'complete',
};

async function assertAcceptedReport(walked, versions) {
  const submission = {
    ...versions,
    presentedQuestionCodes: walked.presentedQuestionCodes,
    answers: walked.answers,
    assessmentId: 'asm_sequential',
    clientId: CLIENT.id,
    clientName: CLIENT.full_name,
    clientCoachId: 'coach',
    completedAt: new Date('2026-08-17T12:00:00.000Z'),
  };
  const result = analyzeMotivationAssessment(submission);
  assert.equal(result.report.schemaVersion, versions.reportModelVersion);
  const identity = buildCanonicalClientIdentity(CLIENT).identity;
  const vm = buildMotivationReportViewModel({
    report: result.report,
    identity,
    analysisVersion: 1,
    submittedAt: '2026-08-17T12:00:00.000Z',
    analyzedAt: '2026-08-17T12:08:00.000Z',
    provenance: result.provenance,
  });
  const html = buildMotivationReportMarkup(vm);
  const rendered = await renderMotivationPdf(result.report, {
    identity,
    analysisVersion: 1,
    submittedAt: '2026-08-17T12:00:00.000Z',
    analyzedAt: '2026-08-17T12:08:00.000Z',
  });
  assert.match(html, /Alex Sequential/);
  assert.equal(rendered.buffer.subarray(0, 5).toString(), '%PDF-');
  return { submission, result, html, rendered };
}

test('sequential v4.3 live path: submit is accepted and web/PDF reports are created', async () => {
  const walked = walkOfficialClientQuestionnaire(V43_LIVE_WHY_NOW_REPLAY, 'questionnaire-v4.3');
  assert.deepEqual(walked.narrativeAtEntry, ['CLARIFY_RECOVERY_01', 'CLARIFY_WHY_NOW_01']);
  assert.deepEqual(walked.narrativeQuestionCodes, ['CLARIFY_RECOVERY_01', 'CLARIFY_WHY_NOW_01']);
  const { result, html, rendered } = await assertAcceptedReport(walked, {
    questionnaireVersion: 'questionnaire-v4.3',
    rulesetVersion: 'ruleset-v4.2',
    reportModelVersion: 'report-model-v4.4',
  });
  assert.equal(result.narrativeQuestionCodes.join(','), 'CLARIFY_RECOVERY_01,CLARIFY_WHY_NOW_01');
  assert.match(html, /data-section="nutrition"|Nutrition/i);
  assert.ok(rendered.pageCount >= 1);
});

test('sequential v4.2 fragile path is accepted independently of server expected helpers', async () => {
  const walked = walkOfficialClientQuestionnaire(V42_FRAGILE, 'questionnaire-v4.2');
  assert.ok(walked.narrativeQuestionCodes.length <= 2);
  await assertAcceptedReport(walked, {
    questionnaireVersion: 'questionnaire-v4.2',
    rulesetVersion: 'ruleset-v4.2',
    reportModelVersion: 'report-model-v4.3',
  });
});

test('sequential walker never imports expectedNarrativeQuestionCodes', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'walk-client-questionnaire.mjs'), 'utf8');
  assert.equal(src.includes('expectedNarrativeQuestionCodes'), false);
  assert.match(src, /presentedCodesFromAnswers/);
  assert.match(src, /answerFromControl/);
});

test('forged sequential payload stays fail-closed', () => {
  const walked = walkOfficialClientQuestionnaire(V43_LIVE_WHY_NOW_REPLAY, 'questionnaire-v4.3');
  const forged = {
    questionnaireVersion: 'questionnaire-v4.3',
    rulesetVersion: 'ruleset-v4.2',
    reportModelVersion: 'report-model-v4.4',
    presentedQuestionCodes: walked.presentedQuestionCodes
      .filter((code) => code !== 'CLARIFY_WHY_NOW_01')
      .concat(walked.narrativeQuestionCodes.includes('NUT_SUCCESS_01') ? [] : ['NUT_SUCCESS_01']),
    answers: [
      ...walked.answers.filter((answer) => answer.questionCode !== 'CLARIFY_WHY_NOW_01'),
      { questionCode: 'NUT_SUCCESS_01', textValue: 'des repas plus reguliers' },
    ],
    assessmentId: 'asm_forged',
    clientId: CLIENT.id,
    clientName: CLIENT.full_name,
  };
  assert.throws(() => analyzeMotivationAssessment(forged), AdaptiveSelectionMismatchError);
});
