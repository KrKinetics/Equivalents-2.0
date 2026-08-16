import { trendLabelFr } from "./domain-interpretation-v41.mjs";
export function applyPresentationEvidenceRules(domain) {
    if (domain.itemCount !== 1)
        return domain;
    const trend = trendLabelFr(domain.trendDisplay);
    const trendWithLimited = `${trend} - appui limité`;
    return {
        ...domain,
        agreement: "insufficient",
        evidenceStrength: "limited",
        trendEstablished: false,
        agreementLabel: "Donnée unique",
        trendLabel: trendWithLimited,
        classificationLabel: `Donnée unique — ${trendWithLimited.toLowerCase()}`,
    };
}
export function applyPresentationEvidenceRulesAll(domains) {
    return domains.map(applyPresentationEvidenceRules);
}
