/**
 * Canonical presentation model for the Coach motivation report.
 * Web and PDF format this model. Neither renderer may drop substance.
 */

import { hasNutritionContent, isTestableFourWeekPlan } from './presentation-labels.mjs';
import { buildCoachNarrative } from './build-coach-narrative.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function count(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return 1;
  return value ? 1 : 0;
}

function lowerInitial(value) {
  const raw = text(value);
  if (!raw) return '';
  return `${raw.charAt(0).toLocaleLowerCase('fr-CA')}${raw.slice(1)}`;
}

function normalizeComparable(value) {
  return text(value)
    .toLocaleLowerCase('fr-CA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function operationalStructureValue(vm = {}) {
  return text((vm.quickRead || []).find((item) => item?.id === 'structure')?.value);
}

function operatingRows(brief = {}, operationalStructure = '') {
  return [
    ['Objectif prioritaire', brief.primaryGoal],
    ['Pourquoi maintenant', brief.whyNow],
    ['Définition de réussite', brief.successDefinition],
    ['Reprise', brief.recoveryStrategy],
    ['Structure', operationalStructure ? `Structure recommandée : ${operationalStructure}` : brief.structurePreference],
    ['Choix', brief.choicePreference],
    ['Communication', brief.communicationPreference],
    ['Focus alimentaire', brief.nutritionFocus],
  ].filter(([, value]) => value);
}

function technicalRows(provenance = {}, identity = {}) {
  return [
    ['Questionnaire', provenance.questionnaireVersion],
    ['Ruleset', provenance.rulesetVersion],
    ['Modèle de rapport', provenance.reportModelVersion],
    ['Version d’analyse', provenance.analysisVersion != null ? String(provenance.analysisVersion) : ''],
    ['Référence client', identity?.shortId],
    ['Empreinte', provenance.contentHash],
    ['Renderer PDF', provenance.pdfRenderer],
    ['Soumission', provenance.submittedAt],
    ['Analyse', provenance.analyzedAt],
  ].filter(([, value]) => value);
}

function flattenDimensionCount(groups = []) {
  return groups.reduce((sum, group) => sum + (group.items || []).length, 0);
}

function tendencyLabel(row = {}) {
  const level = text(row.level).toLocaleLowerCase('fr-CA');
  const byLevel = {
    low: 'faible',
    moderate: 'modérée',
    high: 'élevée',
    faible: 'faible',
    moderee: 'modérée',
    modérée: 'modérée',
    elevee: 'élevée',
    élevée: 'élevée',
  };
  if (byLevel[level]) return byLevel[level];
  const fallback = `${text(row.displayLabel)} ${text(row.tendency)} ${text(row.coachMeaning)} ${text(row.interpretation)}`;
  const match = fallback.match(/\b(faible|modérée|élevée|low|moderate|high)\b/i);
  if (!match) return '';
  return byLevel[match[1].toLocaleLowerCase('fr-CA')] || match[1].toLocaleLowerCase('fr-CA');
}

function polishDimensionMeaning(row = {}) {
  const raw = text(row.coachMeaning || row.interpretation);
  if (!raw) return raw;
  const direction = tendencyLabel(row);
  if (/donnée unique/i.test(raw) && /appui limité/i.test(raw)) {
    return direction
      ? `Appui limité : une seule réponse oriente vers une tendance ${direction}; à confirmer en entrevue.`
      : 'Appui limité : une seule réponse oriente cette lecture; à confirmer en entrevue.';
  }
  const coherent = raw.match(/Les réponses indiquent\s+cohérent(?:e|es|s)?\s*[—-]\s*tendance\s+([^.]+)\.?/i);
  if (coherent) {
    const cleanDirection = direction || text(coherent[1]);
    return `Les réponses convergent vers une tendance ${cleanDirection}.`;
  }
  const singleSignalCopy = [
    [/^Un premier signal suggère\s+signal de risque limité;?\s*à confirmer en entrevue\.?$/i,
      'Un premier signal suggère que le risque semble limité; à confirmer en entrevue.'],
    [/^Un premier signal suggère\s+structure probablement utile;?\s*à confirmer en entrevue\.?$/i,
      'Un premier signal suggère que la structure pourrait être utile; à confirmer en entrevue.'],
    [/^Un premier signal suggère\s+surcharge de choix à surveiller;?\s*à confirmer en entrevue\.?$/i,
      'Un premier signal suggère que la surcharge de choix mérite d’être surveillée; à confirmer en entrevue.'],
    [/^Un premier signal suggère\s+feedback direct probablement bien reçu;?\s*à confirmer en entrevue\.?$/i,
      'Un premier signal suggère que le feedback direct pourrait être bien reçu; à confirmer en entrevue.'],
    [/^Un premier signal suggère\s+influence du stress à surveiller;?\s*à confirmer en entrevue\.?$/i,
      'Un premier signal suggère que l’influence du stress mérite d’être surveillée; à confirmer en entrevue.'],
  ];
  for (const [pattern, replacement] of singleSignalCopy) {
    if (pattern.test(raw)) return replacement;
  }
  return raw;
}

function polishDimensionRow(row = {}) {
  const coachMeaning = polishDimensionMeaning(row);
  return coachMeaning && coachMeaning !== row.coachMeaning
    ? { ...row, coachMeaning }
    : row;
}

function polishGeneratedSentence(value) {
  const raw = text(value);
  if (!raw) return raw;
  const coherent = raw.match(/^Les réponses indiquent\s+cohérent(?:e|es|s)?\s*[—-]\s*tendance\s+([^.]+)\.?$/i);
  if (coherent) {
    return `Les réponses sont cohérentes et indiquent une tendance ${text(coherent[1])}.`;
  }
  return raw;
}

function polishNutritionAction(action) {
  if (!action) return null;
  return {
    ...action,
    cards: Array.isArray(action.cards)
      ? action.cards.map((card) => ({
        ...card,
        suggested: polishGeneratedSentence(card?.suggested),
        toTest: polishGeneratedSentence(card?.toTest),
      }))
      : action.cards,
  };
}

function polishPlanLine(value, conflictImplication = '') {
  let out = text(value);
  if (!out) return out;
  out = out.replace(/\breprise minimale à tester\b/gi, 'reprise minimale');
  if (/CONTRADICTION À CLARIFIER/i.test(out)) {
    out = conflictImplication
      ? `Comparer la contradiction « ${conflictImplication} » aux comportements observés.`
      : 'Comparer la contradiction identifiée aux comportements observés.';
  }
  return out;
}

function polishFourWeekPlan(weeks = [], conflicts = []) {
  const conflictImplication = text(
    (conflicts || []).find((conflict) => text(conflict?.coachImplication))?.coachImplication,
  );
  return (weeks || []).map((week) => ({
    ...week,
    coachAction: polishPlanLine(week?.coachAction, conflictImplication),
    actions: Array.isArray(week?.actions)
      ? week.actions.map((line) => polishPlanLine(line, conflictImplication))
      : week?.actions,
  }));
}

function verbatimSources(vm = {}) {
  const operating = vm.athleteOperatingBrief || {};
  const decision = vm.coachDecisionBrief || {};
  return [...new Set([
    decision.athleteGoal,
    decision.successDescribed,
    operating.primaryGoal,
    operating.successDefinition,
    ...(vm.verbatims || []).map((item) => item?.verbatim),
  ].map(text).filter(Boolean))];
}

function restoreVerbatimCasing(value, vm) {
  let out = text(value);
  for (const source of verbatimSources(vm)) {
    out = out.replace(new RegExp(escapeRegExp(source), 'gi'), source);
  }
  return out;
}

function structureNeedPhrase(preference) {
  const raw = text(preference);
  if (/peu de structure formelle probablement nécessaire/i.test(raw)) return 'le besoin de structure paraît faible';
  if (/structure probablement utile/i.test(raw)) return 'le besoin de structure paraît élevé';
  if (/structure à calibrer/i.test(raw)) return 'le besoin de structure reste à calibrer';
  if (raw) return 'le besoin de structure reste à confirmer';
  return 'le besoin de structure reste à confirmer';
}

function dedupeContained(items = []) {
  const result = [];
  for (const item of items.map(text).filter(Boolean)) {
    const key = normalizeComparable(item);
    if (!key) continue;
    if (result.some((existing) => normalizeComparable(existing).includes(key))) continue;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const existingKey = normalizeComparable(result[index]);
      if (key.includes(existingKey)) result.splice(index, 1);
    }
    result.push(item);
  }
  return result;
}

