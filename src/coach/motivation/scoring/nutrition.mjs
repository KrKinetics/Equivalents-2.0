import { NUTRITION_DIMENSIONS, } from "../domain/dimensions.mjs";
import { clampScore, invertNormalizedScore, normalizeLikertMean, roundScore, } from "./normalize.mjs";
function answerForQuestion(answers, questionId) {
    return answers.find((a) => a.questionId === questionId);
}
function extractNumeric(answer) {
    if (!answer)
        return null;
    if (typeof answer.numericValue === "number" && !Number.isNaN(answer.numericValue)) {
        return answer.numericValue;
    }
    return null;
}
function dimensionConfidence(contributing, missing, expected) {
    if (expected === 0)
        return 0;
    const coverage = contributing / expected;
    const penalty = missing > 0 ? Math.min(0.35, missing * 0.08) : 0;
    return roundScore(clampScore(coverage * 100 * (1 - penalty)), 1);
}
function scoreNutritionDimension(dimension, questions, answers) {
    const related = questions.filter((q) => q.primaryDimension === dimension ||
        q.secondaryDimensions?.includes(dimension));
    let weightedSum = 0;
    let weightTotal = 0;
    let contributingQuestionCount = 0;
    let missingQuestionCount = 0;
    for (const question of related) {
        const isPrimary = question.primaryDimension === dimension;
        const baseWeight = question.weight ?? 1;
        const weight = isPrimary ? baseWeight : baseWeight * 0.5;
        const numeric = extractNumeric(answerForQuestion(answers, question.id));
        if (numeric === null) {
            if (question.required || question.primaryDimension === dimension) {
                missingQuestionCount += 1;
            }
            continue;
        }
        const min = question.likertMin ?? 1;
        const max = question.likertMax ?? 5;
        let normalized = normalizeLikertMean(numeric, min, max);
        if (question.scoringDirection === "negative") {
            normalized = invertNormalizedScore(normalized);
        }
        else if (question.scoringDirection === "none") {
            continue;
        }
        weightedSum += normalized * weight;
        weightTotal += weight;
        contributingQuestionCount += 1;
    }
    if (weightTotal === 0) {
        return {
            dimension,
            rawMean: null,
            normalizedScore: null,
            contributingQuestionCount: 0,
            missingQuestionCount,
            confidence: 0,
        };
    }
    const normalizedScore = roundScore(clampScore(weightedSum / weightTotal), 1);
    const rawMean = roundScore(1 + (normalizedScore / 100) * 4, 2);
    return {
        dimension,
        rawMean,
        normalizedScore,
        contributingQuestionCount,
        missingQuestionCount,
        confidence: dimensionConfidence(contributingQuestionCount, missingQuestionCount, related.filter((q) => q.scoringDirection !== "none").length),
    };
}
/**
 * Scores the seven nutrition dimensions independently from sport profile scores.
 * Returns empty contributing counts when the questionnaire has no nutrition items (v1).
 */
export function calculateNutritionScores(questions, answers) {
    const active = questions.filter((q) => q.active);
    const dimensions = NUTRITION_DIMENSIONS.map((dimension) => scoreNutritionDimension(dimension, active, answers));
    const withData = dimensions.filter((d) => d.contributingQuestionCount > 0);
    const overallConfidence = withData.length === 0
        ? 0
        : roundScore(withData.reduce((sum, d) => sum + d.confidence, 0) / withData.length, 1);
    return { dimensions, overallConfidence };
}
export function hasNutritionData(result) {
    return result.dimensions.some((d) => d.contributingQuestionCount > 0);
}
