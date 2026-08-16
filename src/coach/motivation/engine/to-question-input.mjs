/**
 * Maps an immutable engine seed question to the scoring/report QuestionInput.
 * id is always the question code so answers persist by code, not by caller ids.
 */

export function optionIdFor(code, index) {
  return `${code}::${index}`;
}

export function toEngineQuestionInput(seed, order) {
  const tags = [...(seed.tags ?? [])];
  const input = {
    id: seed.code,
    code: seed.code,
    text: seed.text,
    description: seed.description,
    type: seed.type ?? 'likert',
    required: seed.required ?? true,
    order: order + 1,
    section: seed.section,
    primaryDimension: seed.primaryDimension,
    scoringDirection: seed.scoringDirection ?? 'positive',
    weight: seed.weight ?? 1,
    interpretationTags: tags,
    active: true,
    likertMin: seed.likertMin ?? 1,
    likertMax: seed.likertMax ?? 5,
    maxSelections: seed.maxSelections,
    options: seed.options ? [...seed.options] : undefined,
  };
  if (seed.helper) input.helper = seed.helper;
  if (seed.examples) input.examples = [...seed.examples];
  if (seed.chips) input.chips = [...seed.chips];
  if (seed.maxLength != null) input.maxLength = seed.maxLength;
  return input;
}

export function buildEngineOptionLabels(questions) {
  const labels = new Map();
  for (const question of questions) {
    (question.options ?? []).forEach((label, index) => {
      labels.set(optionIdFor(question.code, index), label);
    });
  }
  return labels;
}

export function optionIdByLabel(question, label) {
  const options = question.options ?? [];
  const index = options.findIndex((item) => item === label);
  if (index === -1) {
    throw new Error(`Unknown option "${label}" for ${question.code}`);
  }
  return optionIdFor(question.code, index);
}
