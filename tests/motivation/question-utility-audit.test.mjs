import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_QUESTIONS_V42 } from '../../src/coach/motivation/questionnaire/seed-questions-v42.mjs';
import { V42_SCORING_CANDIDATES, V42_NARRATIVE_CANDIDATES } from '../../src/coach/motivation/questionnaire/adaptive-bank-v42.mjs';
import { V42_DOMAIN_DEFINITIONS } from '../../src/coach/motivation/scoring/domain-interpretation-v42.mjs';

test('question utility audit flags questions that cannot change coaching output', () => {
  const scoring = new Map(V42_SCORING_CANDIDATES.map((item) => [item.code, item]));
  const narrative = new Map(V42_NARRATIVE_CANDIDATES.map((item) => [item.code, item]));
  const rows = SEED_QUESTIONS_V42.map((question) => {
    const domain = V42_DOMAIN_DEFINITIONS.find((item) => (
      item.coreCodes.includes(question.code) || item.adaptiveCodes.includes(question.code)
    ));
    const adaptive = scoring.get(question.code);
    const clarify = narrative.get(question.code);
    const open = ['GOAL_01', 'GOAL_02', 'OBS_01', 'NUT_GOAL_01', 'NUT_CONTEXT_01', 'NUT_OBS_01', 'NUT_PREF_01'].includes(question.code);
    const canChange = Boolean(domain || adaptive || clarify || open);
    return {
      code: question.code,
      domain: domain?.domainId || null,
      kind: clarify ? 'NARRATIVE' : adaptive ? 'ADAPTIVE' : 'BASE',
      decisionsAffected: adaptive?.affectedDecisionIds || domain?.affectedDecisionIds || [],
      reportSectionsAffected: open || clarify ? ['portrait', 'brief', 'interview'] : ['dimensions'],
      narrativeImpact: adaptive?.narrativeImpact || clarify?.narrativeImpact || (open ? 'high' : 'low'),
      canEverChangeOutput: canChange,
      redundancyFlag: !canChange,
    };
  });
  const unused = rows.filter((row) => row.redundancyFlag);
  assert.equal(unused.length, 0, `unused questions: ${unused.map((row) => row.code).join(',')}`);
  assert.ok(rows.some((row) => row.code === 'GOAL_01' && row.canEverChangeOutput));
});
