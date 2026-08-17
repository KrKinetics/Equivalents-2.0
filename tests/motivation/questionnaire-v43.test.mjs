import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTIONNAIRE_V41,
  QUESTIONNAIRE_V42,
  QUESTIONNAIRE_V43,
  REPORT_MODEL_V42,
  REPORT_MODEL_V43,
  REPORT_MODEL_V44,
  RULESET_V41,
  RULESET_V42,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import {
  QUESTIONNAIRE_V43_BASE_COUNT,
  QUESTIONNAIRE_V43_HARD_MAX,
  QUESTIONNAIRE_V43_NARRATIVE_MAX,
  QUESTIONNAIRE_V43_SCORING_ADAPTIVE_MAX,
} from '../../src/coach/motivation/questionnaire/adaptive-bank-v43.mjs';
import {
  analyzeCompleteMotivationProfileV43,
  V43_COHERENT,
  V43_WEAK,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { analyzeCompleteMotivationProfileV42, V42_RICH_NARRATIVE } from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { selectNarrativeClarificationsV43 } from '../../src/coach/motivation/lib/narrative-clarifications-v43.mjs';

test('questionnaire-v4.3 keeps the 8-12 min hard caps', () => {
  assert.equal(QUESTIONNAIRE_V43_BASE_COUNT, 34);
  assert.equal(QUESTIONNAIRE_V43_SCORING_ADAPTIVE_MAX, 4);
  assert.equal(QUESTIONNAIRE_V43_NARRATIVE_MAX, 2);
  assert.equal(QUESTIONNAIRE_V43_HARD_MAX, 40);
  const engine = resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V43,
    rulesetVersion: RULESET_V42,
    reportModelVersion: REPORT_MODEL_V44,
  });
  assert.equal(engine.baseQuestionCodes.length, 34);
  assert.ok(engine.contentHash);
  assert.notEqual(engine.contentHash, resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V42,
    rulesetVersion: RULESET_V42,
    reportModelVersion: REPORT_MODEL_V43,
  }).contentHash);
});

test('historical v4.1 and v4.2 hashes stay frozen', () => {
  const v41 = resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
  });
  const v42 = resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V42,
    rulesetVersion: RULESET_V42,
    reportModelVersion: REPORT_MODEL_V43,
  });
  assert.equal(v41.contentHash, '1265924371782d8818c6d8a0121a51495d3716257303febb5afc238fade49533');
  assert.equal(v42.contentHash, '484a314890c802947b5f8c6dee71ab29e331259a426606cfd7aa9d2ee315902f');
});

test('v4.3 never presents more than 40 screens or 2 narrative clarifications', () => {
  const { submission } = analyzeCompleteMotivationProfileV43(V43_WEAK);
  assert.ok(submission.presentedQuestionCodes.length <= 40);
  assert.ok(submission.expectedNarrativeQuestionCodes.length <= 2);
  const { submission: coherent } = analyzeCompleteMotivationProfileV43(V43_COHERENT);
  assert.ok(coherent.presentedQuestionCodes.length <= 40);
  assert.ok(coherent.expectedNarrativeQuestionCodes.length <= 2);
});

test('v4.3 can ask why-now when the goal is present but unexplained', () => {
  const engine = resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V43,
    rulesetVersion: RULESET_V42,
    reportModelVersion: REPORT_MODEL_V44,
  });
  const questions = engine.questionInputs;
  const answers = [
    { questionCode: 'GOAL_01', textValue: 'j\'aimerais me sentir mieux dans mon corps' },
    { questionCode: 'GOAL_02', textValue: 'me sentir fort' },
  ];
  const selected = selectNarrativeClarificationsV43({ questions, answers });
  assert.ok(selected.some((item) => item.code === 'CLARIFY_WHY_NOW_01'));
  assert.ok(selected.length <= 2);
});

test('v4.2 analyses stay on report-model-v4.3', () => {
  const historical = analyzeCompleteMotivationProfileV42(V42_RICH_NARRATIVE);
  assert.equal(historical.result.report.schemaVersion, 'report-model-v4.3');
  assert.equal(historical.result.provenance.questionnaireVersion, 'questionnaire-v4.2');
});
