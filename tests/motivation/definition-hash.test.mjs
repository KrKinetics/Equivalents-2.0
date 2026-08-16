import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import {
  QUESTIONNAIRE_V41,
  RULESET_V41,
  REPORT_MODEL_V42,
  buildMotivationDefinitionSnapshot,
  hashMotivationDefinitions,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';

const VERSIONS = {
  questionnaireVersion: QUESTIONNAIRE_V41,
  rulesetVersion: RULESET_V41,
  reportModelVersion: REPORT_MODEL_V42,
};

function cloneSnapshot() {
  return structuredClone(buildMotivationDefinitionSnapshot(VERSIONS));
}

describe('motivation definition snapshot hash', () => {
  it('covers the calculatory fields used by analysis', () => {
    const snapshot = buildMotivationDefinitionSnapshot(VERSIONS);
    const choice03 = snapshot.questions.find((question) => question.code === 'CHOICE_03');
    expect(choice03.scoringDirection).toBe('positive');
    expect(choice03.primaryDimension).toBe('choice_need');
    expect(snapshot.questions.length).toBeGreaterThan(34);
    expect(snapshot.questions.every((question) => Array.isArray(question.tags))).toBe(true);
    expect(snapshot.questions.some((question) => Array.isArray(question.options) && question.options.length > 0)).toBe(true);
    expect(snapshot.adaptiveMax).toBe(4);
    expect(snapshot.adaptivePerDomainMax).toBe(1);
    expect(snapshot.adaptiveCandidates.length).toBeGreaterThan(0);
    expect(snapshot.domainDefinitions.length).toBeGreaterThan(0);
    expect(snapshot.rules.length).toBeGreaterThan(0);
    expect(snapshot.contradictions.length).toBeGreaterThan(0);
    expect(snapshot.rulesetThresholds.highScore).toBeDefined();
    expect(hashMotivationDefinitions(snapshot)).toHaveLength(64);
  });

  it('changes when any calculatory field is mutated', () => {
    const baseline = hashMotivationDefinitions(cloneSnapshot());
    const mutations = [
      (snapshot) => {
        snapshot.questions[0].text = 'injected text';
      },
      (snapshot) => {
        snapshot.questions[0].scoringDirection = 'negative';
      },
      (snapshot) => {
        snapshot.questions[0].primaryDimension = 'autonomy_need';
      },
      (snapshot) => {
        snapshot.questions[0].required = false;
      },
      (snapshot) => {
        snapshot.questions[0].tags.push('injected');
      },
      (snapshot) => {
        snapshot.questions[0].likertMax = 7;
      },
      (snapshot) => {
        const withOptions = snapshot.questions.find((question) => question.options?.length);
        withOptions.options.push('fake option');
      },
      (snapshot) => {
        snapshot.adaptiveMax = 19;
      },
      (snapshot) => {
        snapshot.adaptiveCandidates[0].priority = 'low';
      },
      (snapshot) => {
        snapshot.domainDefinitions[0].coreCodes.push('FAKE');
      },
      (snapshot) => {
        snapshot.rules[0].conditions[0].value = 1;
      },
      (snapshot) => {
        snapshot.contradictions[0].left.value = 1;
      },
      (snapshot) => {
        snapshot.rulesetThresholds.highScore = 99;
      },
    ];

    for (const mutate of mutations) {
      const snapshot = cloneSnapshot();
      mutate(snapshot);
      expect(hashMotivationDefinitions(snapshot)).not.toBe(baseline);
    }
  });

  it('is stable for the locked engine triple', () => {
    const a = resolveMotivationEngine(VERSIONS);
    const b = resolveMotivationEngine(VERSIONS);
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.questionInputs.every((question) => question.id === question.code)).toBe(true);
    expect(a.questionInputs.length).toBe(a.questions.length);
  });
});
