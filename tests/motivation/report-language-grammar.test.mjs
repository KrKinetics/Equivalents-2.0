import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalFinding } from '../../src/coach/motivation/report/v44/findings.mjs';
import { buildNutritionActionCards } from '../../src/coach/motivation/report/v44/nutrition.mjs';
import { buildFourWeekPlanV44 } from '../../src/coach/motivation/report/v44/plan.mjs';
import {
  analyzeCompleteMotivationProfileV43,
  V43_COHERENT,
  V43_MIXED,
  V43_NUTRITION,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';

const BROKEN_PHRASE_1 = 'Les réponses indiquent cohérente — tendance élevée';
const BROKEN_PHRASE_2 = 'Un premier signal suggère signal de risque limité';
const BROKEN_PHRASE_3 = 'Tester une reprise minimale à tester';

function domainStub(overrides = {}) {
  return {
    domainId: 'hunger_signals',
    label: 'Signaux de faim et de satiété',
    itemCount: 2,
    agreement: 'consistent',
    evidenceStrength: 'moderate',
    level: 'high',
    technicalScore: 78,
    classificationLabel: 'Cohérente — tendance élevée',
    itemCodes: ['NUT_SIGNAL_01', 'NUT_SIGNAL_03'],
    affectedDecisionIds: ['food_structure'],
    ...overrides,
  };
}

test('phrase 1: only the élevée classification is rewritten', () => {
  const finding = buildCanonicalFinding(domainStub());
  assert.equal(finding.interpretation, 'Les réponses indiquent une tendance élevée et cohérente.');
  assert.equal(finding.coachImpact, 'Cohérente — tendance élevée');

  const weak = buildCanonicalFinding(domainStub({
    level: 'low',
    technicalScore: 20,
    classificationLabel: 'Cohérente — tendance faible',
  }));
  assert.equal(weak.interpretation, 'Les réponses indiquent cohérente — tendance faible.');

  const nutrition = buildNutritionActionCards({ findings: [finding], brief: {} });
  const hungerCard = nutrition.cards.find((card) => card.id === 'hunger');
  assert.ok(hungerCard);
  assert.equal(hungerCard.suggested.includes(BROKEN_PHRASE_1), false);
});

test('phrase 2: only Signal de risque limité is rewritten', () => {
  const limited = buildCanonicalFinding(domainStub({
    domainId: 'emotional_reward_food',
    label: 'Nourriture comme récompense',
    itemCount: 1,
    agreement: 'insufficient',
    evidenceStrength: 'limited',
    level: 'low',
    technicalScore: 28,
    classificationLabel: 'Données limitées',
    itemCodes: ['NUT_EMO_02'],
    affectedDecisionIds: ['food_recovery_protocol'],
  }));
  assert.equal(
    limited.interpretation,
    'Un premier signal suggère un risque limité; à confirmer en entrevue.',
  );
  assert.equal(limited.coachImpact, 'Signal de risque limité');
  assert.equal(limited.interpretation.includes(BROKEN_PHRASE_2), false);

  const clarify = buildCanonicalFinding(domainStub({
    domainId: 'emotional_reward_food',
    label: 'Nourriture comme récompense',
    itemCount: 1,
    agreement: 'insufficient',
    evidenceStrength: 'limited',
    level: 'high',
    technicalScore: 80,
    classificationLabel: 'Données limitées',
    itemCodes: ['NUT_EMO_02'],
    affectedDecisionIds: ['food_recovery_protocol'],
  }));
  assert.equal(
    clarify.interpretation,
    'Un premier signal suggère signal de risque à clarifier; à confirmer en entrevue.',
  );
});

test('phrase 3: only the duplicated tester is removed', () => {
  const plan = buildFourWeekPlanV44({
    brief: {},
    findings: [buildCanonicalFinding(domainStub({
      domainId: 'adherence_recovery',
      label: 'Adhésion et capacité de reprise',
      itemCount: 1,
      agreement: 'insufficient',
      evidenceStrength: 'limited',
      level: 'moderate',
      classificationLabel: 'Données limitées',
      itemCodes: ['EFF_02'],
      affectedDecisionIds: ['recovery_protocol'],
    }))],
  });
  assert.equal(
    plan[2].coachAction,
    'Tester une reprise minimale — le signal d\'adhésion n\'est pas encore conclu.',
  );
  assert.equal(plan[2].coachAction.includes(BROKEN_PHRASE_3), false);
});

test('assembled fixtures do not persist the three broken phrases', () => {
  const extras = {
    clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    clientName: 'Client test KR',
  };
  for (const profile of [V43_COHERENT, V43_MIXED, V43_NUTRITION]) {
    const report = analyzeCompleteMotivationProfileV43(profile, extras).result.report;
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(BROKEN_PHRASE_1), false);
    assert.equal(serialized.includes(BROKEN_PHRASE_2), false);
    assert.equal(serialized.includes(BROKEN_PHRASE_3), false);
  }
});
