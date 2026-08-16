function action(text, provenance) {
  return { text, provenance };
}

function uniqueActions(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.text || seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  });
}

export function buildFourWeekPlanV43({
  brief,
  choiceApproach,
  conflicts = [],
  recoveryStrategy,
  nutritionFocus,
}) {
  const week1 = uniqueActions([
    brief.primaryGoal
      ? action(`Clarifier l'objectif prioritaire : ${brief.primaryGoal}.`, 'primaryGoal')
      : null,
    brief.whyNow
      ? action(`Relier cet objectif au « pourquoi maintenant » déclaré.`, 'whyNow')
      : action('Confirmer pourquoi cet objectif compte maintenant.', 'whyNow'),
    brief.successDefinition
      ? action(`Définir les indicateurs de réussite à partir de : ${brief.successDefinition}.`, 'successDefinition')
      : action('Définir 2 à 3 signes concrets de réussite pour 8 à 12 semaines.', 'successDefinition'),
  ]);

  const week2 = uniqueActions([
    brief.declaredBarriers?.length
      ? action(`Observer le contexte réel de : ${brief.declaredBarriers[0]}.`, 'declaredBarriers')
      : action('Observer l\'exécution réelle sur une semaine normale.', 'declaredBarriers'),
    brief.likelyDropoffPattern
      ? action(`Noter à quel moment le décrochage apparaît : ${brief.likelyDropoffPattern}.`, 'likelyDropoffPattern')
      : null,
    conflicts[0]
      ? action(`Tester la contradiction : ${conflicts[0].coachImplication}.`, conflicts[0].id)
      : null,
  ]);

  const week3 = uniqueActions([
    brief.communicationPreference
      ? action(`Tester le style de communication : ${brief.communicationPreference}.`, 'communicationPreference')
      : action('Tester le style de coaching et ajuster le feedback.', 'communicationPreference'),
    recoveryStrategy || brief.recoveryStrategy
      ? action(`Tester la stratégie de reprise : ${recoveryStrategy || brief.recoveryStrategy}.`, 'recoveryStrategy')
      : action('Tester une procédure minimale de reprise après un écart.', 'recoveryStrategy'),
    choiceApproach?.label
      ? action(`Calibrer l'approche des choix : ${choiceApproach.label}.`, 'choiceApproach')
      : null,
  ]);

  const week4 = uniqueActions([
    action('Comparer les comportements observés aux hypothèses initiales.', 'itemsToValidate'),
    brief.progressSignals?.length
      ? action(`Revoir les indicateurs de progrès déclarés : ${brief.progressSignals[0]}.`, 'progressSignals')
      : action('Revoir les indicateurs de progrès avec l\'athlète.', 'progressSignals'),
    nutritionFocus
      ? action(`Ajuster le focus alimentaire : ${nutritionFocus}.`, 'nutritionFocus')
      : null,
  ]);

  return [
    {
      week: 1,
      title: 'Semaine 1 — Clarifier + définir les indicateurs',
      objective: 'Clarifier le but et les signes de réussite.',
      focus: 'Clarifier + définir les indicateurs de réussite.',
      actions: week1,
    },
    {
      week: 2,
      title: 'Semaine 2 — Observer l\'exécution réelle',
      objective: 'Voir le contexte des écarts, pas seulement le plan.',
      focus: 'Observer l\'exécution réelle et le contexte des écarts.',
      actions: week2,
    },
    {
      week: 3,
      title: 'Semaine 3 — Tester le style et la reprise',
      objective: 'Calibrer coaching et protocole de reprise.',
      focus: 'Tester le style de coaching et la stratégie de reprise.',
      actions: week3,
    },
    {
      week: 4,
      title: 'Semaine 4 — Comparer aux hypothèses',
      objective: 'Valider ou ajuster le cadre avant le bloc suivant.',
      focus: 'Comparer les comportements observés aux hypothèses initiales.',
      actions: week4,
    },
  ];
}
