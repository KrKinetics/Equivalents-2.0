export const PROFILE_DIMENSIONS = [
    "autonomous_motivation",
    "results_driven_motivation",
    "self_efficacy",
    "structure_need",
    "autonomy_need",
    /** v3 — replaces autonomy_need for new assessments */
    "explanation_need",
    "choice_need",
    "effort_tolerance",
    "rigidity_perfectionism",
    "coaching_receptivity",
    "behavioral_consistency",
    "long_term_orientation",
];
export const DIMENSION_LABELS_FR = {
    autonomous_motivation: "Motivation autonome",
    results_driven_motivation: "Motivation orientée résultats",
    self_efficacy: "Confiance à maintenir ses habitudes",
    structure_need: "Besoin de structure",
    autonomy_need: "Besoin d'autonomie",
    explanation_need: "Besoin d'explications",
    choice_need: "Besoin de choix",
    effort_tolerance: "Tolérance à l'effort et à la progression lente",
    rigidity_perfectionism: "Rigidité / perfectionnisme",
    coaching_receptivity: "Réceptivité aux commentaires",
    behavioral_consistency: "Historique de constance",
    long_term_orientation: "Orientation à long terme",
};
/** Nutrition dimensions — scored separately from sport profile dimensions. */
export const NUTRITION_DIMENSIONS = [
    "nutrition_value_awareness",
    "performance_fueling_awareness",
    "nutrition_planning_capacity",
    "food_flexibility",
    /** v3 — compensatory tendency after a perceived food lapse */
    "compensatory_food_response",
    "emotional_food_influence",
    "nutrition_structure_need",
    "hunger_satiety_awareness",
];
export const NUTRITION_DIMENSION_LABELS_FR = {
    nutrition_value_awareness: "Valeur accordée à l'alimentation",
    performance_fueling_awareness: "Lien alimentation–performance",
    nutrition_planning_capacity: "Capacité de planification alimentaire",
    food_flexibility: "Flexibilité alimentaire",
    compensatory_food_response: "Réponse compensatoire alimentaire",
    emotional_food_influence: "Influence émotionnelle sur l'alimentation",
    nutrition_structure_need: "Besoin de structure alimentaire",
    hunger_satiety_awareness: "Perception faim et satiété",
};
export function isNutritionDimension(value) {
    return NUTRITION_DIMENSIONS.includes(value);
}
export function isProfileDimension(value) {
    return PROFILE_DIMENSIONS.includes(value);
}
