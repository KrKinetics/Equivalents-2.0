import { RULESET_V31_THRESHOLDS, } from "../rules/ruleset-v3.1.mjs";
import { invertNormalizedScore, normalizeLikertMean, } from "./normalize.mjs";
export function valueDirection(value, thresholds = RULESET_V31_THRESHOLDS) {
    if (value <= thresholds.directionLowMax)
        return "low";
    if (value >= thresholds.directionHighMin)
        return "high";
    return "moderate";
}
export function agreementLabelFr(classification) {
    switch (classification) {
        case "insufficient":
            return "Données insuffisantes";
        case "coherent_low":
            return "Cohérente - tendance faible";
        case "coherent_moderate":
            return "Cohérente - tendance modérée";
        case "coherent_high":
            return "Cohérente - tendance élevée";
        case "mixed_low":
            return "Mixte - tendance faible";
        case "mixed_moderate":
            return "Mixte - tendance modérée";
        case "mixed_high":
            return "Mixte - tendance élevée";
        case "strongly_divergent":
            return "Fortement divergente";
    }
}
function medianOf(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}
function coherentClass(dir) {
    if (dir === "high")
        return "coherent_high";
    if (dir === "low")
        return "coherent_low";
    return "coherent_moderate";
}
function mixedClass(dir) {
    if (dir === "high")
        return "mixed_high";
    if (dir === "low")
        return "mixed_low";
    return "mixed_moderate";
}
function extractNumeric(answer) {
    if (!answer)
        return null;
    if (typeof answer.numericValue === "number" && !Number.isNaN(answer.numericValue)) {
        return answer.numericValue;
    }
    return null;
}
/**
 * Nuanced agreement for report-model-v3.1.
 * A single opposing answer among three must not erase a majority trend.
 */
export function calculateDimensionAgreementV31(dimension, questions, answers, thresholds = RULESET_V31_THRESHOLDS) {
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
    const values = itemScores.map((i) => i.normalized);
    const itemCount = values.length;
    if (itemCount === 0) {
        return {
            dimension,
            itemCount: 0,
            normalizedValues: [],
            minimum: 0,
            maximum: 0,
            spread: 0,
            median: 0,
            mean: 0,
            dominantDirection: "none",
            majorityCount: 0,
            outlierCount: 0,
            classification: "insufficient",
            notableQuestionCodes: [],
            conflictingQuestionCodes: [],
            itemScores: [],
        };
    }
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = maximum - minimum;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const median = medianOf(values);
    if (itemCount === 1) {
        const dir = valueDirection(values[0], thresholds);
        return {
            dimension,
            itemCount,
            normalizedValues: values,
            minimum,
            maximum,
            spread,
            median,
            mean,
            dominantDirection: dir,
            majorityCount: 1,
            outlierCount: 0,
            classification: "insufficient",
            notableQuestionCodes: itemScores.map((i) => i.code),
            conflictingQuestionCodes: [],
            itemScores,
        };
    }
    if (itemCount === 2) {
        const dirA = valueDirection(values[0], thresholds);
        const dirB = valueDirection(values[1], thresholds);
        let classification;
        let dominantDirection;
        if (spread < thresholds.spreadTwoItemMixed) {
            dominantDirection = valueDirection(mean, thresholds);
            classification = coherentClass(dominantDirection);
        }
        else if (spread < thresholds.spreadTwoItemDivergent) {
            dominantDirection = valueDirection(mean, thresholds);
            classification = mixedClass(dominantDirection);
        }
        else {
            dominantDirection = dirA === dirB ? dirA : "none";
            classification = "strongly_divergent";
        }
        return {
            dimension,
            itemCount,
            normalizedValues: values,
            minimum,
            maximum,
            spread,
            median,
            mean,
            dominantDirection,
            majorityCount: dirA === dirB ? 2 : 1,
            outlierCount: dirA === dirB ? 0 : 1,
            classification,
            notableQuestionCodes: itemScores.map((i) => i.code),
            conflictingQuestionCodes: dirA === dirB ? [] : itemScores.map((i) => i.code),
            itemScores,
        };
    }
    // 3+ items
    const counts = {
        low: 0,
        moderate: 0,
        high: 0,
        none: 0,
    };
    const dirs = values.map((v) => valueDirection(v, thresholds));
    for (const d of dirs)
        counts[d] += 1;
    const ranked = ["high", "low", "moderate"].sort((a, b) => counts[b] - counts[a]);
    const top = ranked[0];
    const majorityCount = counts[top];
    const hasMajority = majorityCount >= Math.ceil(itemCount / 2) && majorityCount >= 2;
    const allSame = majorityCount === itemCount;
    let classification;
    let dominantDirection = top;
    if (allSame) {
        classification = coherentClass(top);
    }
    else if (hasMajority && majorityCount >= itemCount - 1) {
        // e.g. 2 of 3 same direction
        classification = mixedClass(top);
    }
    else if (hasMajority && majorityCount > counts[ranked[1]]) {
        classification = mixedClass(top);
    }
    else {
        classification = "strongly_divergent";
        dominantDirection = "none";
    }
    const outlierCodes = itemScores
        .filter((i) => valueDirection(i.normalized, thresholds) !== dominantDirection)
        .map((i) => i.code);
    const majorityCodes = itemScores
        .filter((i) => valueDirection(i.normalized, thresholds) === dominantDirection)
        .map((i) => i.code);
    return {
        dimension,
        itemCount,
        normalizedValues: values,
        minimum,
        maximum,
        spread,
        median,
        mean,
        dominantDirection,
        majorityCount: dominantDirection === "none" ? 0 : majorityCount,
        outlierCount: outlierCodes.length,
        classification,
        notableQuestionCodes: majorityCodes,
        conflictingQuestionCodes: outlierCodes,
        itemScores,
    };
}
