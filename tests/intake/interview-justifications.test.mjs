import test from 'node:test';
import assert from 'node:assert/strict';
import { presentInterviewWhy } from '../../src/coach/motivation/report/interview-justifications.mjs';

test('generic adherence copy is replaced by a question-specific why', () => {
  const generic = 'Identifie le moment et le contexte où l\'adhésion casse.';
  assert.equal(
    presentInterviewWhy({ text: 'Quel est l\'impact du budget sur vos repas?', whyItMatters: generic }),
    'Précise où le coût limite concrètement les choix ou la régularité.',
  );
  assert.equal(
    presentInterviewWhy({ text: 'Quand le stress change-t-il vos portions?', whyItMatters: generic }),
    'Permet d\'identifier les situations émotionnelles qui modifient les repas, portions ou décisions.',
  );
  assert.equal(
    presentInterviewWhy({ text: 'Quels repas familiaux sont non négociables?', whyItMatters: generic }),
    'Repère les contextes où l\'environnement social entre en conflit avec les intentions.',
  );
  assert.equal(
    presentInterviewWhy({ text: 'Quels moments de votre horaire variable rendent la préparation difficile?', whyItMatters: generic }),
    'Repère le moment réel où l\'organisation de la semaine fait décrocher l\'exécution.',
  );
});

test('already specific justifications are preserved', () => {
  assert.equal(
    presentInterviewWhy({
      text: 'Quel est l\'impact du budget sur vos repas?',
      whyItMatters: 'Déjà une justification Coach précise.',
    }),
    'Déjà une justification Coach précise.',
  );
});
