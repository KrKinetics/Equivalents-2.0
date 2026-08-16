import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import { NUTRITION_DIMENSIONS } from '../../src/coach/motivation/domain/dimensions.mjs';
import { calculateNutritionScores, hasNutritionData } from '../../src/coach/motivation/scoring/nutrition.mjs';

function nutQuestion(code, dimension, direction = 'positive') {
  return {
    id: `id-${code}`,
    code,
    text: code,
    type: 'likert',
    required: true,
    order: 1,
    section: "Rapport à l'alimentation et préparation nutritionnelle",
    primaryDimension: dimension,
    scoringDirection: direction,
    active: true,
    likertMin: 1,
    likertMax: 5,
    interpretationTags: ['nutrition'],
  };
}

describe('nutrition scoring', () => {
  it('calculates seven nutrition dimensions and respects reverse items', () => {
    const questions = [
      nutQuestion('NUT_ROLE_01', 'nutrition_value_awareness'),
      nutQuestion('NUT_ROLE_02', 'nutrition_value_awareness'),
      nutQuestion('NUT_PERF_01', 'performance_fueling_awareness'),
      nutQuestion('NUT_PERF_02', 'performance_fueling_awareness'),
      nutQuestion('NUT_PLAN_01', 'nutrition_planning_capacity'),
      nutQuestion('NUT_PLAN_02', 'nutrition_planning_capacity', 'negative'),
      nutQuestion('NUT_FLEX_01', 'food_flexibility'),
      nutQuestion('NUT_FLEX_02', 'food_flexibility', 'negative'),
      nutQuestion('NUT_EMO_01', 'emotional_food_influence'),
      nutQuestion('NUT_EMO_02', 'emotional_food_influence'),
      nutQuestion('NUT_STRUCT_01', 'nutrition_structure_need'),
      nutQuestion('NUT_STRUCT_02', 'nutrition_structure_need'),
      nutQuestion('NUT_SIGNAL_01', 'hunger_satiety_awareness'),
      nutQuestion('NUT_SIGNAL_02', 'hunger_satiety_awareness'),
    ];
    const answers = questions.map((q) => ({
      questionId: q.id,
      numericValue: 5,
    }));

    const result = calculateNutritionScores(questions, answers);
    expect(result.dimensions).toHaveLength(NUTRITION_DIMENSIONS.length);
    expect(hasNutritionData(result)).toBe(true);

    const planning = result.dimensions.find((d) => d.dimension === 'nutrition_planning_capacity');
    const flexibility = result.dimensions.find((d) => d.dimension === 'food_flexibility');
    const value = result.dimensions.find((d) => d.dimension === 'nutrition_value_awareness');

    expect(value?.normalizedScore).toBe(100);
    expect(planning?.normalizedScore).toBe(50);
    expect(flexibility?.normalizedScore).toBe(50);
  });

  it('does not invent nutrition data for historical v1 questionnaires', () => {
    const questions = [
      {
        id: 'q1',
        code: 'MOT_AUTO_01',
        text: 'x',
        type: 'likert',
        required: true,
        order: 1,
        section: 'Motivation',
        primaryDimension: 'autonomous_motivation',
        scoringDirection: 'positive',
        active: true,
        likertMin: 1,
        likertMax: 5,
      },
    ];
    const answers = [{ questionId: 'q1', numericValue: 4 }];
    const nutrition = calculateNutritionScores(questions, answers);
    expect(hasNutritionData(nutrition)).toBe(false);
  });
});
