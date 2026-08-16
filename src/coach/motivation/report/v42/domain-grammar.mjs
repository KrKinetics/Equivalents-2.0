export const DOMAIN_GRAMMAR = {
    foodPerformanceLink: {
        grammaticalGender: "masculine",
        grammaticalNumber: "singular",
        subjectLabel: "Le lien alimentation-performance",
    },
    flexibility: {
        grammaticalGender: "feminine",
        grammaticalNumber: "singular",
        subjectLabel: "La flexibilité alimentaire",
    },
    feedbackReceptivity: {
        grammaticalGender: "feminine",
        grammaticalNumber: "singular",
        subjectLabel: "La réceptivité au feedback",
    },
    foodSignals: {
        grammaticalGender: "masculine",
        grammaticalNumber: "plural",
        subjectLabel: "Les signaux de faim et de satiété",
    },
    explanationNeed: {
        grammaticalGender: "masculine",
        grammaticalNumber: "singular",
        subjectLabel: "Le besoin d'explications",
    },
    structureNeed: {
        grammaticalGender: "masculine",
        grammaticalNumber: "singular",
        subjectLabel: "Le besoin de structure",
    },
    nutritionStructureNeed: {
        grammaticalGender: "masculine",
        grammaticalNumber: "singular",
        subjectLabel: "Le besoin de structure alimentaire",
    },
    foodReward: {
        grammaticalGender: "feminine",
        grammaticalNumber: "singular",
        subjectLabel: "L'utilisation de la nourriture comme récompense",
    },
    delayTolerance: {
        grammaticalGender: "feminine",
        grammaticalNumber: "singular",
        subjectLabel: "La tolérance aux délais",
    },
};
const LEVEL_ADJ = {
    low: { m: "faible", f: "faible", mp: "faibles", fp: "faibles" },
    moderate: { m: "modéré", f: "modérée", mp: "modérés", fp: "modérées" },
    high: { m: "élevé", f: "élevée", mp: "élevés", fp: "élevées" },
};
export function buildSingleItemEvidenceSentence(params) {
    const { grammar, level } = params;
    const adj = grammar.grammaticalNumber === "plural"
        ? grammar.grammaticalGender === "feminine"
            ? LEVEL_ADJ[level].fp
            : LEVEL_ADJ[level].mp
        : grammar.grammaticalGender === "feminine"
            ? LEVEL_ADJ[level].f
            : LEVEL_ADJ[level].m;
    const verb = grammar.grammaticalNumber === "plural" ? "paraissent" : "paraît";
    return `${grammar.subjectLabel} ${verb} ${adj}, mais cette lecture repose sur une seule réponse.`;
}
export function buildEstablishedEvidenceSentence(params) {
    const { grammar, level } = params;
    const adj = grammar.grammaticalNumber === "plural"
        ? grammar.grammaticalGender === "feminine"
            ? LEVEL_ADJ[level].fp
            : LEVEL_ADJ[level].mp
        : grammar.grammaticalGender === "feminine"
            ? LEVEL_ADJ[level].f
            : LEVEL_ADJ[level].m;
    const verb = grammar.grammaticalNumber === "plural" ? "paraissent" : "paraît";
    return `${grammar.subjectLabel} ${verb} ${adj}.`;
}
export const FORBIDDEN_GRAMMAR_PATTERNS = [
    /paraît\s+repose/i,
    /paraissent\s+repose/i,
    /lien\s+élevée/i,
    /besoin\s+paraît\s+élevée/i,
    /signaux\s+paraissent\s+élevée/i,
    /flexibilité\s+paraît\s+repose/i,
    /réceptivité\s+paraît\s+repose/i,
];
