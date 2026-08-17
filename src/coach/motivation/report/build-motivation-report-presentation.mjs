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

function operatingRows(brief = {}) {
  return [
    ['Objectif prioritaire', brief.primaryGoal],
    ['Pourquoi maintenant', brief.whyNow],
    ['Définition de réussite', brief.successDefinition],
    ['Reprise', brief.recoveryStrategy],
    ['Structure', brief.structurePreference],
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

export function buildMotivationReportPresentation(viewModel = {}) {
  const vm = viewModel;
  const identity = vm.identity || vm.hero?.identity || null;
  const provenance = vm.provenance || vm.technical || {};
  const brief = vm.coachDecisionBrief || null;
  const operating = vm.athleteOperatingBrief || null;
  const narrative = buildCoachNarrative(vm);
  const interview = vm.interviewDetailed?.length ? vm.interviewDetailed : (vm.interviewQuestions || []);
  const factors = vm.decisionFactors?.length ? vm.decisionFactors : (vm.dimensions || []);
  const groups = vm.dimensionGroups || [];
  const weeks = vm.fourWeekPlan || [];
  const testable = vm.fourWeekPlanTestable ?? isTestableFourWeekPlan(weeks);
  const nutritionAction = vm.nutritionAction || null;
  const nutritionOrganized = vm.nutritionOrganized || null;
  const nutrition = vm.nutrition || null;
  const hasNutrition = hasNutritionContent(nutritionOrganized || nutrition, nutritionAction);
  const riskBuckets = vm.riskBuckets || {};
  const conflicts = vm.conflicts || [];

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
    operating && operatingRows(operating).length ? {
      id: 'operating-brief',
      title: 'Synthèse opérationnelle',
      kind: 'operating-brief',
      rows: operatingRows(operating),
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
      operatingBrief: operatingRows(operating).length,
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
