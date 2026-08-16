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
  });
});

describe('analyzeMotivationAssessment', () => {
  it('returns scoring, rules, report-model-v4.2 and provenance', () => {
    const codes = ['COACH_01', 'GOAL_01', 'NUT_GOAL_01', 'MOT_RES_01', 'CHOICE_01', 'CHOICE_03'];
    const questions = codes.map((code, i) => {
      if (code.startsWith('GOAL') || code.startsWith('NUT_GO')) {
        return {
          id: `q${i}`,
          code,
          text: code,
          type: 'short_text',
          required: true,
          active: true,
          order: i + 1,
          section: 't',
          interpretationTags: code.includes('NUT') ? ['nutrition_goal'] : ['goal'],
        };
      }
      return {
        id: `q${i}`,
        code,
        text: code,
        type: 'likert',
        required: true,
        active: true,
        order: i + 1,
        section: 't',
        likertMin: 1,
        likertMax: 5,
        scoringDirection: 'positive',
        interpretationTags: [],
        primaryDimension: code.startsWith('CHOICE') ? 'choice_need' : 'self_efficacy',
      };
    });
    const answers = questions.map((q) => {
      if (q.type === 'short_text') {
        return { questionId: q.id, textValue: q.code === 'GOAL_01' ? 'être en forme' : 'qualité' };
      }
      return { questionId: q.id, numericValue: q.code === 'COACH_01' ? 5 : 3 };
    });
    const result = analyzeMotivationAssessment({
      questionnaireVersion: QUESTIONNAIRE_V41,
      rulesetVersion: RULESET_V41,
      reportModelVersion: REPORT_MODEL_V42,
      questions,
      answers,
      assessmentId: 'asm_test',
      clientName: 'Client test',
    });
    expect(result.report.schemaVersion).toBe('report-model-v4.2');
    expect(result.provenance.questionnaireVersion).toBe(QUESTIONNAIRE_V41);
    expect(result.provenance.rulesetVersion).toBe(RULESET_V41);
    expect(result.provenance.reportModelVersion).toBe(REPORT_MODEL_V42);
    expect(result.provenance.contentHash).toHaveLength(64);
    expect(result.scoring.dimensions.length).toBeGreaterThan(0);
  });
});