function polishPrudenceCoach(value) {
  const raw = text(value);
  if (!/^Prudence Coach\s*:/i.test(raw)) return raw;
  const match = raw.match(/^(Prudence Coach\s*:\s*)(.*?)(\.\s*Ces contextes\b.*)$/i);
  if (!match) return raw;
  const parts = dedupeContained(match[2].split(/\s*;\s*/));
  return `${match[1]}${parts.join(' ; ')}${match[3]}`;
}

function polishNarrativeParagraph(value, vm = {}) {
  const operating = vm.athleteOperatingBrief || {};
  const decision = vm.coachDecisionBrief || {};
  const goal = text(decision.athleteGoal || operating.primaryGoal);
  const success = text(decision.successDescribed || operating.successDefinition);
  const operationalStructure = operationalStructureValue(vm);
  let out = restoreVerbatimCasing(value, vm);

  if (goal && /^Ce qui semble mobiliser cet athlète/i.test(out)) {
    out = `Ce qui semble mobiliser cet athlète, d'après ce qu'il a déclaré, est : « ${goal} ».`;
  } else if (success && /^La réussite est décrite comme/i.test(out)) {
    out = `La réussite est décrite comme : « ${success} » — c'est le critère à utiliser pour juger si le coaching avance, plutôt qu'un standard externe.`;
  } else if (operationalStructure && /^Côté structure,/i.test(out)) {
    const choice = text(operating.choicePreference);
    out = `Côté structure, ${structureNeedPhrase(operating.structurePreference)}, mais la recommandation opérationnelle reste une structure ${lowerInitial(operationalStructure)}, simple et ajustable, compte tenu du niveau de préparation.${choice ? ` Côté choix, ${lowerInitial(choice)}.` : ''}`;
  } else if (operationalStructure && /^Pour le coaching, utiliser comme point de départ/i.test(out)) {
    out = `Pour le coaching, commencer avec une structure ${lowerInitial(operationalStructure)}, simple et ajustable, puis ajuster selon la réaction des 7 à 14 premiers jours.`;
  }

  return polishPrudenceCoach(restoreVerbatimCasing(out, vm));
}

