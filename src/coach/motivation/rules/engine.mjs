function readScore(scores, dimension) {
    const value = scores[dimension];
    return typeof value === "number" ? value : null;
}
export function evaluateCondition(condition, scores) {
    const score = readScore(scores, condition.dimension);
    if (score === null)
        return false;
    switch (condition.operator) {
        case "gte":
            return score >= condition.value;
        case "lte":
            return score <= condition.value;
        case "gt":
            return score > condition.value;
        case "lt":
            return score < condition.value;
        case "between":
            return (score >= condition.value &&
                typeof condition.valueTo === "number" &&
                score <= condition.valueTo);
        default:
            return false;
    }
}
export function evaluateRule(rule, scores) {
    const logic = rule.logic ?? "and";
    if (rule.conditions.length === 0)
        return false;
    if (logic === "or") {
        return rule.conditions.some((c) => evaluateCondition(c, scores));
    }
    return rule.conditions.every((c) => evaluateCondition(c, scores));
}
export function evaluateRules(rules, scores) {
    return rules
        .filter((rule) => evaluateRule(rule, scores))
        .map((rule) => ({
        type: rule.type,
        code: rule.code,
        title: rule.title,
        message: rule.message,
        coachingRecommendation: rule.coachingRecommendation,
        severity: rule.severity,
    }));
}
export function detectContradictions(definitions, scores) {
    return definitions
        .filter((def) => evaluateCondition(def.left, scores) && evaluateCondition(def.right, scores))
        .map((def) => ({
        code: def.code,
        title: def.title,
        message: def.message,
        dimensionsInvolved: [def.left.dimension, def.right.dimension],
    }));
}
export function evaluateRuleset(input) {
    return {
        insights: evaluateRules(input.rules, input.scores),
        contradictions: detectContradictions(input.contradictions, input.scores),
        rulesetVersion: input.rulesetVersion,
    };
}
