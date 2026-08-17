/**
 * Testable 4-week plan. Consumes canonical findings — never restates a mixed
 * signal as a definitive level.
 */

import { findingByKey } from './findings.mjs';

function week(n, title, objective, coachAction, observe, validationCriterion, provenance) {
  return {
    week: n,
    title,
    objective,
    focus: objective,
    coachAction,
    observe,
    validationCriterion,
    actions: [{ text: coachAction, provenance }],
    provenance: [provenance],
  };
}

function usableText(value) {
  const text = String(value || '').trim();
  if (!text || /^(non répondu|non repondu|n\/a|—|-)$/i.test(text)) return '';
  return text;
}

export function buildFourWeekPlanV44({ brief = {}, findings = [], conflicts = [] }) {
  const adherence = findingByKey(findings, 'adherence_recovery');
  const barrier = usableText(brief.declaredBarriers?.[0]) || 'le contexte réel d\'une semaine normale';
  const recovery = usableText(brief.recoveryStrategy);
  const recoveryNote = adherence?.claimStrength === 'supported'
    ? recovery || 'la reprise déjà plus appuyée'
    : recovery || 'une reprise minimale à tester — le signal d\'adhésion n\'est pas encore conclu';

  return [
    week(
      1,
      'Semaine 1 — Clarifier et définir les indicateurs',
      'Transformer l\'objectif et la réussite déclarés en signes observables.',
      brief.successDefinition
        ? `Définir 2 indicateurs concrets à partir de : ${brief.successDefinition}.`
        : 'Définir 2 indicateurs concrets de réussite pour 8 à 12 semaines.',
      'Ce que l\'athlète nomme comme « ça fonctionne vraiment » et ce qui reste abstrait.',
      'Après 7 jours, le coach et l\'athlète peuvent citer les mêmes 2 signes de réussite.',
      'successDefinition',
    ),
    week(
      2,
      'Semaine 2 — Observer l\'exécution réelle',
      'Voir où l\'horaire ou l\'obstacle déclaré fait décrocher.',
      `Identifier le moment réel où ${barrier} fait décrocher l'entraînement.`,
      'Jour, contexte, durée disponible, réaction après l\'écart.',
      'Après 7 jours, le coach peut décrire au moins un scénario réel de décrochage et une stratégie de reprise testable.',
      'declaredBarriers',
    ),
    week(
      3,
      'Semaine 3 — Tester le style et la reprise',
      'Calibrer communication, choix et reprise sans conclure trop tôt.',
      `Tester ${recoveryNote}.`,
      'Réponse au feedback, utilité des choix, délai avant de reprendre.',
      adherence?.claimStrength === 'mixed' || adherence?.claimStrength === 'single'
        ? 'Le coach peut décrire une reprise observée; le niveau d\'adhésion reste à tester.'
        : 'Le coach peut confirmer ou ajuster le protocole de reprise.',
      'recoveryStrategy',
    ),
    week(
      4,
      'Semaine 4 — Comparer aux hypothèses',
      'Valider ou ajuster le cadre avant le bloc suivant.',
      conflicts[0]
        ? `Comparer l'hypothèse « ${conflicts[0].title} » aux comportements observés.`
        : 'Comparer les comportements observés aux hypothèses initiales.',
      'Écarts réels, reprise, utilité de la structure, focus alimentaire.',
      'Le coach peut garder, ajuster ou abandonner chaque hypothèse avec un exemple observé.',
      'itemsToValidate',
    ),
  ];
}
