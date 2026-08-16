import { displaySignal } from './evidence.mjs';

const RISK_DOMAINS = new Set([
  'all_or_nothing',
  'option_overload',
  'compensatory_food',
  'emotional_stress_food',
  'emotional_reward_food',
  'results_delay_sensitivity',
]);

const SUPPORTIVE_DOMAINS = new Set([
  'autonomous_motivation',
  'autonomous_value_without_results',
  'adherence_recovery',
  'adherence_maintenance',
  'adherence_recovery_signal',
  'adherence_history',
  'delay_tolerance',
  'long_term_projection',
  'food_flexibility',
  'nutrition_planning',
  'hunger_signals',
  'nutrition_value',
  'performance_fueling',
]);

const CONTEXT_DOMAINS = new Set([
  'structure_need',
  'explanation_need',
  'choice_interest',
  'coach_receptivity',
  'nutrition_structure',
  'results_orientation',
]);

const MEANING = {
  structure_need: {
    high: 'Structure probablement utile',
    moderate: 'Structure à calibrer',
    low: 'Peu de structure formelle probablement nécessaire',
  },
  option_overload: {
    high: 'Surcharge de choix à surveiller',
    moderate: 'Nombre d\'options à garder limité',
    low: 'Tolère probablement plusieurs options',
  },
  emotional_stress_food: {
    high: 'Influence du stress à surveiller',
    moderate: 'Stress alimentaire à clarifier',
    low: 'Peu de perturbation alimentaire sous stress signalée',
  },
  compensatory_food: {
    high: 'Réaction compensatoire à surveiller',
    moderate: 'Compensation possible après un écart',
    low: 'Peu de compensation signalée',
  },
  all_or_nothing: {
    high: 'Fonctionnement tout-ou-rien à encadrer',
    moderate: 'Rigidité possible après un écart',
    low: 'Reprise probablement plus souple',
  },
  coach_receptivity: {
    high: 'Feedback direct probablement bien reçu',
    moderate: 'Feedback direct à calibrer',
    low: 'Feedback direct à calibrer',
  },
  results_orientation: {
    high: 'Résultats visibles probablement influents',
    moderate: 'Résultats visibles à relier à d\'autres indicateurs',
    low: 'Moins dépendant des résultats visibles',
  },
  adherence_recovery: {
    high: 'Reprise probablement accessible',
    moderate: 'Reprise à sécuriser',
    low: 'Reprise à protocoler',
  },
};

function directionFor(domainId) {
  if (RISK_DOMAINS.has(domainId)) return 'risk';
  if (SUPPORTIVE_DOMAINS.has(domainId)) return 'supportive';
  if (CONTEXT_DOMAINS.has(domainId)) return 'context';
  return 'neutral';
}

function meaningFor(domain) {
  const table = MEANING[domain.domainId];
  const level = domain.level === 'high' || domain.level === 'low' ? domain.level : 'moderate';
  if (table?.[level]) return table[level];
  if (directionFor(domain.domainId) === 'risk') {
    return level === 'high' ? 'Signal de risque à clarifier' : 'Signal de risque limité';
  }
  return domain.classificationLabel || domain.label;
}

export function presentDomain(domain) {
  const signal = displaySignal(domain);
  return {
    domainId: domain.domainId,
    label: domain.label,
    itemCount: domain.itemCount,
    agreement: domain.agreement,
    evidenceStrength: domain.evidenceStrength,
    level: domain.level,
    technicalScore: domain.technicalScore ?? null,
    displayScore: signal.score,
    displayLabel: signal.label,
    evidenceBadge: signal.badge,
    signalDirection: directionFor(domain.domainId),
    coachMeaning: meaningFor(domain),
    changesCoaching: Boolean(domain.affectedDecisionIds?.length)
      && (domain.itemCount > 0)
      && (domain.level === 'high' || domain.level === 'low' || domain.agreement === 'mixed' || domain.itemCount === 1),
  };
}

export function presentDomains(domains) {
  return (domains || []).map(presentDomain);
}
