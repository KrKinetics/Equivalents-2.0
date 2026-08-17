import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCrossSectionClaimConsistency,
  qualifyCoachMeaning,
  qualifyLegacyPlanLine,
  qualifyNarrativeClaim,
} from '../../src/coach/motivation/report/presentation-claim-consistency.mjs';

const mixedAdherence = {
  id: 'adherence_recovery',
  label: 'Adhésion et capacité de reprise',
  claimStrength: 'mixed',
};
const mixedResults = {
  id: 'results_orientation',
  label: 'Importance des résultats visibles',
  claimStrength: 'mixed',
};
const supportedAdherence = {
  id: 'adherence_recovery',
  label: 'Adhésion et capacité de reprise',
  claimStrength: 'supported',
};

test('mixed coach meanings become hypotheses, supported stay affirmative', () => {
  assert.equal(
    qualifyCoachMeaning(mixedAdherence, 'Reprise probablement accessible'),
    'Hypothèse à tester : la reprise pourrait être accessible.',
  );
  assert.equal(
    qualifyCoachMeaning(mixedResults, 'Moins dépendant des résultats visibles'),
    'Hypothèse à tester : pourrait être moins dépendant des résultats visibles.',
  );
  assert.equal(
    qualifyCoachMeaning(supportedAdherence, 'Reprise probablement accessible'),
    'Reprise probablement accessible',
  );
  assert.match(
    qualifyCoachMeaning({ id: 'x', claimStrength: 'divergent' }, 'Reprise probablement accessible'),
    /ne pas conclure/i,
  );
});

test('mixed portrait and plan lines lose bare reprise levels', () => {
  const portrait = qualifyNarrativeClaim(
    [mixedAdherence],
    'Adhésion globale : élevée à confirmer. Maintien pendant les semaines chargées : élevée à confirmer. Reprise après interruption : élevée.',
  );
  assert.match(portrait, /réponses sur l'adhésion et la reprise sont mixtes/i);
  assert.match(portrait, /hypothèse à tester/i);
  assert.doesNotMatch(portrait, /Adhésion globale\s*:\s*élevée/i);
  assert.doesNotMatch(portrait, /Reprise\s*:\s*élevée/i);
  const plan = qualifyLegacyPlanLine(
    [mixedAdherence],
    'Noter à quel moment le décrochage apparaît : Reprise : élevée.',
  );
  assert.match(plan, /observer la reprise/i);
  assert.match(plan, /à tester/i);
  assert.doesNotMatch(plan, /Reprise\s*:\s*élevée/i);
});

test('cross-section assertion catches mixed + strong directional claim', () => {
  const errors = assertCrossSectionClaimConsistency({
    findings: [mixedAdherence, mixedResults],
    portrait: [{ title: 'x', paragraphs: ['Reprise : élevée.'] }],
    plan: [{ actions: ['Moins dépendant des résultats visibles'] }],
    html: '<p>Reprise : élevée</p>',
    pdfText: 'Moins dépendant des résultats visibles',
  });
  assert.ok(errors.some((item) => /Reprise/.test(item)));
  assert.ok(errors.some((item) => /Moins dépendant/.test(item)));
  const clean = assertCrossSectionClaimConsistency({
    findings: [mixedAdherence],
    portrait: [{
      title: 'x',
      paragraphs: ['Les réponses sur l\'adhésion et la reprise sont mixtes. Une reprise relativement accessible est une hypothèse à tester.'],
    }],
    plan: [{ actions: ['Noter le moment du décrochage et observer la reprise; le niveau de reprise reste à tester.'] }],
  });
  assert.deepEqual(clean, []);
});
