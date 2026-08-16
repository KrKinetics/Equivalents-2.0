/**
 * Visible French labels for report-model-v3.1 — never show raw enum keys in UI/PDF.
 */
export const PREPARATION_LABELS = {
    fragile: "fragile",
    developing: "en développement",
    adequate: "adéquate",
    adequate_with_conditions: "adéquate sous conditions",
    strong: "solide",
};
export const STRUCTURE_LABELS = {
    low: "faible",
    moderate: "modéré",
    high: "élevé",
};
export const FOLLOW_UP_LABELS = {
    each_session: "après chaque séance",
    twice_weekly: "deux fois par semaine",
    weekly: "hebdomadaire",
    biweekly: "toutes les deux semaines",
};
export const IMPORTANCE_LABELS = {
    low: "Importance faible",
    moderate: "Importance modérée",
    high: "Importance élevée",
};
export const EVIDENCE_STRENGTH_LABELS = {
    limited: "Solidité limitée",
    moderate: "Solidité modérée",
    reinforced: "Solidité renforcée",
    contradictory: "Réponses contradictoires",
};
export const FINDING_TYPE_LABELS = {
    priority: "Priorité",
    strength: "Force",
    risk: "Risque",
    clarification: "Point à clarifier",
    /** Legacy snapshot aliases mapped for display. */
    coaching_preference: "Préférence d'accompagnement",
    action: "Action",
};
export const DECISION_PREFERENCE_LABELS = {
    coach_directed: "Cadre dirigé par le coach",
    guided_choice: "Choix encadrés",
    collaborative: "Collaboratif",
    high_autonomy: "Forte autonomie",
    uncertain: "À préciser en entrevue",
};
export const OPEN_ANSWER_QUALITY_LABELS = {
    usable: "Exploitable",
    usable_needs_operationalization: "Exploitable — à opérationnaliser",
    measurable_but_underspecified: "Mesurable mais trop vague",
    multiple_goals_to_separate: "Plusieurs objectifs à séparer",
    vague: "Vague",
    needs_clarification: "À clarifier",
    missing: "Absente",
    brief: "Brève",
};
export const REPORT_USABILITY_LABELS = {
    high: "Élevée",
    moderate: "Utilisable avec validation",
    limited: "Limitée",
    strong: "Solide",
    usable_with_validation: "Utilisable avec validation",
};
export const READINESS_SUB_LABELS = {
    changeIntention: {
        limited: "Intention de changement limitée",
        unclear: "Intention de changement à clarifier",
        adequate: "Intention de changement adéquate",
        strong: "Intention de changement élevée",
    },
    consistencyCapacity: {
        limited: "Capacité de constance limitée",
        variable: "Capacité de constance variable",
        favorable: "Capacité de constance favorable",
    },
    goalClarity: {
        low: "Clarté des objectifs faible",
        moderate: "Clarté des objectifs modérée",
        high: "Clarté des objectifs élevée",
    },
    difficultyTolerance: {
        fragile: "Tolérance à la difficulté fragile",
        variable: "Tolérance à la difficulté variable",
        favorable: "Tolérance à la difficulté favorable",
    },
    recoveryCapacity: {
        unconfirmed: "Récupération après écart non confirmée",
        fragile: "Récupération après écart fragile",
        adequate: "Récupération après écart adéquate",
    },
};
/** English/internal tokens that must never appear in coach-facing PDF text. */
export const FORBIDDEN_TECHNICAL_TOKENS = [
    "developing",
    "fragile",
    "adequate",
    "adequate_with_conditions",
    "strong",
    "moderate",
    "high",
    "low",
    "weekly",
    "biweekly",
    "each_session",
    "twice_weekly",
    "limited",
    "reinforced",
    "contradictory",
    "guided_choice",
    "coach_directed",
    "collaborative",
    "high_autonomy",
    "uncertain",
    "coherent_high",
    "mixed_high",
    "strongly_divergent",
    "report-model-v3",
    "schemaVersion",
    "usable_needs_operationalization",
    "measurable_but_underspecified",
    "multiple_goals_to_separate",
];
