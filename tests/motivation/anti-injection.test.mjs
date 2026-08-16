import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import {
  QUESTIONNAIRE_V41,
  RULESET_V41,
  REPORT_MODEL_V42,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import {
  ExternalQuestionDefinitionsError,
  analyzeMotivationAssessment,
} from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import { PresentedQuestionCodesError } from '../../src/coach/motivation/engine/presented-questions.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';

describe('anti-injection of questionnaire definitions', () => {
  it('rejects caller-supplied questions or definitions', () => {
    const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE);
    const injected = [
      {
        id: 'q_fake',
        code: 'CHOICE_03',
        text: 'Please rate how much you love skipping meals',
        type: 'likert',
        scoringDirection: 'negative',
        primaryDimension: 'autonomy_need',
        required: false,
      },
    ];

    expect(() =>
      analyzeMotivationAssessment({ ...submission, questions: injected }),
    ).toThrow(ExternalQuestionDefinitionsError);

    expect(() =>
      analyzeMotivationAssessment({ ...submission, questionDefinitions: injected }),
    ).toThrow(ExternalQuestionDefinitionsError);
  });

  it('cannot add a fake item, drop a required base item, or rewrite scoring and still get v4.1 analysis', () => {
    const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE);
    const engine = resolveMotivationEngine({
      questionnaireVersion: QUESTIONNAIRE_V41,
      rulesetVersion: RULESET_V41,
      reportModelVersion: REPORT_MODEL_V42,
    });
    const choice03 = engine.questionInputs.find((question) => question.code === 'CHOICE_03');

    expect(() =>
      analyzeMotivationAssessment({
        ...submission,
        presentedQuestionCodes: [...submission.presentedQuestionCodes, 'FAKE_INJECTED'],
      }),
    ).toThrow(PresentedQuestionCodesError);

    expect(() =>
      analyzeMotivationAssessment({
        ...submission,
        presentedQuestionCodes: submission.presentedQuestionCodes.filter((code) => code !== 'CONS_01'),
      }),
    ).toThrow(PresentedQuestionCodesError);

    const result = analyzeMotivationAssessment(submission);
    const presentedChoice = result.report.directAnswers.find((row) => row.questionCode === 'CHOICE_03');
    expect(result.provenance.questionnaireVersion).toBe(QUESTIONNAIRE_V41);
    expect(result.provenance.definitionSnapshot.questions.find((q) => q.code === 'CHOICE_03').text).toBe(
      choice03.text,
    );
    expect(presentedChoice.questionText).toBe(choice03.text);
    expect(choice03.scoringDirection).toBe('positive');
    expect(choice03.primaryDimension).toBe('choice_need');
  });
});
