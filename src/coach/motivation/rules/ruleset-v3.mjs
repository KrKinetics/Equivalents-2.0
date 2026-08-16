/** Versioned thresholds and rules for questionnaire-v3 / report-model-v3. */
export const RULESET_V3_VERSION = "ruleset-v3";
export const RULESET_V3_THRESHOLDS = {
    /** Normalized score spread within a dimension (0–100). */
    spreadMixed: 25,
    spreadDivergent: 50,
    /** Dominant motivational profile gates. */
    dominantMinScore: 65,
    dominantMinDifference: 15,
    /** Band helpers reused by narrative / plan. */
    highScore: 65,
    lowScore: 40,
};
/**
 * Sport-focused rules for v3. Uses explanation_need / choice_need instead of autonomy_need.
 * Nutrition cross-rules are evaluated in report/v3/insights.ts (need nutrition scores).
 */
export const RULES_V3 = [
    {
        code: "results_over_long_term",
        type: "engagement_risk",
        title: "Attentes rapides et horizon court",
        message: "Les réponses suggèrent des attentes relativement rapides envers les résultats, avec une orientation à long terme limitée. Cela pourrait fragiliser l'engagement lorsque les changements tardent.",
        coachingRecommendation: "Séparer motivation aux résultats et impatience : fixer des indicateurs non esthétiques et clarifier le délai réaliste dès l'entrevue.",
        severity: "watch",
        conditions: [
            { dimension: "results_driven_motivation", operator: "gte", value: 55 },
            { dimension: "long_term_orientation", operator: "lte", value: 35 },
        ],
    },
    {
        code: "explain_directed_frame",
        type: "coaching_style",
        title: "Cadre dirigé, mais expliqué",
        message: "Le client semble vouloir comprendre les décisions du programme sans nécessairement choisir lui-même la structure ou les exercices.",
        coachingRecommendation: "Expliquer les décisions, conserver un cadre dirigé et limiter le nombre d'options simultanées.",
        severity: "info",
        conditions: [
            { dimension: "explanation_need", operator: "gte", value: 65 },
            { dimension: "choice_need", operator: "lte", value: 45 },
        ],
    },
    {
        code: "explain_and_collaborate",
        type: "coaching_style",
        title: "Explications et décisions collaboratives",
        message: "Le client semble valoriser à la fois la logique du plan et une certaine marge de choix.",
        coachingRecommendation: "Fournir la logique du plan et proposer quelques décisions collaboratives encadrées.",
        severity: "info",
        conditions: [
            { dimension: "explanation_need", operator: "gte", value: 65 },
            { dimension: "choice_need", operator: "gte", value: 65 },
        ],
    },
    {
        code: "simple_direct_cues",
        type: "coaching_style",
        title: "Consignes simples et directes",
        message: "Les réponses suggèrent un besoin limité d'explications détaillées et de choix multiples.",
        coachingRecommendation: "Utiliser des consignes simples, directes et peu nombreuses.",
        severity: "info",
        conditions: [
            { dimension: "explanation_need", operator: "lte", value: 40 },
            { dimension: "choice_need", operator: "lte", value: 40 },
        ],
    },
    {
        code: "framed_choices_high_structure",
        type: "structure",
        title: "Choix encadrés dans un plan clair",
        message: "Un besoin de choix élevé combiné à un besoin de structure élevé suggère des options limitées à l'intérieur d'un plan très clair.",
        coachingRecommendation: "Offrir des choix encadrés (2–3 options équivalentes) à l'intérieur d'un plan précis.",
        severity: "info",
        conditions: [
            { dimension: "choice_need", operator: "gte", value: 65 },
            { dimension: "structure_need", operator: "gte", value: 65 },
        ],
    },
    {
        code: "all_or_nothing_risk",
        type: "adherence_risk",
        title: "Risque de réaction tout-ou-rien",
        message: "Le client pourrait percevoir un écart comme un échec plus important qu'il ne l'est réellement.",
        coachingRecommendation: "Prévoir des versions réduites des séances et une procédure simple de reprise.",
        severity: "priority",
        conditions: [
            { dimension: "rigidity_perfectionism", operator: "gte", value: 65 },
            { dimension: "behavioral_consistency", operator: "lte", value: 45 },
        ],
    },
    {
        code: "low_effort_tolerance",
        type: "engagement_risk",
        title: "Tolérance limitée à une progression lente",
        message: "Une progression perçue comme trop lente pourrait freiner la motivation. Cette hypothèse doit être confirmée en entrevue.",
        coachingRecommendation: "Rendre visibles les gains non esthétiques (énergie, technique, constance) dès les premières semaines.",
        severity: "watch",
        conditions: [{ dimension: "effort_tolerance", operator: "lte", value: 40 }],
    },
    {
        code: "high_structure_need",
        type: "structure",
        title: "Besoin de structure élevé",
        message: "Les réponses suggèrent qu'un cadre précis pourrait favoriser la constance.",
        coachingRecommendation: "Fournir un plan précis, peu de priorités simultanées et des jalons courts.",
        severity: "info",
        conditions: [{ dimension: "structure_need", operator: "gte", value: 65 }],
    },
    {
        code: "fragile_consistency",
        type: "adherence_risk",
        title: "Constance potentiellement fragile",
        message: "L'historique de constance semble limité; les interruptions pourraient être sensibles.",
        coachingRecommendation: "Prévoir un suivi plus fréquent au début et des filets de sécurité pour les semaines chargées.",
        severity: "watch",
        conditions: [{ dimension: "behavioral_consistency", operator: "lte", value: 40 }],
    },
];
export const CONTRADICTIONS_V3 = [
    {
        code: "intent_vs_history",
        title: "Intention et historique à clarifier",
        message: "Certaines réponses semblent représenter des réalités différentes entre l'intention déclarée et le comportement passé. Cet élément devrait être discuté pendant l'entrevue.",
        left: { dimension: "autonomous_motivation", operator: "gte", value: 70 },
        right: { dimension: "behavioral_consistency", operator: "lte", value: 40 },
    },
    {
        code: "slow_progress_vs_results",
        title: "Tolérance à la lenteur et résultats visibles",
        message: "Une dépendance aux résultats visibles combinée à une faible tolérance à la progression lente mérite une discussion explicite sur les attentes de délai.",
        left: { dimension: "results_driven_motivation", operator: "gte", value: 65 },
        right: { dimension: "effort_tolerance", operator: "lte", value: 40 },
    },
    {
        code: "confidence_vs_restart",
        title: "Confiance déclarée et reprise",
        message: "La confiance déclarée et la difficulté historique à reprendre pourraient ne pas raconter la même histoire. À explorer sans jugement en entrevue.",
        left: { dimension: "self_efficacy", operator: "gte", value: 70 },
        right: { dimension: "behavioral_consistency", operator: "lte", value: 40 },
    },
];
