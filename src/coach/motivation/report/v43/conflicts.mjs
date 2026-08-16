import { detectCrossSourceConflictsV42 } from '../v42/conflicts.mjs';

function textOf(openAnswers, code) {
  const row = (openAnswers || []).find((item) => item.questionCode === code);
  return String(row?.originalAnswer || '').trim();
}

export function buildFirstClassConflictsV43({ domains, obstacles, openAnswers, existing = [] }) {
  const detected = existing.length
    ? existing
    : detectCrossSourceConflictsV42({ domains, obstacles });
  const mapped = detected.map((conflict) => {
    if (conflict.id === 'nutrition_planning_declared_gap') {
      return {
        id: conflict.id,
        title: 'CONTRADICTION À CLARIFIER',
        sourceA: 'Réponses fermées : planification alimentaire plutôt favorable',
        sourceB: 'Déclaration : manque de planification comme obstacle',
        coachImplication: 'Perception de capacité vs problème rencontré en situation réelle',
        validationQuestion: conflict.validationQuestion,
        priority: conflict.priority || 'high',
        message: conflict.message,
      };
    }
    return {
      id: conflict.id,
      title: 'CONTRADICTION À CLARIFIER',
      sourceA: (conflict.calculatedDomainIds || []).join(', ') || 'Signal calculé',
      sourceB: (conflict.directSourceCodes || []).join(', ') || 'Déclaration',
      coachImplication: conflict.message,
      validationQuestion: conflict.validationQuestion,
      priority: conflict.priority || 'moderate',
      message: conflict.message,
    };
  });

  const goal = textOf(openAnswers, 'GOAL_01');
  const success = textOf(openAnswers, 'GOAL_02');
  if (goal && success && /bien-[eê]tre|sant[eé]/i.test(goal) && /poids|miroir|abdos?/i.test(success)) {
    mapped.push({
      id: 'goal_success_mismatch',
      title: 'CONTRADICTION À CLARIFIER',
      sourceA: `Objectif déclaré : ${goal}`,
      sourceB: `Critère de réussite : ${success}`,
      coachImplication: 'L\'objectif exprimé et le critère de réussite ne parlent pas du même résultat.',
      validationQuestion: 'Si le bien-être s\'améliore sans changement visible dans le miroir, considérerez-vous que ça fonctionne?',
      priority: 'high',
      message: 'Objectif et critère de réussite divergent.',
    });
  }
  return mapped;
}
