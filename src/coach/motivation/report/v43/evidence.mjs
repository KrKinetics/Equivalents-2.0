/**
 * Evidence gating for report-model-v4.3.
 * Single-item domains never produce a precise 0-100 claim in the coach report.
 */

export function canMakeStrongClaim(domain) {
  if (!domain) return false;
  return domain.itemCount >= 2
    && (domain.agreement === 'consistent')
    && domain.evidenceStrength !== 'limited'
    && domain.evidenceStrength !== 'contradictory'
    && domain.level !== 'uncertain';
}

export function signalBand(domain) {
  const score = Number(domain?.technicalScore);
  if (!Number.isFinite(score)) return 'modéré';
  if (score >= 70) return 'élevé';
  if (score <= 35) return 'faible';
  return 'modéré';
}

export function displaySignal(domain) {
  if (!domain || domain.itemCount === 0) {
    return {
      kind: 'missing',
      label: 'Signal non établi',
      score: null,
      badge: 'À documenter',
      voice: 'single',
    };
  }
  if (domain.itemCount === 1) {
    return {
      kind: 'single',
      label: `Signal ${signalBand(domain)}`,
      score: null,
      badge: 'Donnée unique — à confirmer',
      voice: 'single',
      technicalScore: domain.technicalScore ?? null,
    };
  }
  if (domain.agreement === 'mixed' || domain.agreement === 'strongly_divergent') {
    return {
      kind: 'mixed',
      label: domain.agreement === 'strongly_divergent' ? 'Tendance à confirmer' : 'Signal mixte',
      score: null,
      badge: domain.agreementLabel || 'Mixte',
      voice: 'mixed',
      technicalScore: domain.technicalScore ?? null,
    };
  }
  return {
    kind: 'coherent',
    label: 'Cohérente',
    score: domain.technicalScore ?? null,
    badge: domain.agreementLabel || 'Cohérente',
    voice: 'coherent',
    technicalScore: domain.technicalScore ?? null,
  };
}

export function narrativeVoice(domain) {
  if (!canMakeStrongClaim(domain)) return 'single';
  return 'coherent';
}

export function singleItemLead(text) {
  return `Un premier signal suggère ${text}`;
}
