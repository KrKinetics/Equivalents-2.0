/**
 * Sequential client-path walker. Uses official browser helpers only.
 * Never builds presentedQuestionCodes from the server narrative replay helper.
 */
import {
  answerFromControl,
  createQuestionnaireRuntime,
  getMotivationQuestion,
  isQuestionAnswered,
  presentedCodesFromAnswers,
} from '../../src/coach/motivation/client/public-questionnaire.mjs';

function plausibleNarrativeValue(question) {
  if (question.type === 'single_choice') return question.options?.[0] || '';
  if (question.code === 'CLARIFY_WHY_NOW_01') {
    return 'parce que je veux reprendre maintenant pour ma sante';
  }
  if (question.code === 'CLARIFY_GOAL_MEANING_01') {
    return 'avoir plus d energie au quotidien et tenir mes seances';
  }
  if (question.code === 'CLARIFY_SUCCESS_01') {
    return 'plus d energie apres les seances et des charges plus stables';
  }
  if (question.code === 'NUT_SUCCESS_01') {
    return 'des repas plus reguliers et moins de decrochages en semaine';
  }
  return 'precision narrative de test';
}

export function controlValueForQuestion(question, values = {}) {
  const code = question.code;
  if (question.type === 'multiple_choice') return values.multi?.[code] ?? [];
  if (question.type === 'single_choice') {
    return values.choice?.[code] || question.options?.[0] || '';
  }
  if (question.type === 'short_text' || question.type === 'long_text') {
    if (values.text && Object.prototype.hasOwnProperty.call(values.text, code)) {
      return values.text[code] ?? '';
    }
    return plausibleNarrativeValue(question);
  }
  return values.likert?.[code] ?? values.adaptiveLikert?.[code] ?? 3;
}

export function walkOfficialClientQuestionnaire(values, version = 'questionnaire-v4.3') {
  const runtime = createQuestionnaireRuntime(version);
  let presented = [...runtime.baseCodes];
  const answersByCode = new Map();

  function persist() {
    return presented.map((code) => answersByCode.get(code)).filter(Boolean);
  }

  function answerCode(code, unlock = false) {
    const question = getMotivationQuestion(code, runtime);
    if (!question) return;
    answersByCode.set(code, answerFromControl(question, controlValueForQuestion(question, values)));
    if (unlock) {
      presented = presentedCodesFromAnswers(persist(), presented, runtime);
    }
  }

  for (const code of runtime.baseCodes) answerCode(code);
  presented = presentedCodesFromAnswers(persist(), presented, runtime);

  const scoringAfterBase = presented.filter((code) => runtime.scoringCodes.includes(code));
  for (const code of scoringAfterBase) answerCode(code, true);

  const narrativeAtEntry = presented.filter((code) => runtime.narrativeCodes.includes(code));
  for (const code of [...presented]) {
    const question = getMotivationQuestion(code, runtime);
    if (question && !isQuestionAnswered(question, answersByCode.get(code))) {
      answerCode(code);
    }
  }

  return {
    runtime,
    presentedQuestionCodes: presented,
    answers: persist(),
    scoringQuestionCodes: presented.filter((code) => runtime.scoringCodes.includes(code)),
    narrativeQuestionCodes: presented.filter((code) => runtime.narrativeCodes.includes(code)),
    narrativeAtEntry,
  };
}
