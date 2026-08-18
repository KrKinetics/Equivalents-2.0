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
  const riskLimit = {
    id: 'reward_food',
    label: 'Nourriture comme récompense',
    claimStrength: 'single',
    level: 'low',
    displayLabel: 'Tendance faible',
    coachMeaning: 'Un premier signal suggère signal de risque limité; à confirmer en entrevue.',
    changesCoaching: true,
  };
  const structureUseful = {
    id: 'structure_useful',
    label: 'Besoin de structure',
    claimStrength: 'single',
    level: 'high',
    displayLabel: 'Tendance élevée',
    coachMeaning: 'Un premier signal suggère structure probablement utile; à confirmer en entrevue.',
    changesCoaching: true,
  };
  const optionOverload = {
    id: 'option_overload',
    label: 'Risque de surcharge devant trop d’options',
    claimStrength: 'single',
    level: 'high',
    displayLabel: 'Tendance élevée',
    coachMeaning: 'Un premier signal suggère surcharge de choix à surveiller; à confirmer en entrevue.',
    changesCoaching: true,
  };
  const feedback = {
    id: 'coach_receptivity',
    label: 'Réceptivité au feedback direct',
    claimStrength: 'single',
    level: 'high',
    displayLabel: 'Tendance élevée',
    coachMeaning: 'Un premier signal suggère feedback direct probablement bien reçu; à confirmer en entrevue.',
    changesCoaching: true,
  };
  const stress = {
    id: 'stress_disruption',
    label: 'Perturbation sous stress',
    claimStrength: 'single',
    level: 'high',
    displayLabel: 'Tendance élevée',
    coachMeaning: 'Un premier signal suggère influence du stress à surveiller; à confirmer en entrevue.',
    changesCoaching: true,
  };
  const dimensions = [structure, planning, riskLimit, structureUseful, optionOverload, feedback, stress];
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
    dimensions,
    decisionFactors: dimensions,
    dimensionGroups: [{ id: 'decision', title: 'Décision', items: dimensions }],
    nutritionAction: {
      complicate: [BARRIER],
      cards: [{
        id: 'hunger',
        label: 'Faim / satiété',
        suggested: 'Les réponses indiquent cohérente — tendance élevée.',
        toTest: '',
      }],
    },
    nutritionOrganized: {
      said: ['régularité des repas, portions'],
      obstacles: ["L'ALCOOL", 'Manque de temps'],
    },
    conflicts: [{
      title: 'CONTRADICTION À CLARIFIER',
      sourceA: 'Réponses fermées : planification alimentaire plutôt favorable',
      sourceB: 'Déclaration : manque de planification comme obstacle',
      coachImplication: 'Perception de capacité vs problème rencontré en situation réelle',
      validationQuestion: 'Où la planification bloque-t-elle concrètement?',
    }],
    fourWeekPlan: [
      {
        week: 3,
        title: 'Semaine 3 — Tester le style et la reprise',
        coachAction: "Tester une reprise minimale à tester — le signal d'adhésion n'est pas encore conclu.",
        actions: ["Tester une reprise minimale à tester — le signal d'adhésion n'est pas encore conclu."],
      },
      {
        week: 4,
        title: 'Semaine 4 — Comparer aux hypothèses',
        coachAction: 'Comparer l’hypothèse « CONTRADICTION À CLARIFIER » aux comportements observés.',
        actions: ['Comparer l’hypothèse « CONTRADICTION À CLARIFIER » aux comportements observés.'],
      },
    ],
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
  const factorCopy = dimensions.factors.map((row) => row.coachMeaning).join(' ');
  assert.doesNotMatch(
    factorCopy,
    /donnée unique|indiquent cohérente|suggère signal|suggère structure probablement utile|suggère surcharge de choix|suggère feedback direct|suggère influence du stress/i,
  );
  assert.match(factorCopy, /le risque semble limité/i);
  assert.match(factorCopy, /la structure pourrait être utile/i);
  assert.match(factorCopy, /la surcharge de choix mérite d’être surveillée/i);
  assert.match(factorCopy, /le feedback direct pourrait être bien reçu/i);
  assert.match(factorCopy, /l’influence du stress mérite d’être surveillée/i);
});

test('presentation polishes nutrition grammar and four-week actions without mutating snapshot semantics', () => {
  const presentation = buildMotivationReportPresentation(semanticViewModel());
  const nutrition = presentationSection(presentation, 'nutrition');
  assert.equal(
    nutrition.action.cards[0].suggested,
    'Les réponses sont cohérentes et indiquent une tendance élevée.',
  );
  assert.doesNotMatch(nutrition.action.cards[0].suggested, /indiquent cohérente/i);

  const plan = presentationSection(presentation, 'four-week-plan');
  assert.equal(
    plan.weeks[0].coachAction,
    "Tester une reprise minimale — le signal d'adhésion n'est pas encore conclu.",
  );
  assert.equal(
    plan.weeks[1].coachAction,
    'Comparer la contradiction « Perception de capacité vs problème rencontré en situation réelle » aux comportements observés.',
  );
  assert.doesNotMatch(
    plan.weeks.map((week) => [week.coachAction, ...(week.actions || [])].join(' ')).join(' '),
    /reprise minimale à tester|CONTRADICTION À CLARIFIER/i,
  );
});
