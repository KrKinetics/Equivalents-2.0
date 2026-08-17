/**
 * Official client presented path must be accepted by the server analyzer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMotivationAssessment } from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  V43_AESTHETIC,
  V43_COHERENT,
  V43_LIVE_WHY_NOW_REPLAY,
  V43_MIXED,
  V43_NUTRITION,
  V43_WEAK,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import {
  V42_AESTHETIC,
  V42_FRAGILE,
  V42_PLANNING_CONFLICT,
  V42_RICH_NARRATIVE,
  V42_VAGUE,
} from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { walkOfficialClientQuestionnaire } from './walk-client-questionnaire.mjs';

const V43_PROFILES = [
  ['coherent', V43_COHERENT],
  ['fragile-mixed', V43_MIXED],
  ['nutrition', V43_NUTRITION],
  ['vague', V43_WEAK],
  ['aesthetic', V43_AESTHETIC],
  ['why-now-live', V43_LIVE_WHY_NOW_REPLAY],
];

const V42_PROFILES = [
  ['coherent', V42_RICH_NARRATIVE],
  ['fragile', V42_FRAGILE],
  ['vague', V42_VAGUE],
  ['aesthetic', V42_AESTHETIC],
  ['nutrition-planning', V42_PLANNING_CONFLICT],
];

function assertParity(values, version, versions) {
  const walked = walkOfficialClientQuestionnaire(values, version);
  const result = analyzeMotivationAssessment({
    ...versions,
    presentedQuestionCodes: walked.presentedQuestionCodes,
    answers: walked.answers,
    assessmentId: `asm_parity_${values.id || 'x'}`,
    clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    clientName: 'Client parity',
  });
  assert.deepEqual(result.presentedQuestionCodes, walked.presentedQuestionCodes);
  assert.deepEqual(result.narrativeQuestionCodes, walked.narrativeQuestionCodes);
  assert.equal(result.report.schemaVersion, versions.reportModelVersion);
}

test('questionnaire-v4.3 client path equals server accepted path', () => {
  for (const [label, values] of V43_PROFILES) {
    assert.doesNotThrow(
      () => assertParity(values, 'questionnaire-v4.3', {
        questionnaireVersion: 'questionnaire-v4.3',
        rulesetVersion: 'ruleset-v4.2',
        reportModelVersion: 'report-model-v4.4',
      }),
      label,
    );
  }
});

test('questionnaire-v4.2 client path equals server accepted path', () => {
  for (const [label, values] of V42_PROFILES) {
    assert.doesNotThrow(
      () => assertParity(values, 'questionnaire-v4.2', {
        questionnaireVersion: 'questionnaire-v4.2',
        rulesetVersion: 'ruleset-v4.2',
        reportModelVersion: 'report-model-v4.3',
      }),
      label,
    );
  }
});
