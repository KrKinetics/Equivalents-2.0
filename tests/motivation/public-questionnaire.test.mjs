import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_ADAPTIVE_MAX,
  OFFICIAL_BASE_COUNT,
  getBaseMotivationQuestions,
  presentedCodesFromAnswers,
  selectClientAdaptiveQuestions,
} from '../../src/coach/motivation/client/public-questionnaire.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import { expectedAdaptiveQuestionCodes } from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';

test('public questionnaire exposes 34 base questions and never a report', () => {
  const questions = getBaseMotivationQuestions();
  assert.equal(questions.length, OFFICIAL_BASE_COUNT);
  assert.equal(OFFICIAL_ADAPTIVE_MAX, 4);
  assert.equal(questions.every((question) => question.text && question.code), true);
});

test('client adaptive selection matches the official engine and stays at max 4', () => {
  const engine = resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
  });
  const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE);
  const baseAnswers = submission.answers.filter((answer) =>
    engine.baseQuestionCodes.includes(answer.questionCode),
  );
  const adaptive = selectClientAdaptiveQuestions(baseAnswers);
  assert.deepEqual(adaptive, expectedAdaptiveQuestionCodes(engine, baseAnswers));
  assert.ok(adaptive.length <= OFFICIAL_ADAPTIVE_MAX);
  const presented = presentedCodesFromAnswers(baseAnswers);
  assert.equal(presented.length, OFFICIAL_BASE_COUNT + adaptive.length);
  assert.equal(presented.slice(0, 34).join(','), engine.baseQuestionCodes.join(','));
});
