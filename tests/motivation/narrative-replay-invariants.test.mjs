/**
 * Narrative selection is decided before narrative answers exist.
 * Answering a clarification must never change the selected set.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTIONNAIRE_V42,
  QUESTIONNAIRE_V43,
  REPORT_MODEL_V43,
  REPORT_MODEL_V44,
  RULESET_V42,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import {
  analyzeMotivationAssessment,
  expectedNarrativeQuestionCodes,
} from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import { AdaptiveSelectionMismatchError } from '../../src/coach/motivation/engine/presented-questions.mjs';
import { selectAdaptiveQuestionsV43 } from '../../src/coach/motivation/lib/adaptive-questions-v43.mjs';
import { selectionAnswersForNarrative } from '../../src/coach/motivation/engine/narrative-selection.mjs';
import {
  answerFromControl,
  createQuestionnaireRuntime,
  getMotivationQuestion,
  presentedCodesFromAnswers,
} from '../../src/coach/motivation/client/public-questionnaire.mjs';
import {
  V43_AESTHETIC,
  V43_COHERENT,
  V43_LIVE_WHY_NOW_REPLAY,
  V43_MIXED,
  V43_NUTRITION,
  V43_WEAK,
  buildCompleteMotivationSubmissionV43,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import {
  V42_AESTHETIC,
  V42_FRAGILE,
  V42_RICH_NARRATIVE,
  V42_VAGUE,
  buildCompleteMotivationSubmissionV42,
} from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { walkOfficialClientQuestionnaire } from './walk-client-questionnaire.mjs';

const V43 = {
  questionnaireVersion: QUESTIONNAIRE_V43,
  rulesetVersion: RULESET_V42,
  reportModelVersion: REPORT_MODEL_V44,
};
const V42 = {
  questionnaireVersion: QUESTIONNAIRE_V42,
  rulesetVersion: RULESET_V42,
  reportModelVersion: REPORT_MODEL_V43,
};

function afterScoringAnswers(submission, engine) {
  return submission.answers.filter((answer) => !engine.narrativeQuestionCodes.includes(answer.questionCode));
}

function mutateNarrativeAnswers(codes, flavor) {
  return codes.map((code) => {
    if (code === 'CLARIFY_RECOVERY_01') {
      return {
        questionCode: code,
        selectedOptions: [flavor === 'short'
          ? 'je ne sais pas encore'
          : 'faire une version plus courte de la séance'],
      };
    }
    if (code === 'CLARIFY_BARRIER_01' || code === 'CLARIFY_NUT_QUALITY_01') {
      return { questionCode: code, selectedOptions: ['autre'] };
    }
    const text = flavor === 'short'
      ? 'ok'
      : flavor === 'long'
        ? 'parce que je veux une reprise durable maintenant et je veux des repas plus stables chaque semaine'
        : 'parce que je veux reprendre maintenant pour ma sante';
    return { questionCode: code, textValue: text };
  });
}

test('exact live failure: WHY_NOW answer must not replace the presented narrative set', () => {
  const engine = resolveMotivationEngine(V43);
  const submission = buildCompleteMotivationSubmissionV43(V43_LIVE_WHY_NOW_REPLAY);
  const preNarrative = afterScoringAnswers(submission, engine);
  const selected = expectedNarrativeQuestionCodes(engine, preNarrative);
  assert.deepEqual(selected, ['CLARIFY_RECOVERY_01', 'CLARIFY_WHY_NOW_01']);

  const naiveReplay = selectAdaptiveQuestionsV43({
    questions: engine.questionInputs,
    answers: submission.answers,
  }).narrative.map((question) => question.code);
  assert.deepEqual(naiveReplay, ['CLARIFY_RECOVERY_01', 'NUT_SUCCESS_01']);

  const replayed = expectedNarrativeQuestionCodes(engine, submission.answers);
  assert.deepEqual(replayed, selected);
  assert.doesNotThrow(() => analyzeMotivationAssessment(submission));
  const result = analyzeMotivationAssessment(submission);
  assert.equal(result.report.schemaVersion, 'report-model-v4.4');
});

test('client freezes the live narrative set after WHY_NOW is answered', () => {
  const runtime = createQuestionnaireRuntime('questionnaire-v4.3');
  const walked = walkOfficialClientQuestionnaire(V43_LIVE_WHY_NOW_REPLAY, 'questionnaire-v4.3');
  assert.deepEqual(walked.narrativeAtEntry, ['CLARIFY_RECOVERY_01', 'CLARIFY_WHY_NOW_01']);

  const recovery = getMotivationQuestion('CLARIFY_RECOVERY_01', runtime);
  const whyNow = getMotivationQuestion('CLARIFY_WHY_NOW_01', runtime);
  let presented = walked.presentedQuestionCodes.filter((code) => !runtime.narrativeCodes.includes(code)
    || code === 'CLARIFY_RECOVERY_01'
    || code === 'CLARIFY_WHY_NOW_01');
  const baseAndScoring = walked.answers.filter((answer) => !runtime.narrativeCodes.includes(answer.questionCode));
  presented = presentedCodesFromAnswers(
    [...baseAndScoring, answerFromControl(recovery, 'faire une version plus courte de la séance')],
    [...walked.scoringQuestionCodes.length ? walked.presentedQuestionCodes.filter((code) => !runtime.narrativeCodes.includes(code)) : walked.presentedQuestionCodes, 'CLARIFY_RECOVERY_01', 'CLARIFY_WHY_NOW_01'],
    runtime,
  );
  assert.deepEqual(
    presented.filter((code) => runtime.narrativeCodes.includes(code)),
    ['CLARIFY_RECOVERY_01', 'CLARIFY_WHY_NOW_01'],
  );
  presented = presentedCodesFromAnswers(
    [
      ...baseAndScoring,
      answerFromControl(recovery, 'faire une version plus courte de la séance'),
      answerFromControl(whyNow, 'parce que je veux reprendre maintenant pour ma sante'),
    ],
    presented,
    runtime,
  );
  assert.deepEqual(
    presented.filter((code) => runtime.narrativeCodes.includes(code)),
    ['CLARIFY_RECOVERY_01', 'CLARIFY_WHY_NOW_01'],
  );
});

function assertNarrativeImmutable(engine, submission) {
  const preNarrative = afterScoringAnswers(submission, engine);
  const selected = expectedNarrativeQuestionCodes(engine, preNarrative);
  for (const flavor of ['plausible', 'short', 'long']) {
    const mutated = [...preNarrative, ...mutateNarrativeAnswers(selected, flavor)];
    assert.deepEqual(
      expectedNarrativeQuestionCodes(engine, mutated),
      selected,
      `${engine.questionnaireVersion} ${submission.clientName || ''} ${flavor}`,
    );
    assert.deepEqual(
      selectionAnswersForNarrative(engine.narrativeQuestionCodes, mutated).map((answer) => answer.questionCode).sort(),
      preNarrative.map((answer) => answer.questionCode).sort(),
    );
  }
}

test('v4.3 narrative answers never change the expected set', () => {
  const engine = resolveMotivationEngine(V43);
  for (const values of [V43_COHERENT, V43_MIXED, V43_NUTRITION, V43_WEAK, V43_AESTHETIC, V43_LIVE_WHY_NOW_REPLAY]) {
    assertNarrativeImmutable(engine, buildCompleteMotivationSubmissionV43(values));
  }
});

test('v4.2 narrative answers never change the expected set', () => {
  const engine = resolveMotivationEngine(V42);
  for (const values of [V42_RICH_NARRATIVE, V42_FRAGILE, V42_VAGUE, V42_AESTHETIC]) {
    assertNarrativeImmutable(engine, buildCompleteMotivationSubmissionV42(values));
  }
});

test('forged narrative path is still rejected', () => {
  const engine = resolveMotivationEngine(V43);
  const submission = buildCompleteMotivationSubmissionV43(V43_LIVE_WHY_NOW_REPLAY);
  const forged = {
    ...submission,
    presentedQuestionCodes: [
      ...engine.baseQuestionCodes,
      ...submission.expectedAdaptiveQuestionCodes,
      'CLARIFY_RECOVERY_01',
      'NUT_SUCCESS_01',
    ],
    answers: [
      ...afterScoringAnswers(submission, engine),
      { questionCode: 'CLARIFY_RECOVERY_01', selectedOptions: ['faire une version plus courte de la séance'] },
      { questionCode: 'NUT_SUCCESS_01', textValue: 'des repas plus reguliers' },
    ],
  };
  assert.throws(() => analyzeMotivationAssessment(forged), AdaptiveSelectionMismatchError);
});
