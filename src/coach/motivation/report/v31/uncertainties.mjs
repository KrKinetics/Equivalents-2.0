const SPORT_GROUPS = [
    {
        category: "organization",
        title: "Organisation et constance",
        dimensions: ["self_efficacy", "behavioral_consistency", "structure_need"],
        template: (labels) => `Les réponses liées à ${labels.join(", ")} suggèrent une capacité de maintien variable. Une routine minimale et des mesures concrètes de préparation devront être testées au cours des premières semaines.`,
    },
    {
        category: "coaching",
        title: "Relation au coaching",
        dimensions: ["explanation_need", "choice_need", "coaching_receptivity", "autonomy_need"],
        template: (labels) => `Les réponses concernant ${labels.join(", ")} ne convergent pas complètement. Clarifier en entrevue le dosage d'explications, de choix et de feedback vraiment utile.`,
    },
    {
        category: "setbacks",
        title: "Réaction aux difficultés",
        dimensions: ["rigidity_perfectionism", "effort_tolerance"],
        template: (labels) => `Pour ${labels.join(" et ")}, la tendance majoritaire doit être confirmée, car une réponse opposée pourrait modifier la procédure après un écart ou un plateau.`,
    },
    {
        category: "motivation",
        title: "Motivation et projection",
        dimensions: [
            "autonomous_motivation",
            "results_driven_motivation",
            "long_term_orientation",
        ],
        template: (labels) => `Les éléments de ${labels.join(", ")} présentent des nuances. Distinguer motivation aux résultats, attente rapide et horizon à long terme plutôt que de conclure à un seul profil.`,
    },
];
const NUTRITION_GROUPS = [
    {
        category: "planning",
        title: "Planification et structure",
        dimensions: ["nutrition_planning_capacity", "nutrition_structure_need"],
        template: (labels) => `Pour ${labels.join(" et ")}, combiner des repères clairs avec une liberté réaliste plutôt que d'opposer structure et flexibilité.`,
    },
    {
        category: "flexibility",
        title: "Flexibilité et réaction aux écarts",
        dimensions: ["food_flexibility", "compensatory_food_response"],
        template: (labels) => `Les réponses sur ${labels.join(" et ")} méritent d'être explorées par contexte plutôt que généralisées.`,
    },
    {
        category: "signals",
        title: "Stress, émotions et signaux corporels",
        dimensions: ["emotional_food_influence", "hunger_satiety_awareness"],
        template: (labels) => `Concernant ${labels.join(" et ")}, identifier les situations concrètes avant de conclure à une tendance stable.`,
    },
    {
        category: "role",
        title: "Perception du rôle de l'alimentation",
        dimensions: ["nutrition_value_awareness", "performance_fueling_awareness"],
        template: (labels) => `Les réponses sur ${labels.join(" et ")} restent à confirmer pour calibrer le niveau d'accompagnement alimentaire.`,
    },
];
function isUncertain(ag) {
    return (ag.classification.startsWith("mixed") ||
        ag.classification === "strongly_divergent" ||
        ag.classification === "insufficient");
}
export function groupSportUncertainties(agreements, labels) {
    return group(SPORT_GROUPS, agreements, labels);
}
export function groupNutritionUncertainties(agreements, labels) {
    return group(NUTRITION_GROUPS, agreements, labels);
}
function group(defs, agreements, labels) {
    const out = [];
    for (const def of defs) {
        const hits = def.dimensions
            .map((d) => ({ d, ag: agreements.get(d) }))
            .filter((x) => Boolean(x.ag && isUncertain(x.ag)));
        if (hits.length === 0)
            continue;
        const dimensionLabels = hits.map((h) => labels[h.d] ?? h.d);
        const details = hits.map((h) => labels[h.d] ?? h.d);
        const summary = def.template(dimensionLabels, details);
        // PDF uses natural prose without repeating a parenthetical dimension list.
        const pdfSummary = summary.replace(/\s*\([^)]*\)\s*$/, "").trim();
        out.push({
            category: def.category,
            title: def.title,
            summary,
            pdfSummary,
            dimensionLabels,
        });
    }
    return out;
}
