import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import {
  QUESTIONNAIRE_V41,
  RULESET_V41,
  REPORT_MODEL_V42,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import {
  AdaptiveSelectionMismatchError,
  PresentedQuestionCodesError,
  resolvePresentedMotivationQuestions,
} from '../../src/coach/motivation/engine/presented-questions.mjs';
import {
  analyzeMotivationAssessment,
  expectedAdaptiveQuestionCodes,
} from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';

function engine() {
  return resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
  });
}

describe('resolvePresentedMotivationQuestions', () => {
  it('requires every base code and only this version’s adaptive bank', () => {
    const resolved = engine();
    const presented = resolvePresentedMotivationQuestions({
      engine: resolved,
      presentedQuestionCodes: [...resolved.baseQuestionCodes, 'NUT_PLAN_01'],
    });
    expect(presented.baseQuestionCodes).toEqual([...resolved.baseQuestionCodes]);
    expect(presented.adaptiveQuestionCodes).toEqual(['NUT_PLAN_01']);
    expect(presented.questions.every((question) => question.id === question.code)).toBe(true);
  });

  it('rejects unknown, duplicate, missing-base, and over-max adaptive codes', () => {
    const resolved = engine();
    expect(() =>
      resolvePresentedMotivationQuestions({
        engine: resolved,
        presentedQuestionCodes: [...resolved.baseQuestionCodes, 'FAKE_99'],
      }),
    ).toThrow(PresentedQuestionCodesError);

    expect(() =>
      resolvePresentedMotivationQuestions({
        engine: resolved,
        presentedQuestionCodes: [...resolved.baseQuestionCodes, resolved.baseQuestionCodes[0]],
      }),
    ).toThrow('Duplicate presented question code');

    expect(() =>
      resolvePresentedMotivationQuestions({
        engine: resolved,
        presentedQuestionCodes: resolved.baseQuestionCodes.slice(1),
      }),
    ).toThrow('Missing required base question codes');

    expect(() =>
      resolvePresentedMotivationQuestions({
        engine: resolved,
        presentedQuestionCodes: [
          ...resolved.baseQuestionCodes,
          ...resolved.adaptiveQuestionCodes.slice(0, 5),
        ],
      }),
    ).toThrow('Too many adaptive questions');
  });
});

describe('adaptive selection at submit', () => {
  it('accepts the deterministic set and rejects a different presented set', () => {
    const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE);
    const resolved = engine();
    const expected = expectedAdaptiveQuestionCodes(resolved, submission.answers);
    expect(submission.expectedAdaptiveQuestionCodes).toEqual(expected);

    const ok = analyzeMotivationAssessment(submission);
    expect(ok.adaptiveQuestionCodes).toEqual(expected);

    const wrongAdaptive = resolved.adaptiveQuestionCodes
      .filter((code) => !expected.includes(code))
      .slice(0, 1);
    const presented = [...resolved.baseQuestionCodes, ...(wrongAdaptive.length ? wrongAdaptive : ['MOT_AUTO_02'])];
    expect(() =>
      analyzeMotivationAssessment({
        ...submission,
        presentedQuestionCodes: presented,
        answers: submission.answers.filter((answer) => presented.includes(answer.questionCode)),
      }),
    ).toThrow(AdaptiveSelectionMismatchError);
  });
});