function polishNarrative(narrative = {}, vm = {}) {
  const parts = (narrative.parts || []).map((part) => ({
    ...part,
    paragraphs: (part.paragraphs || []).map((line) => polishNarrativeParagraph(line, vm)),
  }));
  const paragraphs = parts.flatMap((part) => part.paragraphs || []);
  return {
    ...narrative,
    parts,
    paragraphs,
    wordCount: paragraphs.join(' ').split(/\s+/).filter(Boolean).length,
  };
}

export function buildMotivationReportPresentation(viewModel = {}) {
  const vm = viewModel;
  const identity = vm.identity || vm.hero?.identity || null;
  const provenance = vm.provenance || vm.technical || {};
  const brief = vm.coachDecisionBrief || null;
  const operating = vm.athleteOperatingBrief || null;
  const operationalStructure = operationalStructureValue(vm);
  const narrative = polishNarrative(buildCoachNarrative(vm), vm);
  const interview = vm.interviewDetailed?.length ? vm.interviewDetailed : (vm.interviewQuestions || []);
  const factors = (vm.decisionFactors?.length ? vm.decisionFactors : (vm.dimensions || []))
    .map(polishDimensionRow);
  const groups = (vm.dimensionGroups || []).map((group) => ({
    ...group,
    items: (group.items || []).map(polishDimensionRow),
  }));
  const conflicts = vm.conflicts || [];
  const weeks = polishFourWeekPlan(vm.fourWeekPlan || [], conflicts);
  const testable = vm.fourWeekPlanTestable ?? isTestableFourWeekPlan(weeks);
  const nutritionAction = polishNutritionAction(vm.nutritionAction || null);
  const nutritionOrganized = vm.nutritionOrganized || null;
  const nutrition = vm.nutrition || null;
  const hasNutrition = hasNutritionContent(nutritionOrganized || nutrition, nutritionAction);
  const riskBuckets = vm.riskBuckets || {};

  const sections = [
    vm.quickRead?.length ? {
      id: 'quick-read',
      title: 'Lecture rapide',
      kind: 'quick-read',
      items: vm.quickRead,
    } : null,
    brief ? {
      id: 'decision-brief',
      title: 'Brief de coaching',
      kind: 'decision-brief',
      athleteGoal: brief.athleteGoal || '',
      successDescribed: brief.successDescribed || '',
      whyNow: brief.whyNowCaptured ? brief.whyNow : 'À clarifier en entrevue',
      whyNowCaptured: Boolean(brief.whyNowCaptured),
      startActions: brief.startActions || [],
      avoidAtStart: brief.avoidAtStart || [],
      confirmNow: brief.confirmNow || [],
    } : null,
    vm.portraitCoach?.length ? {
      id: 'portrait-coach',
      title: 'Mode d\'emploi de l\'athlète',
      kind: 'portrait',
      items: vm.portraitCoach,
    } : null,
    operating && operatingRows(operating, operationalStructure).length ? {
      id: 'operating-brief',
      title: 'Synthèse opérationnelle',
      kind: 'operating-brief',
      rows: operatingRows(operating, operationalStructure),
    } : null,
    narrative.parts.length ? {
      id: 'coach-narrative',
      title: narrative.title,
      kind: 'narrative',
      parts: narrative.parts,
      wordCount: narrative.wordCount,
    } : null,
    vm.coachPriorities?.length ? {
      id: 'priorities',
      title: 'Priorités Coach',
      kind: 'numbered-list',
      items: vm.coachPriorities,
    } : null,
    (riskBuckets.risksToPrevent?.length
      || riskBuckets.hypothesesToTest?.length
      || riskBuckets.contradictionsToResolve?.length
      || conflicts.length) ? {
      id: 'risk-buckets',
      title: 'Risques / hypothèses à valider',
      kind: 'risk-buckets',
      buckets: [
        ['Risques à prévenir', riskBuckets.risksToPrevent || [], 'risks'],
        ['Hypothèses à tester', riskBuckets.hypothesesToTest || [], 'hypotheses'],
        ['Contradictions à résoudre', riskBuckets.contradictionsToResolve || [], 'contradictions'],
      ].filter(([, items]) => items.length),
      conflicts,
    } : null,
    interview.length ? {
      id: 'interview',
      title: 'Préparer l\'entrevue',
      kind: 'interview',
      items: interview,
    } : null,
    vm.verbatims?.length ? {
      id: 'verbatims',
      title: 'Voix de l\'athlète',
      kind: 'verbatims',
      items: vm.verbatims,
    } : null,
    factors.length || groups.length ? {
      id: 'dimensions',
      title: 'Facteurs de décision',
      kind: 'dimensions',
      factors,
      groups,
    } : null,
    hasNutrition ? {
      id: 'nutrition',
      title: 'Nutrition',
      kind: 'nutrition',
      action: nutritionAction,
      organized: nutritionOrganized,
      nutrition,
    } : null,
    weeks.length ? {
      id: 'four-week-plan',
      title: 'Plan 4 semaines',
      kind: 'plan',
      weeks,
      testable,
    } : null,
    groups.length ? {
      id: 'dimension-appendix',
      title: 'Annexe — Dimensions détaillées',
      kind: 'dimension-appendix',
      groups,
      webAsDetails: true,
    } : null,
    technicalRows(provenance, identity).length ? {
      id: 'technical',
      title: 'Informations techniques',
      kind: 'technical',
      rows: technicalRows(provenance, identity),
    } : null,
  ].filter(Boolean);

  const hero = {
    id: 'hero',
    title: vm.title || vm.hero?.title || 'Profil motivationnel',
    identity,
    clientName: identity?.fullName || vm.clientName || vm.hero?.clientName || '',
    email: identity?.email || '',
    phone: identity?.phone || '',
    serviceType: identity?.serviceType || '',
    shortId: identity?.shortId || '',
    submittedAt: vm.submittedAt || vm.hero?.submittedAt || null,
    analyzedAt: vm.analyzedAt || vm.hero?.analyzedAt || null,
    analysisVersion: vm.analysisVersion ?? vm.hero?.analysisVersion ?? null,
    reportConfidence: vm.reportConfidence || vm.hero?.reportConfidence || null,
    planningLandmarks: vm.planningLandmarks || vm.hero?.planningLandmarks || null,
  };

  const nutritionCardCount = nutritionAction?.cards?.length
    || count(nutritionOrganized?.said)
    + count(nutritionOrganized?.suggested)
    + count(nutritionOrganized?.confirm)
    + count(nutritionOrganized?.test)
    + count(nutritionOrganized?.obstacles);

  return {
    identity,
    hero,
    sections,
    narrative,
    manifest: {
      hero: Boolean(hero.clientName),
      quickRead: count(vm.quickRead),
      decisionBrief: brief ? 1 : 0,
      portraitCoach: count(vm.portraitCoach),
      operatingBrief: operatingRows(operating, operationalStructure).length,
      coachNarrative: narrative.parts.length,
      coachPriorities: count(vm.coachPriorities),
      riskBuckets: (riskBuckets.risksToPrevent || []).length
        + (riskBuckets.hypothesesToTest || []).length
        + (riskBuckets.contradictionsToResolve || []).length
        + conflicts.length,
      interviewDetailed: interview.length,
      verbatims: count(vm.verbatims),
      decisionFactors: factors.length,
      dimensionGroups: flattenDimensionCount(groups) || count(vm.dimensions),
      nutrition: nutritionCardCount,
      fourWeekPlan: weeks.length,
      technical: technicalRows(provenance, identity).length ? 1 : 0,
    },
  };
}

export function presentationSection(presentation, id) {
  if (id === 'hero') return presentation?.hero || null;
  return (presentation?.sections || []).find((section) => section.id === id) || null;
}
