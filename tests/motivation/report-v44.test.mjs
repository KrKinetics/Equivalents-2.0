import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCompleteMotivationProfileV43,
  V43_COHERENT,
  V43_MIXED,
  V43_NUTRITION,
  V43_WEAK,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { analyzeCompleteMotivationProfileV42, V42_RICH_NARRATIVE } from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { assertClaimLanguage, isInterviewQuestion } from '../../src/coach/motivation/report/v44/language.mjs';
import { findingByKey } from '../../src/coach/motivation/report/v44/findings.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';

function analyze(profile, name = 'Client test KR') {
  return analyzeCompleteMotivationProfileV43(profile, {
    clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    clientName: name,
  }).result;
}

test('report-model-v4.4 builds canonical findings and a coach decision brief', () => {
  const result = analyze(V43_COHERENT);
  assert.equal(result.report.schemaVersion, 'report-model-v4.4');
  assert.ok(result.report.canonicalFindings.length > 8);
  assert.ok(result.report.coachDecisionBrief.athleteGoal);
  assert.equal(result.report.coachPriorities.some(isInterviewQuestion), false);
  assert.ok(result.report.fourWeekPlanDetailed.every((week) => week.observe && week.validationCriterion));
});

test('mixed signals are not restated as a definitive recovery level', () => {
  const result = analyze(V43_MIXED);
  const adherence = findingByKey(result.report.canonicalFindings, 'adherence_recovery');
  if (adherence && (adherence.claimStrength === 'mixed' || adherence.claimStrength === 'single')) {
    const planText = result.report.fourWeekPlanDetailed.map((week) => `${week.coachAction} ${week.validationCriterion}`).join(' ');
    assert.doesNotMatch(planText, /Reprise\s*:\s*élevée/i);
    const errors = assertClaimLanguage([{
      key: 'adherence_recovery',
      text: planText,
      claimStrength: adherence.claimStrength,
    }], result.report.canonicalFindings);
    assert.deepEqual(errors, []);
  }
});

test('single-item findings never expose a precise displayScore', () => {
  const result = analyze(V43_WEAK);
  for (const finding of result.report.canonicalFindings) {
    if (finding.claimStrength === 'single') {
      assert.equal(finding.displayScore, null);
      assert.match(finding.interpretation, /suggère|pourrait|semble|à confirmer/i);
    }
  }
});

test('web and PDF view-models share the same finding claimStrength', () => {
  const result = analyze(V43_NUTRITION);
  const vm = buildMotivationReportViewModel({
    report: result.report,
    clientName: 'Client test KR',
    clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
  const webAdherence = (vm.canonicalFindings || []).find((item) => item.key === 'adherence_recovery' || item.domain === 'adherence_recovery');
  const snapAdherence = findingByKey(result.report.canonicalFindings, 'adherence_recovery');
  if (webAdherence && snapAdherence) {
    assert.equal(webAdherence.claimStrength, snapAdherence.claimStrength);
  }
});

test('historical v4.2 / report-model-v4.3 snapshot is unchanged by v4.4 assemble', () => {
  const historical = analyzeCompleteMotivationProfileV42(V42_RICH_NARRATIVE);
  assert.equal(historical.result.report.schemaVersion, 'report-model-v4.3');
  assert.equal(historical.result.provenance.questionnaireVersion, 'questionnaire-v4.2');
});
