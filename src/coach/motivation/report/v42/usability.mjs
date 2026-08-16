const HIGH_IMPACT = new Set([
    "adherence_recovery",
    "all_or_nothing",
    "results_orientation",
    "compensatory_food",
    "long_term_projection",
]);
export function buildReportUsabilityV42(input) {
    const coherentDomains = input.domains
        .filter((d) => d.agreement === "consistent" &&
        d.trendEstablished &&
        d.itemCount > 1)
        .map((d) => d.label);
    const mixedDomains = input.domains
        .filter((d) => d.agreement === "mixed")
        .map((d) => d.label);
    const divergentDomains = input.domains
        .filter((d) => d.agreement === "strongly_divergent" || d.level === "uncertain")
        .map((d) => d.label);
    const limitedDataDomains = input.domains
        .filter((d) => d.agreement === "insufficient" ||
        d.trendDisplay === "limited_data" ||
        d.itemCount === 1)
        .map((d) => d.label);
    const uncertainDomains = [...mixedDomains, ...divergentDomains, ...limitedDataDomains];
    const highImpactDomainsToValidate = input.domains
        .filter((d) => HIGH_IMPACT.has(d.domainId) &&
        (d.agreement === "mixed" ||
            d.agreement === "strongly_divergent" ||
            d.agreement === "insufficient" ||
            d.itemCount === 1 ||
            d.level === "uncertain" ||
            d.trendDisplay.includes("_to_confirm")))
        .map((d) => d.label);
    const openAnswersToClarify = input.openAnswers
        .filter((a) => a.status !== "usable" &&
        a.status !== "experience_goal" &&
        a.status !== "missing")
        .map((a) => a.questionCode);
    let level = "usable_with_validation";
    if (highImpactDomainsToValidate.length >= 2 ||
        (coherentDomains.length === 0 && mixedDomains.length >= 3)) {
        level = "limited";
    }
    else if (coherentDomains.length >= 4 &&
        highImpactDomainsToValidate.length === 0) {
        level = "strong";
    }
    const coherentList = coherentDomains.length > 0
        ? coherentDomains.slice(0, 4).join(", ")
        : "aucune dimension pleinement cohérente";
    const validateList = [...mixedDomains, ...divergentDomains, ...limitedDataDomains]
        .slice(0, 4)
        .join(", ") || "peu d'incertitudes majeures";
    const message = level === "limited"
        ? `Exploitabilité limitée. Dimensions cohérentes : ${coherentList}. À valider en priorité : ${validateList}. Les indicateurs orientent l'entrevue et ne constituent pas des mesures cliniques.`
        : level === "strong"
            ? `Rapport largement exploitable. Dimensions cohérentes : ${coherentList}.`
            : `Utilisable avec validation. Dimensions cohérentes : ${coherentList}. Points à confirmer : ${validateList}.`;
    return {
        level,
        coherentDomains,
        mixedDomains,
        divergentDomains,
        limitedDataDomains,
        highImpactDomainsToValidate,
        openAnswersToClarify,
        uncertainDomains,
        unresolvedHighImpactDomains: highImpactDomainsToValidate,
        openAnswersNeedingClarification: openAnswersToClarify,
        message,
    };
}
