/** Versioned deterministic rules — thresholds are data, not UI hardcoding. */
export const DEFAULT_RULESET_VERSION = "ruleset-v1";
export const DEFAULT_RULES = [
    {
        code: "results_over_long_term",
        type: "engagement_risk",
        title: "Dépendance aux résultats visibles",
        message: "Les réponses suggèrent que l'engagement du client pourrait diminuer lorsque les changements physiques tardent à apparaître.",
        coachingRecommendation: "Utiliser plusieurs indicateurs de progression et fixer des objectifs intermédiaires fréquents.",
        severity: "watch",
        conditions: [
            { dimension: "results_driven_motivation", operator: "gte", value: 70 },
            { dimension: "long_term_orientation", operator: "lte", value: 45 },
        ],
    },
    {
        code: "structured_collaborative",
        type: "coaching_style",
        title: "Cadre structuré et collaboratif",
        message: "Le client semble apprécier un cadre précis tout en souhaitant comprendre les décisions et participer aux ajustements.",
        coachingRecommendation: "Fournir une structure claire, expliquer les raisons et offrir certains choix encadrés.",
        severity: "info",
        conditions: [
            { dimension: "structure_need", operator: "gte", value: 70 },
            { dimension: "autonomy_need", operator: "gte", value: 65 },
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
        code: "high_self_efficacy",
        type: "motivation",
        title: "Confiance favorable à l'adhésion",
        message: "Les réponses suggèrent une confiance relativement élevée à maintenir des habitudes d'entraînement.",
        coachingRecommendation: "Capitaliser sur cette confiance tout en planifiant des filets de sécurité pour les périodes chargées.",
        severity: "info",
        conditions: [{ dimension: "self_efficacy", operator: "gte", value: 70 }],
    },
    {
        code: "high_coaching_receptivity",
        type: "communication",
        title: "Bonne réceptivité aux commentaires",
        message: "Cette tendance pourrait indiquer une ouverture utile aux ajustements et au feedback du coach.",
        coachingRecommendation: "Donner un feedback précis, concret et régulier; vérifier la compréhension plutôt que l'adhésion superficielle.",
        severity: "info",
        conditions: [{ dimension: "coaching_receptivity", operator: "gte", value: 70 }],
    },
    {
        code: "low_effort_tolerance",
        type: "engagement_risk",
        title: "Tolérance limitée à une progression lente",
        message: "Les réponses suggèrent qu'une progression perçue comme trop lente pourrait freiner la motivation.",
        coachingRecommendation: "Rendre visibles les gains non esthétiques (énergie, technique, constance) dès les premières semaines.",
        severity: "watch",
        conditions: [{ dimension: "effort_tolerance", operator: "lte", value: 40 }],
    },
];
export const DEFAULT_CONTRADICTIONS = [
    {
        code: "intent_vs_history",
        title: "Intention et historique à clarifier",
        message: "Certaines réponses semblent représenter des réalités différentes entre l'intention déclarée et le comportement passé. Cet élément devrait être discuté pendant l'entrevue.",
        left: { dimension: "autonomous_motivation", operator: "gte", value: 70 },
        right: { dimension: "behavioral_consistency", operator: "lte", value: 40 },
    },
    {
        code: "autonomy_vs_structure",
        title: "Autonomie et encadrement",
        message: "Les réponses combinent un fort besoin d'autonomie et un fort besoin de structure. Élément à valider pendant l'entrevue pour préciser le style d'accompagnement souhaité.",
        left: { dimension: "autonomy_need", operator: "gte", value: 70 },
        right: { dimension: "structure_need", operator: "gte", value: 70 },
    },
    {
        code: "confidence_vs_restart",
        title: "Confiance et reprise après interruption",
        message: "La confiance déclarée et la difficulté historique à reprendre pourraient ne pas raconter la même histoire. À explorer sans jugement en entrevue.",
        left: { dimension: "self_efficacy", operator: "gte", value: 70 },
        right: { dimension: "behavioral_consistency", operator: "lte", value: 40 },
    },
    {
        code: "slow_progress_vs_results",
        title: "Tolérance à la lenteur et résultats visibles",
        message: "Une forte dépendance aux résultats visibles combinée à une faible tolérance à la progression lente mérite une discussion explicite sur les attentes de délai.",
        left: { dimension: "results_driven_motivation", operator: "gte", value: 70 },
        right: { dimension: "effort_tolerance", operator: "lte", value: 40 },
    },
];
