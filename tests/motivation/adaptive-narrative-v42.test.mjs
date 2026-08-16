import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTIONNAIRE_V42,
  REPORT_MODEL_V43,
  RULESET_V42,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import { expectedAdaptiveQuestionCodes, expectedNarrativeQuestionCodes } from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  V42_AESTHETIC,
  V42_FRAGILE,
  V42_RICH_NARRATIVE,
  buildCompleteMotivationSubmissionV42,
} from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';

const ENGINE = resolveMotivationEngine({
  questionnaireVersion: QUESTIONNAIRE_V42,
  rulesetVersion: RULESET_V42,
  reportModelVersion: REPORT_MODEL_V43,
});

test('v4.2 adaptive scoring stays at max 4 and narrative at max 2', () => {
  const aesthetic = buildCompleteMotivationSubmissionV42(V42_AESTHETIC);
  const fragile = buildCompleteMotivationSubmissionV42(V42_FRAGILE);
  assert.ok(aesthetic.expectedAdaptiveQuestionCodes.length <= 4);
  assert.ok(aesthetic.expectedNarrativeQuestionCodes.length <= 2);
  assert.ok(fragile.expectedNarrativeQuestionCodes.length <= 2);
  assert.ok(aesthetic.presentedQuestionCodes.length <= 40);
  const base = aesthetic.answers.filter((item) => ENGINE.baseQuestionCodes.includes(item.questionCode));
  assert.deepEqual(expectedAdaptiveQuestionCodes(ENGINE, base), aesthetic.expectedAdaptiveQuestionCodes);
  assert.deepEqual(expectedNarrativeQuestionCodes(ENGINE, aesthetic.answers), aesthetic.expectedNarrativeQuestionCodes);
});

test('rich narrative answers can skip goal clarifications that vague answers trigger', () => {
  const vague = buildCompleteMotivationSubmissionV42(V42_AESTHETIC);
  const rich = buildCompleteMotivationSubmissionV42(V42_RICH_NARRATIVE);
  assert.ok(vague.expectedNarrativeQuestionCodes.length >= 1);
  assert.notDeepEqual(vague.expectedNarrativeQuestionCodes, rich.expectedNarrativeQuestionCodes);
});
