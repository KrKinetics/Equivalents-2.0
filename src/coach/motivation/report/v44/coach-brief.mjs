/**
 * Operational page-1 coach brief. Facts vs hypotheses vs tests.
 */

import { asCoachAction } from './language.mjs';
import { findingByKey } from './findings.mjs';

function text(value) {
  return String(value || '').trim();
}

export function buildCoachDecisionBrief({ brief = {}, findings = [], conflicts = [], interview = [] }) {
  const adherence = findingByKey(findings, 'adherence_recovery');
  const structure = findingByKey(findings, 'structure_need');
  const overload = findingByKey(findings, 'option_overload');
  const results = findingByKey(findings, 'results_orientation');

  const startActions = [
    brief.successDefinition
      ? `Définir 2 signes observables à partir de : ${brief.successDefinition}.`
      : 'Définir 2 signes concrets de réussite pour 8 à 12 semaines.',
    brief.declaredBarriers?.[0]
      ? `Identifier où « ${brief.declaredBarriers[0]} » fait décrocher une séance.`
      : 'Observer une semaine normale avant d\'ajouter de la complexité.',
    brief.recoveryStrategy && !/^(non répondu|non repondu)$/i.test(brief.recoveryStrategy)
      ? `Tester une reprise minimale : ${brief.recoveryStrategy}.`
      : (adherence?.claimStrength === 'mixed' || adherence?.claimStrength === 'single'
        ? 'Tester une reprise minimale après un écart, sans conclure sur la capacité de reprise.'
        : 'Installer une reprise minimale après un écart.'),
  ].map(asCoachAction).filter(Boolean).slice(0, 3);

  const avoidAtStart = [
    (overload?.tendency === 'élevé' && (overload?.claimStrength === 'supported' || overload?.claimStrength === 'single'))
      ? 'Éviter un menu de choix trop large dès la première semaine.'
      : null,
    results?.claimStrength === 'single' || results?.claimStrength === 'mixed'
      ? 'Éviter de lier l\'engagement uniquement aux résultats visibles.'
      : null,
    structure?.claimStrength !== 'supported'
      ? 'Éviter d\'imposer un cadre trop rigide avant d\'avoir vu l\'exécution réelle.'
      : null,
    'Éviter de présenter un signal unique comme une certitude.',
  ].filter(Boolean).slice(0, 3);

  const confirmNow = [
    brief.whyNow ? null : 'Pourquoi cet objectif compte maintenant.',
    adherence?.validationNeeded ? 'Comment l\'athlète reprend réellement après un écart.' : null,
    conflicts[0]?.validationQuestion || null,
    ...(interview || []).map((item) => item.text),
  ].filter(Boolean).slice(0, 3);

  return {
    athleteGoal: text(brief.primaryGoal) || null,
    successDescribed: text(brief.successDefinition) || null,
    whyNow: text(brief.whyNow) || null,
    whyNowCaptured: Boolean(text(brief.whyNow)),
    startActions,
    avoidAtStart,
    confirmNow,
    source: {
      athleteSaid: [brief.primaryGoal, brief.successDefinition, brief.whyNow, ...(brief.declaredBarriers || [])].filter(Boolean),
      suggested: [adherence?.interpretation, results?.interpretation].filter(Boolean),
      toTest: confirmNow,
    },
  };
}

export function buildCoachPrioritiesV44({ brief, decisionBrief, findings = [] }) {
  const actions = [
    ...(decisionBrief.startActions || []),
    brief.nutritionFocus
      ? `Préciser le levier alimentaire déclaré : ${brief.nutritionFocus}.`
      : null,
    findings.find((item) => item.key === 'nutrition_planning' && item.claimStrength === 'supported')
      ? 'Utiliser la planification alimentaire déjà mieux appuyée comme levier initial.'
      : null,
  ].map(asCoachAction).filter(Boolean);
  const seen = new Set();
  return actions.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  }).slice(0, 3);
}
