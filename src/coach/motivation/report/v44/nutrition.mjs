/**
 * Actionable nutrition cards. Confidence is centralized, not repeated in every sentence.
 */

import { findingByKey } from './findings.mjs';

function card({ id, title, stance, athleteSaid, suggested, toTest }) {
  return { id, title, stance, athleteSaid, suggested, toTest };
}

export function buildNutritionActionCards({ brief = {}, findings = [], obstacles = [] }) {
  const planning = findingByKey(findings, 'nutrition_planning');
  const stress = findingByKey(findings, 'emotional_stress_food');
  const hunger = findingByKey(findings, 'hunger_signals');
  const declared = [
    ...(brief.declaredBarriers || []),
    ...((obstacles || []).map((item) => item.label || item.title || item)),
  ].filter(Boolean);
  const budget = declared.find((item) => /budget/i.test(item));
  const cards = [];

  if (brief.nutritionFocus) {
    cards.push(card({
      id: 'seek',
      title: 'Ce que l\'athlète cherche',
      stance: 'DÉCLARÉ PAR L\'ATHLÈTE',
      athleteSaid: brief.nutritionFocus,
      suggested: null,
      toTest: 'Confirmer à quoi ressemble une semaine où ce changement est tenu.',
    }));
  }
  if (planning) {
    cards.push(card({
      id: 'planning',
      title: 'Planification',
      stance: planning.confidenceStatus,
      athleteSaid: declared.find((item) => /planif/i.test(item)) || null,
      suggested: planning.interpretation,
      toTest: planning.validationNeeded
        ? 'Observer si la planification déclarée tient une semaine normale.'
        : 'Utiliser la planification comme levier initial.',
    }));
  }
  if (budget) {
    cards.push(card({
      id: 'budget',
      title: 'Budget',
      stance: 'DÉCLARÉ PAR L\'ATHLÈTE',
      athleteSaid: budget,
      suggested: null,
      toTest: 'Préciser où le budget crée concrètement la difficulté.',
    }));
  }
  if (stress?.evidenceCount) {
    cards.push(card({
      id: 'stress',
      title: 'Stress / émotions',
      stance: stress.confidenceStatus,
      athleteSaid: null,
      suggested: stress.interpretation,
      toTest: 'Observer quels repas ou contextes sont touchés.',
    }));
  }
  if (hunger?.evidenceCount) {
    cards.push(card({
      id: 'hunger',
      title: 'Faim / satiété',
      stance: hunger.confidenceStatus,
      athleteSaid: null,
      suggested: hunger.interpretation,
      toTest: hunger.validationNeeded ? 'Vérifier comment la faim se manifeste en semaine chargée.' : null,
    }));
  }

  return {
    seek: brief.nutritionFocus || null,
    facilitate: cards.filter((item) => item.stance === 'APPUYÉE').map((item) => item.title),
    complicate: [budget, ...declared.filter((item) => !/planif/i.test(item))].filter(Boolean).slice(0, 3),
    verify: cards.filter((item) => item.stance !== 'APPUYÉE').map((item) => item.toTest).filter(Boolean),
    testThisWeek: cards[0]?.toTest || 'Observer un repas ou une journée alimentaire réelle.',
    cards: cards.slice(0, 5),
  };
}
