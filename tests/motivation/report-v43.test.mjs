import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCompleteMotivationProfile } from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import { PROFILE_A_STABLE } from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import {
  V42_AESTHETIC,
  V42_FRAGILE,
  V42_PLANNING_CONFLICT,
  V42_RICH_NARRATIVE,
  analyzeCompleteMotivationProfileV42,
} from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { canMakeStrongClaim } from '../../src/coach/motivation/report/v43/evidence.mjs';

test('historical report-model-v4.2 snapshot stays on v4.2 schema', () => {
  const { result } = analyzeCompleteMotivationProfile(PROFILE_A_STABLE);
  assert.equal(result.report.schemaVersion, 'report-model-v4.2');
  assert.equal(result.provenance.questionnaireVersion, 'questionnaire-v4.1');
});

test('report-model-v4.3 gates single-item results narrative and builds an operating brief', () => {
  const { result } = analyzeCompleteMotivationProfileV42(V42_AESTHETIC);
  assert.equal(result.report.schemaVersion, 'report-model-v4.3');
  assert.equal(result.provenance.questionnaireVersion, 'questionnaire-v4.2');
  const results = result.report.domainInterpretations.find((item) => item.domainId === 'results_orientation');
  const horizon = result.report.sport.narrativeSections[0].paragraphs.join(' ');
  if (!canMakeStrongClaim(results)) {
    assert.match(horizon, /premier signal|à confirmer/i);
    assert.doesNotMatch(horizon, /fortement influencé par les résultats visibles/);
  }
  const presented = result.report.presentedDomains.find((item) => item.domainId === 'results_orientation');
  if (presented.itemCount === 1) {
    assert.equal(presented.displayScore, null);
    assert.match(presented.evidenceBadge, /Donnée unique/);
  }
  assert.ok(result.report.athleteOperatingBrief.primaryGoal);
  assert.ok(result.report.portraitCoach.sections.length >= 4);
  assert.ok(result.report.reportConfidence.label);
  assert.doesNotMatch(JSON.stringify(result.report.initialPlan.mainStrengths), /Aucune force suffisamment appuyée/);
});

test('v4.3 conflicts are first-class and interview stays at 5', () => {
  const { result } = analyzeCompleteMotivationProfileV42(V42_PLANNING_CONFLICT);
  assert.ok(result.report.conflicts.some((item) => item.sourceA && item.validationQuestion));
  assert.ok(result.report.priorityInterviewQuestions.length <= 5);
  assert.ok(result.report.priorityInterviewQuestions.every((item) => item.text && item.whyItMatters));
});

test('v4.3 four-week plan uses official brief fields and provenance', () => {
  const aesthetic = analyzeCompleteMotivationProfileV42(V42_AESTHETIC).result.report;
  const fragile = analyzeCompleteMotivationProfileV42(V42_FRAGILE).result.report;
  const rich = analyzeCompleteMotivationProfileV42(V42_RICH_NARRATIVE).result.report;
  assert.notEqual(
    aesthetic.fourWeekPlan.weeks[0].actions[0],
    fragile.fourWeekPlan.weeks[0].actions[0],
  );
  assert.ok(rich.athleteOperatingBrief.whyNow);
  assert.ok(rich.fourWeekPlanDetailed.every((week) => week.actions.every((action) => action.provenance)));
});
