import { PROFILE_DIMENSIONS } from "../domain/dimensions.mjs";
import { clampScore, invertNormalizedScore, normalizeLikertMean, roundScore, } from "./normalize.mjs";
function answerForQuestion(answers, questionId) {
    return answers.find((a) => a.questionId === questionId);
}
function extractNumeric(question, answer) {
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
/**
 * Deterministic scoring engine.
 * No single answer produces a conclusion alone — dimensions aggregate weighted items.
 */
export function calculateDimensionScores(questions, answers) {
    const active = questions.filter((q) => q.active);
    const missingRequiredQuestionIds = active
        .filter((q) => q.required)
        .filter((q) => {
        const a = answerForQuestion(answers, q.id);
        if (!a)
            return true;
        if (q.type === "likert" || q.type === "single_choice") {
            return typeof a.numericValue !== "number";
        }
        if (q.type === "multiple_choice" || q.type === "ranking") {
            return !a.selectedOptionIds || a.selectedOptionIds.length === 0;
        }
        return !a.textValue?.trim();
    })
        .map((q) => q.id);
    const dimensions = PROFILE_DIMENSIONS.map((dimension) => scoreDimension(dimension, active, answers));
    const withData = dimensions.filter((d) => d.contributingQuestionCount > 0);
    const overallConfidence = withData.length === 0
        ? 0
        : roundScore(withData.reduce((sum, d) => sum + d.confidence, 0) / withData.length, 1);
    return {
        dimensions,
        overallConfidence,
        missingRequiredQuestionIds,
    };
}
function scoreDimension(dimension, questions, answers) {
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
        const numeric = extractNumeric(question, answerForQuestion(answers, question.id));
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
    // Reconstruct an approximate raw mean on 1–5 for transparency (not clinical).
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
export function getScoreMap(result) {
    return Object.fromEntries(result.dimensions.map((d) => [d.dimension, d.normalizedScore]));
}
