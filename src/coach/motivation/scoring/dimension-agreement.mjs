import { RULESET_V3_THRESHOLDS, } from "../rules/ruleset-v3.mjs";
import { invertNormalizedScore, normalizeLikertMean, } from "./normalize.mjs";
function extractNumeric(answer) {
    if (!answer)
        return null;
    if (typeof answer.numericValue === "number" && !Number.isNaN(answer.numericValue)) {
        return answer.numericValue;
    }
    return null;
}
/**
 * Analyze individual item scores within a dimension before relying on the mean.
 */
export function calculateDimensionAgreement(dimension, questions, answers, thresholds = RULESET_V3_THRESHOLDS) {
    const related = questions.filter((q) => q.active &&
        q.scoringDirection !== "none" &&
        (q.primaryDimension === dimension ||
            q.secondaryDimensions?.includes(dimension)));
    const itemScores = [];
    for (const question of related) {
        const numeric = extractNumeric(answers.find((a) => a.questionId === question.id));
        if (numeric === null)
            continue;
        const min = question.likertMin ?? 1;
        const max = question.likertMax ?? 5;
        let normalized = normalizeLikertMean(numeric, min, max);
        if (question.scoringDirection === "negative") {
            normalized = invertNormalizedScore(normalized);
        }
        itemScores.push({ code: question.code, normalized });
    }
    const itemCount = itemScores.length;
    if (itemCount < 2) {
        const only = itemScores[0]?.normalized ?? 0;
        return {
            dimension,
            itemCount,
            minimumNormalizedValue: only,
            maximumNormalizedValue: only,
            spread: 0,
            agreement: "insufficient",
            notableQuestionCodes: itemScores.map((i) => i.code),
            itemScores,
        };
    }
    const values = itemScores.map((i) => i.normalized);
    const minimumNormalizedValue = Math.min(...values);
    const maximumNormalizedValue = Math.max(...values);
    const spread = maximumNormalizedValue - minimumNormalizedValue;
    let agreement;
    if (spread >= thresholds.spreadDivergent) {
        agreement = "divergent";
    }
    else if (spread >= thresholds.spreadMixed) {
        agreement = "mixed";
    }
    else {
        agreement = "consistent";
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const notableQuestionCodes = itemScores
        .filter((i) => Math.abs(i.normalized - mean) >= thresholds.spreadMixed / 2)
        .map((i) => i.code);
    return {
        dimension,
        itemCount,
        minimumNormalizedValue,
        maximumNormalizedValue,
        spread,
        agreement,
        notableQuestionCodes: notableQuestionCodes.length > 0
            ? notableQuestionCodes
            : itemScores.map((i) => i.code),
        itemScores,
    };
}
export function agreementLabelFr(level) {
    switch (level) {
        case "insufficient":
            return "Insuffisante";
        case "mixed":
            return "Mixte";
        case "consistent":
            return "Cohérente";
        case "divergent":
            return "Divergente";
    }
}
