import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asPresentedCoachAction,
  findingPrimaryLabel,
  findingStatusLabel,
  findingTechnicalDirection,
  hasNutritionContent,
  isTestableFourWeekPlan,
  localizeTendency,
  organizeLegacyNutrition,
} from '../../src/coach/motivation/report/presentation-labels.mjs';

test('localizes raw English tendencies without changing storage keys', () => {
  assert.equal(localizeTendency('low'), 'faible');
  assert.equal(localizeTendency('moderate'), 'modérée');
  assert.equal(localizeTendency('high'), 'élevée');
  assert.equal(localizeTendency('élevé'), 'élevée');
});

test('mixed and divergent findings use Coach-facing primary labels', () => {
  assert.equal(findingPrimaryLabel({ claimStrength: 'mixed', level: 'high' }), 'Signal mixte');
  assert.equal(findingStatusLabel({ claimStrength: 'mixed' }), 'À TESTER');
  assert.equal(findingTechnicalDirection({ claimStrength: 'mixed', level: 'high' }), 'Direction technique : élevée');
  assert.equal(findingPrimaryLabel({ claimStrength: 'divergent', level: 'high' }), 'Réponses contradictoires');
  assert.equal(findingStatusLabel({ claimStrength: 'divergent' }), 'NE PAS CONCLURE');
  assert.equal(findingPrimaryLabel({ claimStrength: 'single', level: 'high' }), 'Tendance élevée');
  assert.equal(findingStatusLabel({ claimStrength: 'single' }), 'À CONFIRMER');
  assert.equal(
    findingPrimaryLabel({ displayLabel: 'Tendance élevée', claimStrength: 'supported', level: 'high' }),
    'Tendance élevée',
  );
});

test('explanatory coach priorities become actions', () => {
  assert.equal(
    asPresentedCoachAction('Le lien alimentation-performance paraît élevé pour cet athlète.'),
    'Ancrer les premières interventions nutritionnelles sur les bénéfices concrets en séance et en récupération.',
  );
  assert.equal(asPresentedCoachAction('Comment préférez-vous être encadré?'), '');
});

test('legacy nutrition is organized without inventing content', () => {
  const organized = organizeLegacyNutrition({
    lecture: [
      'Le lien alimentation-performance paraît élevé.',
      'Une seule réponse appuie le besoin de structure.',
      'Les repas familiaux structurent déjà une partie de la semaine.',
    ],
    structure: 'Cadre souple avec 2 repas planifiés',
    obstacles: ['Budget'],
    actions: ['Tester une préparation le dimanche'],
  }, { nutritionFocus: 'mieux planifier sans dépasser mon budget' });
  assert.deepEqual(organized.said, ['mieux planifier sans dépasser mon budget']);
  assert.ok(organized.suggested.includes('Les repas familiaux structurent déjà une partie de la semaine.'));
  assert.ok(organized.evidenceNote);
  assert.equal(organized.confirm[0], 'Cadre souple avec 2 repas planifiés');
  assert.equal(hasNutritionContent(organized), true);
  assert.equal(hasNutritionContent(null), false);
  assert.equal(isTestableFourWeekPlan([
    { observe: 'x', validationCriterion: 'y', coachAction: 'z' },
  ]), true);
  assert.equal(isTestableFourWeekPlan([
    { objective: 'x', actions: ['y'] },
  ]), false);
});
