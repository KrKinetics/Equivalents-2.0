/**
 * Single structured finding per dimension for report-model-v4.4.
 * Web, PDF, brief, nutrition, priorities and plan consume this source only.
 */

import { canMakeStrongClaim, signalBand } from '../v43/evidence.mjs';
import { presentDomain } from '../v43/dimension-presentation.mjs';

export function claimStrengthFor(domain) {
  if (!domain || domain.itemCount === 0) return 'missing';
  if (domain.agreement === 'strongly_divergent') return 'divergent';
  if (domain.agreement === 'mixed') return 'mixed';
  if (domain.itemCount === 1) return 'single';
  if (canMakeStrongClaim(domain)) return 'supported';
  return 'single';
}

export function tendencyFor(domain) {
  const strength = claimStrengthFor(domain);
  if (strength === 'divergent') return 'contradictoire';
  if (strength === 'mixed') return 'mixte';
  if (strength === 'missing') return 'non établi';
  return signalBand(domain);
}

export function confidenceFor(domain) {
  const strength = claimStrengthFor(domain);
  if (strength === 'divergent') return 'contradictoire';
  if (strength === 'mixed') return 'à tester';
  if (strength === 'single' || domain?.evidenceStrength === 'limited') return 'faible';
  if (strength === 'supported' && domain.evidenceStrength === 'strong') return 'robuste';
  if (strength === 'supported') return 'utilisable';
  return 'faible';
}

export function confidenceStatus(domain) {
  const strength = claimStrengthFor(domain);
  if (strength === 'divergent') return 'NE PAS CONCLURE';
  if (strength === 'mixed') return 'À TESTER';
  if (strength === 'single') return 'À CONFIRMER';
  if (strength === 'supported') return 'APPUYÉE';
  return 'À DOCUMENTER';
}

function interpretationFor(domain, presented, strength) {
  const meaning = presented.coachMeaning || domain.classificationLabel || domain.label;
  if (strength === 'divergent') {
    return `Les réponses sont contradictoires pour ${domain.label}; ne pas conclure avant clarification.`;
  }
  if (strength === 'mixed') {
    return `Signal mixte pour ${domain.label} — hypothèse à tester, pas une conclusion.`;
  }
  if (strength === 'single') {
    return `Un premier signal suggère ${meaning.toLowerCase()}; à confirmer en entrevue.`;
  }
  if (strength === 'missing') {
    return `${domain.label} n'est pas encore documenté.`;
  }
  return `Les réponses indiquent ${meaning.toLowerCase()}.`;
}

export function buildCanonicalFinding(domain) {
  const presented = presentDomain(domain);
  const claimStrength = claimStrengthFor(domain);
  return {
    key: domain.domainId,
    domain: domain.domainId,
    label: domain.label,
    rawScore: domain.technicalScore ?? null,
    direction: presented.signalDirection,
    evidenceClass: claimStrength,
    evidenceCount: domain.itemCount ?? 0,
    consistency: domain.agreement || 'insufficient',
    confidence: confidenceFor(domain),
    claimStrength,
    tendency: tendencyFor(domain),
    confidenceStatus: confidenceStatus(domain),
    interpretation: interpretationFor(domain, presented, claimStrength),
    coachImpact: presented.coachMeaning,
    validationNeeded: claimStrength !== 'supported',
    validationQuestion: claimStrength === 'supported'
      ? null
      : `Comment ${domain.label.toLowerCase()} se manifeste-t-il concrètement dans une semaine normale?`,
    sourceQuestionIds: [...(domain.itemCodes || domain.coreCodes || [])],
    verbatimRefs: [],
    displayScore: presented.displayScore,
    displayLabel: presented.displayLabel,
    evidenceBadge: presented.evidenceBadge,
    changesCoaching: presented.changesCoaching,
  };
}

export function buildCanonicalFindings(domains) {
  return (domains || []).map(buildCanonicalFinding);
}

export function findingByKey(findings, key) {
  return (findings || []).find((item) => item.key === key || item.domain === key) || null;
}

export function claimLabel(finding) {
  if (!finding) return 'non établi';
  if (finding.claimStrength === 'divergent') return 'contradictoire';
  if (finding.claimStrength === 'mixed') return 'mixte';
  if (finding.claimStrength === 'single') return `tendance ${finding.tendency}`;
  if (finding.claimStrength === 'supported') return `tendance ${finding.tendency}`;
  return 'non établi';
}
