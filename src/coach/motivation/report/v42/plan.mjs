import { choiceApproachChecklistLabel } from "./choice-approach.mjs";
const ACTION_VERBS = /^(Clarifier|Définir|Valider|Tester|Identifier|Choisir|Confirmer|Construire|Préciser|Repérer|Observer|Vérifier|Comparer|Ajuster|Déterminer|Créer|Réserver|Noter|Évaluer|Mesurer)\b/i;
function dedupe(items) {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.canonicalKey))
            return false;
        seen.add(item.canonicalKey);
        return true;
    });
}
function normalizeChecklistLabel(label) {
    const trimmed = label.replace(/\?$/, ".").trim();
    if (ACTION_VERBS.test(trimmed))
        return trimmed;
    return `Clarifier ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}
/** Priorities derived only from current-assessment signals — no universal mirror fallback. */
export function buildPersonalizedPrioritiesV42(input) {
    const priorities = [];
    if (input.hasWellbeingGoal) {
        priorities.push("Clarifier les dimensions du bien-être recherchées.");
    }
    if (input.hasMealPlanObstacle) {
        priorities.push("Clarifier ce que signifie « meal plan ».");
    }
    if (input.hasConsistencyFoodGoal) {
        priorities.push("Définir une semaine alimentaire suffisamment constante.");
    }
    if (input.hasLackOfPlanning) {
        priorities.push("Clarifier le manque de planification déclaré.");
    }
    if (input.hasStrengthGoal) {
        priorities.push("Préciser les mouvements sur lesquels le client souhaite devenir plus fort.");
    }
    if (input.hasLoadProgression) {
        priorities.push("Noter les charges, répétitions et RPE de départ.");
    }
    if (input.hasStrengthGoal || input.hasLoadProgression) {
        priorities.push("Définir les critères d'une progression réussie.");
    }
    if (input.hasGeneralHealthGoal) {
        priorities.push("Clarifier ce que signifie « être en santé ».");
    }
    if (input.hasGeneralFitnessGoal) {
        priorities.push("Préciser ce que signifie « être en forme » pour ce client.");
    }
    if (input.hasMedicalIndicator) {
        priorities.push("Préciser les marqueurs sanguins suivis avec le professionnel responsable.");
    }
    if (input.hasFoodQualityGoal) {
        priorities.push("Définir ce que signifie « qualité » alimentaire.");
    }
    if (input.hasBodyGoal) {
        priorities.push("Préciser ce que signifie l'objectif corporel déclaré et les indicateurs associés.");
    }
    if (input.hasMirrorGoal) {
        priorities.push("Définir trois indicateurs de progression autres que le miroir.");
    }
    if (input.recoveryUncertain) {
        priorities.push("Créer une version minimale de chaque séance.");
    }
    if (input.hasFoodObstacle) {
        priorities.push("Clarifier ce que le client entend par son obstacle alimentaire.");
    }
    if (input.hasSubstances) {
        priorities.push("Clarifier la consommation de substances et son impact.");
    }
    if (input.hasBudget) {
        priorities.push("Déterminer les contraintes liées au budget.");
    }
    if (input.hasPortionsObstacle) {
        priorities.push("Déterminer les contraintes liées aux portions.");
    }
    if (input.hasSocialMeals) {
        priorities.push("Définir des repères pour les repas sociaux ou familiaux.");
    }
    if (input.hasVariableSchedule) {
        priorities.push("Identifier les moments difficiles liés à l'horaire variable.");
    }
    if (input.hasCravings) {
        priorities.push("Clarifier les contextes associés aux envies fréquentes.");
    }
    if (input.hasVegGoal) {
        priorities.push("Choisir un premier objectif alimentaire simple lié aux légumes.");
    }
    if (input.followUpTwiceWeekly) {
        priorities.push("Tester deux contacts courts par semaine pendant les quatre premières semaines.");
    }
    return priorities.slice(0, input.hasWellbeingGoal ? 4 : 6);
}
export function buildFourWeekPlanV42(input) {
    const strengthPath = input.hasStrengthGoal || input.hasLoadProgression;
    const wellbeingPath = input.hasWellbeingGoal || input.hasMealPlanObstacle;
    const week1 = dedupe([
        ...(wellbeingPath
            ? [
                {
                    canonicalKey: "wellbeing_dimensions",
                    text: "Définir les dimensions du bien-être recherchées.",
                },
                {
                    canonicalKey: "wellbeing_success_signs",
                    text: "Définir les signes concrets de réussite.",
                },
                {
                    canonicalKey: "meal_plan",
                    text: "Clarifier ce que signifie « meal plan ».",
                },
                {
                    canonicalKey: "constant_week_def",
                    text: "Définir ce que représente une semaine alimentaire constante.",
                },
            ]
            : []),
        ...(strengthPath
            ? [
                {
                    canonicalKey: "strength_moves",
                    text: "Préciser les mouvements prioritaires.",
                },
                {
                    canonicalKey: "baseline_loads",
                    text: "Noter les charges, répétitions et RPE de départ.",
                },
                {
                    canonicalKey: "progress_criteria",
                    text: "Définir les critères de progression.",
                },
            ]
            : []),
        ...(input.hasGeneralFitnessGoal
            ? [
                {
                    canonicalKey: "general_fitness",
                    text: "Préciser ce que signifie « être en forme » pour ce client.",
                },
            ]
            : []),
        ...(input.hasFoodQualityGoal
            ? [
                {
                    canonicalKey: "food_quality",
                    text: "Définir ce que signifie « qualité » alimentaire.",
                },
            ]
            : []),
        ...(input.hasMirrorGoal
            ? [
                {
                    canonicalKey: "indicators_mirror",
                    text: "Définir trois indicateurs autres que le miroir.",
                },
            ]
            : []),
        {
            canonicalKey: "minimal",
            text: "Créer une version minimale de chaque séance.",
        },
        ...(input.hasFoodObstacle
            ? [
                {
                    canonicalKey: "clarify_food",
                    text: "Clarifier ce que le client entend par son obstacle alimentaire.",
                },
            ]
            : []),
    ]);
    const week2 = dedupe([
        ...(wellbeingPath ? [
            { canonicalKey: "constant_food_week", text: "Définir une semaine alimentaire suffisamment constante et réaliste." },
            { canonicalKey: "planning_gap", text: "Repérer ce qui manque concrètement pour planifier les repas." },
        ] : []),
        { canonicalKey: "verify", text: "Vérifier les séances réellement complétées." },
        {
            canonicalKey: "missed_reaction",
            text: "Observer la réaction après une séance manquée.",
        },
        ...(strengthPath
            ? [
                {
                    canonicalKey: "technique",
                    text: "Évaluer la technique et la récupération.",
                },
            ]
            : []),
        ...(input.hasVariableSchedule
            ? [
                {
                    canonicalKey: "schedule_hard",
                    text: "Repérer les moments difficiles liés à l'horaire variable.",
                },
            ]
            : []),
        ...(input.hasCravings
            ? [
                {
                    canonicalKey: "cravings",
                    text: "Identifier les contextes associés aux envies fréquentes.",
                },
            ]
            : []),
        ...(input.hasBudget
            ? [
                {
                    canonicalKey: "budget",
                    text: "Déterminer les contraintes liées au budget.",
                },
            ]
            : []),
        ...(input.hasSocialMeals
            ? [
                {
                    canonicalKey: "social",
                    text: "Observer les repas sociaux ou familiaux difficiles.",
                },
            ]
            : []),
    ]);
    const week3 = dedupe([
        ...(wellbeingPath ? [{ canonicalKey: "two_contacts", text: "Tester deux contacts courts pour soutenir l'application." }] : []),
        {
            canonicalKey: "volume",
            text: "Ajuster le volume selon la récupération.",
        },
        {
            canonicalKey: "choice",
            text: input.structuredAutonomy
                ? "Proposer des choix équivalents dans les exercices secondaires."
                : input.collaborativeChoice
                    ? "Tester une recommandation principale avec une seule alternative."
                    : "Tester le niveau de choix qui facilite l'action.",
        },
        {
            canonicalKey: "explanation",
            text: "Vérifier le niveau d'explication réellement utile.",
        },
        {
            canonicalKey: "feedback",
            text: input.softFeedback
                ? "Tester une méthode de feedback non confrontante."
                : "Tester un feedback court et direct.",
        },
        ...(input.hasVariableSchedule
            ? [
                {
                    canonicalKey: "food_options",
                    text: "Créer des options alimentaires adaptées à l'horaire variable.",
                },
            ]
            : wellbeingPath
                ? [
                    {
                        canonicalKey: "menu_precision_test",
                        text: "Tester un menu précis avec des quantités pendant une courte période.",
                    },
                ]
                : []),
    ]);
    const week4 = dedupe([
        {
            canonicalKey: "compare",
            text: strengthPath
                ? "Comparer les charges, répétitions, RPE et qualité technique."
                : "Comparer les hypothèses initiales aux comportements observés.",
        },
        {
            canonicalKey: "adherence",
            text: "Évaluer l'adhésion et la capacité de reprise.",
        },
        {
            canonicalKey: "obstacles_confirm",
            text: "Confirmer les principaux obstacles.",
        },
        {
            canonicalKey: "followup",
            text: "Ajuster la fréquence du suivi.",
        },
        {
            canonicalKey: "next",
            text: "Définir les priorités du prochain bloc.",
        },
    ]);
    return [
        {
            week: 1,
            title: strengthPath
                ? "Semaine 1 — Définir le projet de force"
                : wellbeingPath ? "Semaine 1 — Clarifier le bien-être et le plan alimentaire" : "Semaine 1 — Clarifier et simplifier",
            objective: strengthPath
                ? "Transformer l'objectif de force en cibles mesurables."
                : wellbeingPath ? "Transformer les repères subjectifs et alimentaires en actions observables." : "Transformer les objectifs et obstacles flous en actions observables.",
            actions: week1,
        },
        {
            week: 2,
            title: "Semaine 2 — Observer l'exécution réelle",
            objective: "Observer ce qui se produit réellement dans la semaine type.",
            actions: week2,
        },
        {
            week: 3,
            title: strengthPath
                ? "Semaine 3 — Ajuster le plan et l'autonomie"
                : "Semaine 3 — Ajuster le coaching",
            objective: "Calibrer choix, explications et feedback selon les réactions observées.",
            actions: week3,
        },
        {
            week: 4,
            title: "Semaine 4 — Mesurer et valider",
            objective: "Confirmer ou ajuster les hypothèses initiales avant le bloc suivant.",
            actions: week4,
        },
    ];
}
export function buildInterviewQuestionsV42(input) {
    const questions = [];
    for (const row of input.openAnswers) {
        if (row.status === "usable" || row.status === "missing")
            continue;
        questions.push({
            canonicalKey: row.interviewCanonicalKey,
            sourceQuestionCode: row.questionCode,
            category: "objective",
            text: row.proposedInterviewQuestion,
            priority: row.status === "strength_performance_goal_needs_targets" ||
                row.status === "load_progression_indicator_needs_structure" ||
                row.status === "wellbeing_goal_needs_definition" ||
                row.status === "wellbeing_success_indicator_needs_definition" ||
                row.status === "consistency_behavior_goal_needs_definition" ||
                row.status === "meal_plan_obstacle_needs_semantic_clarification" ||
                row.status === "general_health_goal_needs_operationalization" ||
                row.status === "general_fitness_goal_needs_operationalization" ||
                row.status === "medical_indicator_requires_professional_context" ||
                row.status === "food_quality_concept_needs_definition" ||
                row.status === "body_composition_goal_needs_definition" ||
                row.status === "outcome_indicator_needs_definition"
                ? "high"
                : "moderate",
        });
    }
    // Prefer declared planning/cravings after goal clarifications; keep max 5 unique.
    for (const obstacle of input.normalizedObstacles) {
        if (obstacle.canonicalId === "meal_plan")
            continue; // already covered via OBS open answer
        questions.push({
            canonicalKey: obstacle.canonicalId,
            sourceQuestionCode: obstacle.canonicalId,
            category: "obstacle",
            text: obstacle.planQuestion,
            priority: obstacle.canonicalId === "food_planning" ? "high" : "moderate",
        });
    }
    questions.push({
        canonicalKey: "choice_approach",
        sourceQuestionCode: "CHOICE",
        category: "coaching_preference",
        text: input.choiceApproach.validationQuestion,
        priority: "moderate",
    });
    if (input.followUpTwiceWeekly) {
        questions.push({
            canonicalKey: "follow_up_frequency",
            sourceQuestionCode: "FOLLOW_UP",
            category: "follow_up",
            text: "Deux contacts courts par semaine vous conviennent-ils pour les quatre premières semaines?",
            priority: "low",
        });
    }
    return dedupeInterviewQuestions(questions).slice(0, 5);
}
export function dedupeInterviewQuestions(questions) {
    const seen = new Set();
    const priorityRank = { high: 0, moderate: 1, low: 2 };
    return [...questions]
        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
        .filter((q) => {
        if (seen.has(q.canonicalKey))
            return false;
        seen.add(q.canonicalKey);
        return true;
    });
}
export function buildInterviewChecklistV42(input) {
    const items = [];
    const seen = new Set();
    const push = (id, label, category) => {
        const text = normalizeChecklistLabel(label);
        if (seen.has(text))
            return;
        seen.add(text);
        items.push({ id, label: text, category, sortOrder: items.length });
    };
    if (input.hasStrengthGoal) {
        push("strength", "Préciser les mouvements sur lesquels le client souhaite devenir plus fort.", "priority");
    }
    if (input.hasWellbeingGoal)
        push("wellbeing", "Clarifier les dimensions prioritaires du bien-être.", "priority");
    if (input.hasMealPlanObstacle)
        push("meal_plan", "Clarifier le besoin ou la difficulté derrière le plan alimentaire.", "obstacle");
    if (input.hasConsistencyFoodGoal)
        push("consistency_goal", "Définir une semaine alimentaire suffisamment constante.", "priority");
    if (input.hasLackOfPlanning)
        push("planning", "Clarifier le manque de planification déclaré.", "obstacle");
    if (input.hasLoadProgression) {
        push("loads", "Noter les charges, répétitions et RPE de référence.", "priority");
    }
    if (input.hasFoodQualityGoal) {
        push("quality", "Définir ce que signifie « qualité » alimentaire.", "priority");
    }
    if (input.hasFoodObstacle) {
        push("food", "Clarifier ce que le client entend par « bouffe » comme obstacle.", "obstacle");
    }
    if (input.hasVariableSchedule) {
        push("schedule", "Identifier les moments difficiles liés à l'horaire variable.", "obstacle");
    }
    if (input.hasCravings) {
        push("cravings", "Clarifier les contextes associés aux envies fréquentes.", "obstacle");
    }
    if (input.hasSocialMeals) {
        push("social", "Définir des repères pour les repas sociaux ou familiaux.", "obstacle");
    }
    for (const [i, p] of input.priorities.entries()) {
        push(`p_${i}`, p, "priority");
    }
    if (input.hasMirrorGoal) {
        push("mirror", "Définir les indicateurs corporels acceptables hors miroir.", "clarification");
    }
    if (input.hasSubstances) {
        push("substances", "Clarifier la consommation de substances et son impact.", "obstacle");
    }
    push("choice", choiceApproachChecklistLabel(input.choiceApproach), "clarification");
    if (input.softFeedback) {
        push("feedback", "Valider la manière de présenter les corrections.", "clarification");
    }
    return items.slice(0, 9);
}
