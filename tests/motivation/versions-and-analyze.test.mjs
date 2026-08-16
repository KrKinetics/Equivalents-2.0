import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import {
  QUESTIONNAIRE_V41,
  RULESET_V41,
  REPORT_MODEL_V42,
  resolveMotivationEngine,
  buildMotivationProvenance,
  UnknownMotivationEngineError,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import { analyzeMotivationAssessment } from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';

describe('motivation versions', () => {
  it('resolves the locked v4.1 / v4.2 triple and hashes definitions', () => {
    const engine = resolveMotivationEngine({
      questionnaireVersion: QUESTIONNAIRE_V41,
      rulesetVersion: RULESET_V41,
      reportModelVersion: REPORT_MODEL_V42,
    });
    expect(engine.questionnaireVersion).toBe('questionnaire-v4.1');
    expect(engine.rulesetVersion).toBe('ruleset-v4.1');
    expect(engine.reportModelVersion).toBe('report-model-v4.2');
    expect(engine.contentHash).toHaveLength(64);
    expect(engine.rules.length).toBeGreaterThan(0);
    expect(engine.questionInputs.length).toBe(engine.questions.length);
    expect(engine.questionInputs.every((question) => question.id === question.code)).toBe(true);
  });

  it('refuses a silent latest or unknown historical triple', () => {
    expect(() =>
      resolveMotivationEngine({
        questionnaireVersion: 'latest',
        rulesetVersion: RULESET_V41,
        reportModelVersion: REPORT_MODEL_V42,
      }),
    ).toThrow(UnknownMotivationEngineError);

    expect(() =>
      resolveMotivationEngine({
        questionnaireVersion: QUESTIONNAIRE_V41,
        rulesetVersion: 'ruleset-v4',
        reportModelVersion: REPORT_MODEL_V42,
      }),
    ).toThrow('Unknown motivation engine versions');
  });

  it('exposes a persistence contract without writing a database', () => {
    const provenance = buildMotivationProvenance({
      questionnaireVersion: QUESTIONNAIRE_V41,
      rulesetVersion: RULESET_V41,
      reportModelVersion: REPORT_MODEL_V42,
    });
    expect(provenance.contentHash).toHaveLength(64);
    expect(provenance.definitionSnapshot.questionnaireVersion).toBe(QUESTIONNAIRE_V41);
    expect(provenance.definitionSnapshot.questions.length).toBeGreaterThan(34);
  });
});

describe('analyzeMotivationAssessment', () => {
  it('returns scoring, rules, report-model-v4.2 and provenance from engine definitions', () => {
    const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE, {
      assessmentId: 'asm_test',
      clientName: 'Client test',
    });
    const result = analyzeMotivationAssessment(submission);
    expect(result.report.schemaVersion).toBe('report-model-v4.2');
    expect(result.provenance.questionnaireVersion).toBe(QUESTIONNAIRE_V41);
    expect(result.provenance.rulesetVersion).toBe(RULESET_V41);
    expect(result.provenance.reportModelVersion).toBe(REPORT_MODEL_V42);
    expect(result.provenance.contentHash).toHaveLength(64);
    expect(result.provenance.definitionSnapshot).toBeDefined();
    expect(result.scoring.dimensions.length).toBeGreaterThan(0);
    expect(result.presentedQuestionCodes).toEqual(submission.presentedQuestionCodes);
  });
});
