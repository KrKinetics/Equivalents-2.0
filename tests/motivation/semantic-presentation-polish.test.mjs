import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMotivationReportPresentation,
  presentationSection,
} from '../../src/coach/motivation/report/build-motivation-report-presentation.mjs';

const GOAL = 'JAIMERAIS PERDRE MON PETIT VENTRE';
const SUCCESS = 'LE MIRROIR ET MON FIT DANS MES JEANS';
const BARRIER = "L'ALCOOL, manque de temps, difficulté à reprendre après un écart";

function semanticViewModel() {
  const structure = {
    id: 'structure_need',
    label: 'Besoin de structure',
    claimStrength: 'single',
    level: 'low',
    displayLabel: 'Tendance faible',
    coachMeaning: 'Un premier signal suggère donnée unique — faible - appui limité; à confirmer en entrevue.',
    changesCoaching: true,
  };
  const planning = {
    id: 'nutrition_planning',
    label: 'Planification alimentaire',
    claimStrength: 'supported',
    level: 'low',
    displayLabel: 'Tendance faible',
    coachMeaning: 'Les réponses indiquent cohérente — tendance faible.',
    changesCoaching: true,
  };
  return {
    title: 'Profil motivationnel',
    quickRead: [
      { id: 'structure', label: 'Structure recommandée', value: 'modérée' },
    ],
    athleteOperatingBrief: {
      primaryGoal: GOAL,
      successDefinition: SUCCESS,
      structurePreference: 'Peu de structure formelle probablement nécessaire — à confirmer',
      choicePreference: 'choix guidés à préciser',
      nutritionFocus: 'régularité des repas, portions',
    },
    coachDecisionBrief: {
      athleteGoal: GOAL,
      successDescribed: SUCCESS,
      whyNowCaptured: false,
      startActions: [],
      avoidAtStart: [],
      confirmNow: [],
    },
    dimensions: [structure, planning],
    decisionFactors: [structure, planning],
    dimensionGroups: [{ id: 'decision', title: 'Décision', items: [structure, planning] }],
    nutritionAction: {
      complicate: [BARRIER],
      cards: [],
    },
    nutritionOrganized: {
      said: ['régularité des repas, portions'],
      obstacles: ["L'ALCOOL", 'Manque de temps'],
    },
    verbatims: [
      { verbatim: GOAL },
      { verbatim: SUCCESS },
    ],
  };
}

test('presentation reconciles operational structure and preserves client verbatim casing', () => {
  const presentation = buildMotivationReportPresentation(semanticViewModel());
  const operating = presentationSection(presentation, 'operating-brief');
  assert.equal(
    operating.rows.find(([label]) => label === 'Structure')?.[1],
    'Structure recommandée : modérée',
  );

  const narrative = presentation.narrative.paragraphs.join(' ');
  assert.match(narrative, /est : « JAIMERAIS PERDRE MON PETIT VENTRE »/);
  assert.match(narrative, /décrite comme : « LE MIRROIR ET MON FIT DANS MES JEANS »/);
  assert.doesNotMatch(narrative, /jAIMERAIS|lE MIRROIR/);
  assert.match(
    narrative,
    /le besoin de structure paraît faible, mais la recommandation opérationnelle reste une structure modérée, simple et ajustable/i,
  );
  assert.match(narrative, /Pour le coaching, commencer avec une structure modérée, simple et ajustable/i);
});

test('presentation removes duplicated caution fragments and mechanical evidence wording', () => {
  const presentation = buildMotivationReportPresentation(semanticViewModel());
  const narrative = presentation.narrative.paragraphs.join(' ');
  assert.equal((narrative.match(/L'ALCOOL/g) || []).length, 1);
  assert.doesNotMatch(narrative, /L'ALCOOL\s*;\s*Manque de temps/i);

  const dimensions = presentationSection(presentation, 'dimensions');
  assert.equal(
    dimensions.factors[0].coachMeaning,
    'Appui limité : une seule réponse oriente vers une tendance faible; à confirmer en entrevue.',
  );
  assert.equal(
    dimensions.factors[1].coachMeaning,
    'Les réponses convergent vers une tendance faible.',
  );
  assert.doesNotMatch(dimensions.factors.map((row) => row.coachMeaning).join(' '), /donnée unique|indiquent cohérente/i);
});
