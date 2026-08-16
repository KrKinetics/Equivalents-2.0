import {
  buildCoachingStyleNarrative,
  buildDeviationReactionNarrative,
  buildMaintenanceRecoveryNarrative,
  buildMotivationHorizonNarrative as buildMotivationHorizonNarrativeV42,
} from '../v42/narrative.mjs';
import { canMakeStrongClaim } from './evidence.mjs';

function d(domains, id) {
  return domains.find((item) => item.domainId === id);
}

export function buildMotivationHorizonNarrative(domains) {
  const results = d(domains, 'results_orientation');
  if (results?.level === 'high' && !canMakeStrongClaim(results)) {
    const delay = d(domains, 'results_delay_sensitivity');
    const longTerm = d(domains, 'long_term_projection');
    const parts = [
      'Un premier signal suggère que les résultats visibles pourraient jouer un rôle important dans la motivation; à confirmer avec l\'athlète.',
    ];
    if (delay?.itemCount) {
      parts.push(delay.itemCount === 1
        ? 'Cette réponse indique possiblement une sensibilité au délai avant les résultats.'
        : 'Les réponses indiquent une sensibilité au délai avant les résultats à calibrer.');
    }
    if (longTerm?.itemCount === 1) {
      parts.push('La projection à long terme reste à confirmer en entrevue.');
    } else if (longTerm?.itemCount) {
      parts.push('Le profil montre une projection à long terme à relier aux indicateurs de réussite.');
    }
    return parts.join(' ');
  }
  return buildMotivationHorizonNarrativeV42(domains);
}

export function buildSportNarrativeSectionsV43(domains, choiceApproach, options = {}) {
  const wellbeingIntro = options.hasWellbeingGoal
    ? 'Le bien-être est un objectif déclaré à préciser en dimensions observables; il ne doit pas être remplacé par un objectif de force ou d\'apparence. '
    : '';
  return [
    {
      key: 'v43-motivation-support',
      title: 'Ce qui semble soutenir la motivation',
      paragraphs: [`${wellbeingIntro}${buildMotivationHorizonNarrative(domains)}`],
    },
    {
      key: 'v43-maintenance-recovery',
      title: 'Maintien et capacité de reprise',
      paragraphs: [buildMaintenanceRecoveryNarrative(domains)],
    },
    {
      key: 'v43-deviation-reaction',
      title: 'Réaction probable après un écart',
      paragraphs: [buildDeviationReactionNarrative(domains)],
    },
    {
      key: 'v43-coaching-style',
      title: 'Style de coaching recommandé',
      paragraphs: [buildCoachingStyleNarrative(domains, choiceApproach)],
    },
  ];
}
