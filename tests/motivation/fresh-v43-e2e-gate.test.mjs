/**
 * Fresh questionnaire-v4.3 / report-model-v4.4 presentation gate.
 * Does not write a database or send mail. Live invite remains owner Preview QA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCompleteMotivationProfileV43,
  buildCompleteMotivationSubmissionV43,
  V43_COHERENT,
  V43_MIXED,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import {
  QUESTIONNAIRE_V43_HARD_MAX,
  QUESTIONNAIRE_V43_NARRATIVE_MAX,
} from '../../src/coach/motivation/questionnaire/adaptive-bank-v43.mjs';
import { buildCanonicalClientIdentity } from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { assertCrossSectionClaimConsistency } from '../../src/coach/motivation/report/presentation-claim-consistency.mjs';
import { isTestableFourWeekPlan } from '../../src/coach/motivation/report/presentation-labels.mjs';

const CLIENT = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  full_name: 'Alex Fresh',
  email: 'alex.fresh@example.com',
  phone: '5145550198',
  service_type: 'complete',
};

test('fresh v4.3 submission stays inside adaptive and narrative caps', () => {
  const submission = buildCompleteMotivationSubmissionV43(V43_COHERENT, {
    clientId: CLIENT.id,
    clientName: CLIENT.full_name,
  });
  assert.equal(submission.questionnaireVersion, 'questionnaire-v4.3');
  assert.equal(submission.rulesetVersion, 'ruleset-v4.2');
  assert.equal(submission.reportModelVersion, 'report-model-v4.4');
  assert.ok(submission.presentedQuestionCodes.length <= QUESTIONNAIRE_V43_HARD_MAX);
  assert.ok(submission.expectedNarrativeQuestionCodes.length <= QUESTIONNAIRE_V43_NARRATIVE_MAX);
  assert.ok(submission.expectedAdaptiveQuestionCodes.length >= 1);
});

test('fresh v4.4 report has identity, nutrition, testable plan and no mixed contradictions', async () => {
  for (const profile of [V43_COHERENT, V43_MIXED]) {
    const { submission, result } = analyzeCompleteMotivationProfileV43(profile, {
      clientId: CLIENT.id,
      clientName: CLIENT.full_name,
    });
    assert.equal(result.report.schemaVersion, 'report-model-v4.4');
    assert.equal(result.provenance.questionnaireVersion, 'questionnaire-v4.3');
    assert.equal(result.provenance.rulesetVersion, 'ruleset-v4.2');
    assert.ok(submission.presentedQuestionCodes.length <= QUESTIONNAIRE_V43_HARD_MAX);
    const identity = buildCanonicalClientIdentity(CLIENT).identity;
    const vm = buildMotivationReportViewModel({
      report: result.report,
      identity,
      analysisVersion: 1,
      submittedAt: '2026-08-16T16:00:00.000Z',
      analyzedAt: '2026-08-16T16:08:00.000Z',
      provenance: result.provenance,
    });
    const html = buildMotivationReportMarkup(vm);
    const rendered = await renderMotivationPdf(result.report, {
      identity,
      analysisVersion: 1,
      submittedAt: '2026-08-16T16:00:00.000Z',
      analyzedAt: '2026-08-16T16:08:00.000Z',
    });
    const pdfText = (await extractPdfPagesText(rendered.buffer)).map((page) => page.text).join('\n');
    assert.match(html, /Alex Fresh/);
    assert.match(pdfText, /Alex Fresh/);
    assert.match(pdfText, /bbbbbbbb/);
    assert.match(html, /data-section="nutrition"/);
    assert.match(pdfText, /Nutrition/i);
    assert.equal(isTestableFourWeekPlan(vm.fourWeekPlan), true);
    assert.match(pdfText, /Objectif :/);
    assert.match(pdfText, /Action Coach :/);
    assert.match(pdfText, /Ce qu'on observe :/);
    assert.match(pdfText, /Critère de validation :/);
    assert.match(html, /Objectif\.|Action Coach\.|Ce qu'on observe\.|Critère de validation\./);
    const errors = assertCrossSectionClaimConsistency({
      findings: vm.dimensions,
      portrait: vm.portraitCoach,
      plan: vm.fourWeekPlan,
      priorities: vm.coachPriorities,
      nutrition: { ...vm.nutrition, ...vm.nutritionOrganized, cards: vm.nutritionAction?.cards },
      pdfText,
      html,
    });
    assert.deepEqual(errors, [], `${profile.id}: ${errors.join('\n')}`);
    const mixed = vm.dimensions.filter((row) => row.claimStrength === 'mixed');
    for (const row of mixed) {
      assert.match(row.displayLabel, /Signal mixte/);
      assert.match(String(row.coachMeaning), /Hypothèse à tester|pourrait|à tester/i);
    }
  }
});
