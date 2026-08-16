import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTIONNAIRE_V42_BASE_COUNT,
  QUESTIONNAIRE_V42_HARD_MAX,
  QUESTIONNAIRE_V42_NARRATIVE_MAX,
  QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX,
  SEED_QUESTIONS_V42,
  SEED_QUESTIONS_V42_BASE,
  V42_NARRATIVE_BANK_CODES,
} from '../../src/coach/motivation/questionnaire/seed-questions-v42.mjs';
import { SEED_QUESTIONS_V41_BASE } from '../../src/coach/motivation/questionnaire/seed-questions-v41.mjs';

test('questionnaire v4.2 keeps the 34-base architecture and hard cap 40', () => {
  assert.equal(QUESTIONNAIRE_V42_BASE_COUNT, 34);
  assert.equal(QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX, 4);
  assert.equal(QUESTIONNAIRE_V42_NARRATIVE_MAX, 2);
  assert.equal(QUESTIONNAIRE_V42_HARD_MAX, 40);
  assert.equal(SEED_QUESTIONS_V42_BASE.length, 34);
  assert.ok(SEED_QUESTIONS_V42.length <= 34 + 19 + 6);
  assert.deepEqual(
    SEED_QUESTIONS_V42_BASE.map((item) => item.code),
    SEED_QUESTIONS_V41_BASE.map((item) => item.code),
  );
});

test('questionnaire v4.2 rewrites open questions without mutating v4.1 text', () => {
  const v41Goal = SEED_QUESTIONS_V41_BASE.find((item) => item.code === 'GOAL_01');
  const v42Goal = SEED_QUESTIONS_V42_BASE.find((item) => item.code === 'GOAL_01');
  assert.match(v41Goal.text, /objectif prioritaire/);
  assert.match(v42Goal.text, /pourquoi est-ce important/);
  assert.equal(v42Goal.required, true);
  assert.ok(v42Goal.maxLength <= 320);
  const success = SEED_QUESTIONS_V42_BASE.find((item) => item.code === 'GOAL_02');
  assert.match(success.text, /8 à 12 semaines/);
  assert.equal(success.required, true);
  const obs = SEED_QUESTIONS_V42_BASE.find((item) => item.code === 'OBS_01');
  assert.match(obs.text, /dérailler/);
  assert.ok(obs.chips.length >= 8);
  const nut = SEED_QUESTIONS_V42_BASE.find((item) => item.code === 'NUT_GOAL_01');
  assert.match(nut.text, /changement alimentaire concret/);
  assert.ok(V42_NARRATIVE_BANK_CODES.includes('NUT_SUCCESS_01'));
  assert.ok(V42_NARRATIVE_BANK_CODES.includes('CLARIFY_RECOVERY_01'));
});
