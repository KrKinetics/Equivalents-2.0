/**
 * Presentation-only claim consistency.
 * Never mutates a stored analysis snapshot.
 * Web and PDF must consume these helpers — no parallel regexes.
 */

import { inferClaimStrength } from './presentation-labels.mjs';

const QUALIFIED = /\b(hypothèse|pourrait|pourraient|à tester|à vérifier|à confirmer|signal mixte|ne pas conclure|première indication|tendance|observer)\b/i;
const BARE_REPRISE_LEVEL = /Reprise\s*:\s*(élevée|élevé|faible|haute|forte|fragile)\b/i;
const BARE_ADHESION_LEVEL = /Adhésion globale\s*:\s*(élevée|élevé|faible|haute|forte)\b/i;
const RESULTS_AFFIRM = /Moins dépendant des résultats visibles/i;
const LEVEL_WORD = '(élevée|élevé|faible|haute|forte|fragile|accessible)';

const ADHERENCE_IDS = new Set([
  'adherence_recovery',
  'adherence_maintenance',
  'adherence_recovery_signal',
  'adherence_history',
]);
const RESULTS_IDS = new Set([
  'results_orientation',
  'results_delay_sensitivity',
]);

function decapitalize(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function collapseSpaces(value) {
  return String(value || '').replace(/[ \t]+/g, ' ').replace(/\s+\./g, '.').replace(/\n{3,}/g, '\n\n').trim();
}

function findingId(finding = {}) {
  return String(finding.id || finding.key || finding.domain || finding.domainId || '').trim();
}

function findingFamily(finding) {
  const id = findingId(finding);
  const label = `${id} ${finding.label || ''}`;
  if (ADHERENCE_IDS.has(id) || /adhésion|reprise/i.test(label)) return 'adherence';
  if (RESULTS_IDS.has(id) || /résultats visibles|results_orientation/i.test(label)) return 'results';
  if (id === 'coach_receptivity' || /feedback/i.test(label)) return 'feedback';
  if (id === 'nutrition_planning' || /planification alimentaire/i.test(label)) return 'nutrition_planning';
  return id || 'other';
}

function strengthOf(finding) {
  return inferClaimStrength(finding);
}

function isWeakStrength(strength) {
  return strength === 'mixed' || strength === 'divergent';
}

function findingsByFamily(findings = []) {
  const map = new Map();
  for (const finding of findings) {
    map.set(findingFamily(finding), finding);
  }
  return map;
}

function weakFinding(findings, family) {
  const match = (findings || []).find((item) => findingFamily(item) === family);
  return match && isWeakStrength(strengthOf(match)) ? match : null;
}

export function isQualifiedClaim(text) {
  return QUALIFIED.test(String(text || ''));
}

function toCouldClause(value) {
  let text = String(value || '').replace(/\.$/, '').trim();
  text = text.replace(/\bprobablement\b/gi, '').replace(/\s+/g, ' ').trim();
  if (!text) return 'cette lecture pourrait se confirmer.';
  if (/^pourrait/i.test(text)) return `${decapitalize(text)}.`;
  if (/^moins |^peu de |^tolère /i.test(text)) {
    return `pourrait être ${decapitalize(text)}.`;
  }
  if (/^reprise\b/i.test(text)) {
    return `la reprise pourrait être ${decapitalize(text.replace(/^reprise\s+/i, ''))}.`;
  }
  if (/^feedback\b/i.test(text)) {
    return `le feedback direct pourrait être ${decapitalize(text.replace(/^feedback direct\s+/i, ''))}.`;
  }
  if (/mixte/i.test(text)) {
    return 'le signal reste mixte et doit être testé.';
  }
  return `pourrait se confirmer ainsi — ${decapitalize(text)}.`;
}

export function qualifyCoachMeaning(finding, text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const strength = strengthOf(finding);
  if (strength === 'supported' || !strength) return value;
  if (strength === 'divergent') {
    return 'Réponses contradictoires — ne pas conclure sur cette dimension.';
  }
  if (strength === 'mixed') {
    if (/^Hypothèse à tester/i.test(value) && /pourrait|à tester/i.test(value)) return value;
    return `Hypothèse à tester : ${toCouldClause(value)}`.replace(/\.\.$/, '.');
  }
  if (strength === 'single') {
    if (/à confirmer|première indication|tendance|appui limité/i.test(value)) return value;
    return `Première indication à confirmer : ${decapitalize(value)}`;
  }
  return value;
}

function replaceAdherenceNarrative(text, finding) {
  let out = String(text || '');
  if (strengthOf(finding) === 'divergent') {
    return collapseSpaces(out
      .replace(/Adhésion globale\s*:\s*[^.]+?\./gi, 'Les réponses sur l\'adhésion sont contradictoires; ne pas conclure.')
      .replace(/Maintien pendant les semaines chargées\s*:\s*[^.]+?\.\s*/gi, '')
      .replace(/Reprise après interruption\s*:\s*[^.]+?\.\s*/gi, '')
      .replace(BARE_REPRISE_LEVEL, 'reprise — ne pas conclure'));
  }
  if (/Les réponses sur l'adhésion et la reprise sont mixtes/i.test(out)) {
    return collapseSpaces(out.replace(BARE_REPRISE_LEVEL, 'reprise à tester'));
  }
  if (BARE_ADHESION_LEVEL.test(out) || /Reprise après interruption\s*:/i.test(out) || BARE_REPRISE_LEVEL.test(out)) {
    out = out
      .replace(/Adhésion globale\s*:\s*[^.]+?\.\s*/gi, '')
      .replace(/Maintien pendant les semaines chargées\s*:\s*[^.]+?\.\s*/gi, '')
      .replace(/Reprise après interruption\s*:\s*[^.]+?\.\s*/gi, '');
    out = `Les réponses sur l'adhésion et la reprise sont mixtes. Une reprise relativement accessible est une hypothèse à tester dans les premières semaines. ${out}`;
  }
  return collapseSpaces(out.replace(BARE_REPRISE_LEVEL, 'reprise à tester'));
}

export function qualifyNarrativeClaim(findings, text) {
  let out = String(text || '');
  if (!out) return '';
  const adherence = weakFinding(findings, 'adherence');
  if (adherence) out = replaceAdherenceNarrative(out, adherence);
  if (weakFinding(findings, 'results')) {
    out = out.replace(
      RESULTS_AFFIRM,
      'hypothèse à tester : pourrait être moins dépendant des résultats visibles',
    );
    out = out.replace(
      /fortement (?:orientée|influencé)e? vers les résultats/gi,
      'hypothèse à tester : pourrait être orienté vers les résultats visibles',
    );
  }
  if (weakFinding(findings, 'feedback')) {
    out = out.replace(
      /Le feedback direct semble probablement bien accepté/gi,
      'Le feedback direct pourrait être bien accepté — hypothèse à tester',
    );
  }
  return collapseSpaces(out);
}

export function qualifyLegacyPlanLine(findings, text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (weakFinding(findings, 'adherence')) {
    if (/décrochage.*Reprise\s*:/i.test(value) || /Noter à quel moment le décrochage/i.test(value) && /Reprise\s*:/i.test(value)) {
      return 'Noter le moment du décrochage et observer la reprise; le niveau de reprise reste à tester.';
    }
    if (new RegExp(`stratégie de reprise\\s*:\\s*(Reprise\\s*:\\s*)?${LEVEL_WORD}`, 'i').test(value)) {
      return 'Observer la reprise après un écart; le niveau de reprise reste à tester.';
    }
  }
  return qualifyNarrativeClaim(findings, value);
}

function flattenPortrait(portrait = []) {
  return (portrait || []).flatMap((section) => [
    section.title,
    ...(section.paragraphs || []),
  ]).filter(Boolean).join('\n');
}

function flattenPlan(plan = []) {
  return (plan || []).flatMap((week) => [
    week.objective,
    week.focus,
    week.coachAction,
    week.observe,
    week.validationCriterion,
    ...(week.actions || []),
  ]).filter(Boolean).join('\n');
}

function flattenNutrition(nutrition) {
  if (!nutrition) return '';
  return [
    ...(nutrition.lecture || []),
    ...(nutrition.suggested || []),
    ...(nutrition.said || []),
    nutrition.structure,
    ...(nutrition.actions || []),
    ...(nutrition.test || []),
    ...(nutrition.cards || []).flatMap((card) => [card.suggested, card.toTest]),
  ].filter(Boolean).join('\n');
}

function visibleText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sentencesOf(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sentenceViolatesMixed(sentence, family) {
  if (/Direction technique\s*:/i.test(sentence)) return false;
  if (family === 'adherence') {
    if (BARE_REPRISE_LEVEL.test(sentence)) return 'Reprise : <niveau>';
    if (BARE_ADHESION_LEVEL.test(sentence) && !/mixtes|hypothèse|à tester/i.test(sentence)) {
      return 'Adhésion globale : <niveau>';
    }
    if (/Reprise probablement accessible/i.test(sentence) && !isQualifiedClaim(sentence)) {
      return 'Reprise probablement accessible';
    }
  }
  if (family === 'results') {
    if (RESULTS_AFFIRM.test(sentence) && !isQualifiedClaim(sentence)) {
      return 'Moins dépendant des résultats visibles';
    }
  }
  return '';
}

export function assertCrossSectionClaimConsistency({
  findings = [],
  portrait = [],
  plan = [],
  priorities = [],
  nutrition = null,
  pdfText = '',
  html = '',
} = {}) {
  const errors = [];
  const surface = [
    flattenPortrait(portrait),
    flattenPlan(plan),
    ...(priorities || []),
    flattenNutrition(nutrition),
    pdfText,
    visibleText(html),
  ].filter(Boolean).join('\n');

  for (const finding of findings) {
    const strength = strengthOf(finding);
    if (!isWeakStrength(strength)) continue;
    const family = findingFamily(finding);
    for (const sentence of sentencesOf(surface)) {
      const violation = sentenceViolatesMixed(sentence, family);
      if (violation) {
        errors.push(`${findingId(finding) || family}: ${violation} — « ${sentence.slice(0, 120)} »`);
      }
    }
  }
  return errors;
}

export function presentNutritionAction(action, findings) {
  if (!action?.cards?.length) return action || null;
  return {
    ...action,
    cards: action.cards.map((card) => ({
      ...card,
      suggested: qualifyNarrativeClaim(findings, card.suggested),
      toTest: qualifyLegacyPlanLine(findings, card.toTest),
    })),
  };
}

export {
  ADHERENCE_IDS,
  RESULTS_IDS,
  findingsByFamily,
};
