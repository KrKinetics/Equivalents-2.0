const STATUS_LABELS = {
    usable: "Exploitable",
    general_health_goal_needs_operationalization: "Objectif général exploitable — à opérationnaliser",
    general_fitness_goal_needs_operationalization: "Objectif général de condition physique à opérationnaliser",
    strength_performance_goal_needs_targets: "Objectif de performance exploitable — mouvements, niveau actuel et cible à préciser",
    load_progression_indicator_needs_structure: "Progression des charges — indicateur mesurable à structurer",
    medical_indicator_requires_professional_context: "Indicateur mesurable — paramètres et suivi professionnel à préciser",
    food_quality_concept_needs_definition: "Qualité alimentaire — critères concrets à définir",
    wellbeing_goal_needs_definition: "Objectif de bien-être exploitable — dimensions prioritaires à définir.",
    wellbeing_success_indicator_needs_definition: "Indicateur subjectif de réussite — signes concrets à définir.",
    consistency_behavior_goal_needs_definition: "Objectif comportemental exploitable — fréquence et conditions de réussite à préciser.",
    meal_plan_obstacle_needs_semantic_clarification: "Plan alimentaire — besoin ou difficulté à préciser",
    body_composition_goal_needs_definition: "Objectif corporel identifiable — à définir et opérationnaliser",
    experience_goal: "Objectif d'expérience exploitable — à définir concrètement",
    behavior_goal_needs_frequency: "Objectif comportemental exploitable — fréquence à préciser",
    outcome_indicator_needs_definition: "Indicateur visuel à préciser",
    food_preference_list_needs_context: "Préférences alimentaires — contexte requis",
    multiple_goals_to_separate: "Plusieurs objectifs à séparer",
    vague: "Vague",
    needs_clarification: "À clarifier",
    missing: "Manquant",
};
const CANONICAL_KEYS = {
    general_health_goal_needs_operationalization: "general_health",
    general_fitness_goal_needs_operationalization: "general_fitness",
    strength_performance_goal_needs_targets: "strength_performance",
    load_progression_indicator_needs_structure: "load_progression",
    medical_indicator_requires_professional_context: "medical_markers",
    food_quality_concept_needs_definition: "food_quality",
    wellbeing_goal_needs_definition: "wellbeing_goal",
    wellbeing_success_indicator_needs_definition: "wellbeing_success_indicator",
    consistency_behavior_goal_needs_definition: "food_consistency",
    meal_plan_obstacle_needs_semantic_clarification: "meal_plan",
    body_composition_goal_needs_definition: "body_composition",
    experience_goal: "experience_goal",
    behavior_goal_needs_frequency: "behavior_frequency",
    outcome_indicator_needs_definition: "outcome_indicator",
};
const BODY = /\b(abdos?|abs|tour de taille|d[eé]finition|silhouette|six[\s-]?pack)\b/i;
const MIRROR = /\b(mirroir|miroir|reflet)\b/i;
const PLEASURE = /\b(m['']?\s*amus|plaisir|amus(er|ant)|fun|agr[eé]able)\b/i;
const VEG = /\b(l[eé]gumes?|salade|fibres?)\b/i;
const ENERGY = /\b([eé]nergie|vitalit)\b/i;
const GENERAL_FITNESS = /\b([eê]tre\s+)?en\s+forme\b/i;
const GENERAL_HEALTH = /(?:^|\s)(?:[eê]tre en sant[eé]|bien-[eê]tre|me sentir bien|sant[eé] g[eé]n[eé]rale)|en sant[eé]/i;
const WELLBEING = /\b(?:le\s+)?bien[-\s]?etre\b/i;
const WELLBEING_SUCCESS = /^\s*(?:etre|être)\s+bien\s*$/i;
const FOOD_CONSISTENCY = /\b(?:la\s+)?constan(?:ce|t)\b/i;
const MEDICAL = /\b(blood\s*work|analyses?\s*sanguines?|marqueurs?\s*sanguins?|bilan\s*sanguin|r[eé]sultats?\s*(m[eé]dic|labo)|cholest[eé]rol|glyc[eé]mie|h[eé]moglobine)\b/i;
const FOOD_QUALITY = /qualit[eé]|manger\s+(?:mieux|sain)|alimentation\s+saine/i;
const FOOD_TYPO = /\b(bouffe|nourrit+ure|nourit+urre|nouriture|alimentation)\b/i;
const STRENGTH_GOAL = /\b(devenir\s+fort|plus\s+fort|force|force\s+musculaire|gagner\s+en\s+force|get\s+strong)\b/i;
const LOAD_PROGRESSION = /\b(charges?\s+qui\s+mont\w*|progression\s+des\s+charges?|monter\s+les\s+charges?|1\s*rm|poids\s+soulev\w*)\b/i;
export function assessOpenAnswerStatus(answer) {
    const text = answer.trim();
    if (!text)
        return "missing";
    if (WELLBEING.test(text))
        return "wellbeing_goal_needs_definition";
    if (WELLBEING_SUCCESS.test(text))
        return "wellbeing_success_indicator_needs_definition";
    if (FOOD_CONSISTENCY.test(text))
        return "consistency_behavior_goal_needs_definition";
    if (GENERAL_HEALTH.test(text)) {
        return "general_health_goal_needs_operationalization";
    }
    if (GENERAL_FITNESS.test(text)) {
        return "general_fitness_goal_needs_operationalization";
    }
    if (STRENGTH_GOAL.test(text)) {
        return "strength_performance_goal_needs_targets";
    }
    if (LOAD_PROGRESSION.test(text)) {
        return "load_progression_indicator_needs_structure";
    }
    if (MEDICAL.test(text)) {
        return "medical_indicator_requires_professional_context";
    }
    if (FOOD_QUALITY.test(text) && !BODY.test(text)) {
        return "food_quality_concept_needs_definition";
    }
    if (PLEASURE.test(text))
        return "experience_goal";
    if (MIRROR.test(text) && !/\babdos?\b/i.test(text)) {
        return "outcome_indicator_needs_definition";
    }
    if (BODY.test(text))
        return "body_composition_goal_needs_definition";
    if (VEG.test(text))
        return "behavior_goal_needs_frequency";
    if (ENERGY.test(text) && text.length < 40)
        return "experience_goal";
    if (text.length < 8)
        return "vague";
    if (text.length < 20)
        return "needs_clarification";
    return "usable";
}
export function interviewQuestionFor(status, original) {
    if (status === "strength_performance_goal_needs_targets") {
        return {
            canonicalKey: "strength_performance",
            text: "Sur quels mouvements souhaitez-vous principalement devenir plus fort?",
        };
    }
    if (status === "wellbeing_goal_needs_definition") {
        return {
            canonicalKey: "wellbeing_goal",
            text: "Lorsque vous parlez de bien-être, pensez-vous surtout à votre énergie, votre humeur, votre sommeil, votre niveau de stress, votre confort physique ou votre fonctionnement quotidien?",
        };
    }
    if (status === "wellbeing_success_indicator_needs_definition") {
        return {
            canonicalKey: "wellbeing_success_indicator",
            text: "Quels signes concrets vous feraient dire que vous vous sentez mieux dans votre quotidien?",
        };
    }
    if (status === "consistency_behavior_goal_needs_definition") {
        return {
            canonicalKey: "food_consistency",
            text: "À quoi ressemblerait une semaine alimentaire suffisamment constante pour vous : nombre de repas structurés, fréquence de préparation, respect du menu ou capacité à reprendre après un écart?",
        };
    }
    if (status === "meal_plan_obstacle_needs_semantic_clarification") {
        return {
            canonicalKey: "meal_plan",
            text: "Lorsque vous mentionnez « meal plan », voulez-vous dire que vous avez besoin d'un menu précis, que vous avez de la difficulté à suivre un plan existant ou que l'absence de structure nuit à votre constance?",
        };
    }
    if (status === "load_progression_indicator_needs_structure") {
        return {
            canonicalKey: "load_progression",
            text: "Sur quels exercices souhaitez-vous suivre vos charges, et quelle progression représenterait une réussite?",
        };
    }
    if (status === "general_fitness_goal_needs_operationalization") {
        return {
            canonicalKey: "general_fitness",
            text: "Lorsque vous dites vouloir être en forme, pensez-vous surtout à votre énergie, votre endurance, votre force, votre composition corporelle ou vos capacités dans la vie quotidienne?",
        };
    }
    if (status === "general_health_goal_needs_operationalization") {
        return {
            canonicalKey: "general_health",
            text: "Quels changements concrets dans votre énergie, vos capacités physiques, votre sommeil ou vos habitudes représenteraient une meilleure santé?",
        };
    }
    if (status === "medical_indicator_requires_professional_context") {
        return {
            canonicalKey: "medical_markers",
            text: "Quels marqueurs souhaitez-vous suivre avec le professionnel de santé responsable de l'interprétation de vos analyses?",
        };
    }
    if (status === "food_quality_concept_needs_definition") {
        return {
            canonicalKey: "food_quality",
            text: "Lorsque vous parlez de qualité alimentaire, pensez-vous surtout aux aliments choisis, aux portions, à la régularité des repas, aux légumes, aux protéines ou à autre chose?",
        };
    }
    if (status === "body_composition_goal_needs_definition") {
        if (/abs\b/i.test(original) && !/abdo/i.test(original)) {
            return {
                canonicalKey: "body_composition",
                text: "Quel changement corporel concret souhaitez-vous observer et quels autres indicateurs utiliserons-nous pour suivre les progrès?",
            };
        }
        return {
            canonicalKey: "body_composition",
            text: "Recherchez-vous surtout une diminution du tour de taille, une meilleure définition musculaire ou les deux?",
        };
    }
    if (status === "outcome_indicator_needs_definition") {
        return {
            canonicalKey: "outcome_indicator",
            text: "Quels changements visibles dans le miroir représenteraient une réussite, et comment les évaluerez-vous de façon constante?",
        };
    }
    if (status === "behavior_goal_needs_frequency") {
        return {
            canonicalKey: "behavior_frequency",
            text: "À quelle fréquence ou dans quels repas souhaitez-vous augmenter votre consommation de légumes?",
        };
    }
    if (status === "experience_goal") {
        return {
            canonicalKey: "experience_goal",
            text: "Qu'est-ce qui rend une séance plaisante pour vous?",
        };
    }
    const fallbackKey = CANONICAL_KEYS[status] ?? `clarify_${status}`;
    if (status === "missing" || status === "vague" || status === "needs_clarification") {
        return {
            canonicalKey: fallbackKey,
            text: "Quel changement précis souhaitez-vous observer dans les prochaines semaines?",
        };
    }
    return {
        canonicalKey: fallbackKey,
        text: "Quelle action hebdomadaire concrète transformera cet objectif en habitude observable?",
    };
}
export function buildOpenAnswerAssessmentsV42(questions, answers) {
    const open = questions.filter((q) => q.active &&
        (q.type === "short_text" || q.type === "long_text") &&
        (q.interpretationTags?.includes("goal") ||
            q.interpretationTags?.includes("success") ||
            q.interpretationTags?.includes("nutrition_goal") ||
            q.interpretationTags?.includes("obstacle") ||
            q.code === "GOAL_01" ||
            q.code === "GOAL_02" ||
            q.code === "NUT_GOAL_01" ||
            q.code === "OBS_01"));
    return open.map((q) => {
        const answer = answers.find((a) => a.questionId === q.id);
        const originalAnswer = answer?.textValue?.trim() ?? "";
        const status = q.code === "GOAL_02" && WELLBEING_SUCCESS.test(originalAnswer)
            ? "wellbeing_success_indicator_needs_definition"
            : q.code === "GOAL_01" && WELLBEING.test(originalAnswer)
                ? "wellbeing_goal_needs_definition"
                : q.code.startsWith("NUT_GOAL") && FOOD_CONSISTENCY.test(originalAnswer)
                    ? "consistency_behavior_goal_needs_definition"
                    : q.code.startsWith("OBS") && /\bmeal\s+plan\b/i.test(originalAnswer)
                        ? "meal_plan_obstacle_needs_semantic_clarification"
                        : assessOpenAnswerStatus(originalAnswer);
        const interview = interviewQuestionFor(status, originalAnswer);
        const display = normalizeDisplayValue(originalAnswer);
        return {
            questionCode: q.code,
            originalAnswer: originalAnswer || "Non répondu",
            displayAnswer: display.displayValue,
            status,
            statusLabel: STATUS_LABELS[status],
            proposedInterviewQuestion: interview.text,
            interviewCanonicalKey: interview.canonicalKey,
            operationalGoal: status === "experience_goal" ||
                status === "body_composition_goal_needs_definition" ||
                status === "behavior_goal_needs_frequency" ||
                status === "general_health_goal_needs_operationalization" ||
                status === "general_fitness_goal_needs_operationalization" ||
                status === "food_quality_concept_needs_definition" ||
                status === "wellbeing_goal_needs_definition" ||
                status === "wellbeing_success_indicator_needs_definition" ||
                status === "consistency_behavior_goal_needs_definition" ||
                status === "usable"
                ? originalAnswer.slice(0, 160)
                : undefined,
        };
    });
}
export function normalizeOpenAnswerText(originalText) {
    const text = originalText.trim();
    const lower = text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
    if (/\bmeal\s+plan\b/i.test(text)) {
        return { originalText: text, normalizedLabel: "Plan alimentaire — besoin ou difficulté à préciser", semanticCategory: "meal_plan", clarificationNeeded: true };
    }
    if (MIRROR.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Indicateur visuel à préciser",
            semanticCategory: "other",
            clarificationNeeded: true,
        };
    }
    if (/\bdrogue\b|substance|consommation\s+(de\s+)?(drogue|substance)/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Consommation de substances – nature et impact à clarifier",
            semanticCategory: "substances",
            clarificationNeeded: true,
        };
    }
    if (/\bbudget\b|co[uû]t|cher|prix|financ/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Contraintes budgétaires alimentaires",
            semanticCategory: "budget",
            clarificationNeeded: true,
        };
    }
    // Preference wording must NEVER become an obstacle category.
    if (/rep[eè]res?\s+visuels?|portions?\s+et\s+des\s+rep[eè]res/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Portions et repères visuels (préférence)",
            semanticCategory: "other",
            clarificationNeeded: false,
        };
    }
    if (/difficult[eé].*portion|portion.*difficult|quantit[eé]|trop\s+(de\s+)?(manger|mang[eé])/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Difficulté avec les portions",
            semanticCategory: "portions",
            clarificationNeeded: true,
        };
    }
    if (/repas\s+(social|sociaux|famil)|famille|resto|invit/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Repas sociaux ou familiaux",
            semanticCategory: "social_meals",
            clarificationNeeded: true,
        };
    }
    if (/stress|[eé]motion|anxi[eé]t/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Stress ou émotions",
            semanticCategory: "stress_emotions",
            clarificationNeeded: true,
        };
    }
    if (FOOD_TYPO.test(text) || /bouffe|nourit|aliment/.test(lower)) {
        return {
            originalText: text,
            normalizedLabel: "Alimentation — obstacle général à préciser",
            semanticCategory: "food_general",
            clarificationNeeded: true,
        };
    }
    if (/qualit[eé]/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Qualité alimentaire - critères concrets à définir",
            semanticCategory: "food_quality",
            clarificationNeeded: true,
        };
    }
    if (/connaissance|savoir|[eé]tiquette/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Manque de connaissances alimentaires",
            semanticCategory: "food_knowledge",
            clarificationNeeded: true,
        };
    }
    if (/envies?\s+fr[eé]quentes?|\benvies?\b/i.test(text) && !/\bfaim\b/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Envies alimentaires fréquentes",
            semanticCategory: "cravings",
            clarificationNeeded: true,
        };
    }
    if (/constance|constan/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Manque de constance alimentaire",
            semanticCategory: "consistency",
            clarificationNeeded: true,
        };
    }
    if (/faim|affam/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Faim difficile à gérer",
            semanticCategory: "hunger",
            clarificationNeeded: true,
        };
    }
    if (/horaire\s+de\s+travail\s+variable|travail\s+variable/i.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Horaire de travail variable",
            semanticCategory: "schedule",
            clarificationNeeded: true,
        };
    }
    if (/planif/i.test(text)) {
        return { originalText: text, normalizedLabel: "Manque de planification", semanticCategory: "planning", clarificationNeeded: true };
    }
    if (GENERAL_FITNESS.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Objectif de forme générale — à opérationnaliser",
            semanticCategory: "general_fitness",
            clarificationNeeded: true,
        };
    }
    if (GENERAL_HEALTH.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Objectif général de santé — à opérationnaliser",
            semanticCategory: "general_health",
            clarificationNeeded: true,
        };
    }
    if (MEDICAL.test(text)) {
        return {
            originalText: text,
            normalizedLabel: "Marqueurs médicaux — suivi professionnel à préciser",
            semanticCategory: "medical_indicator",
            clarificationNeeded: true,
        };
    }
    return {
        originalText: text,
        normalizedLabel: text.slice(0, 80) || "Non précisé",
        semanticCategory: "other",
        clarificationNeeded: text.length < 20,
    };
}
export function obstacleValidationQuestion(n) {
    switch (n.semanticCategory) {
        case "substances":
            return "Lorsque vous mentionnez une consommation de substances, à quoi faites-vous référence et de quelle façon cela affecte-t-il votre sécurité, votre entraînement, votre sommeil, vos repas ou votre récupération?";
        case "budget":
            return "Quels aliments, repas ou moments de la semaine sont les plus difficiles à maintenir dans votre budget?";
        case "portions":
            return "La difficulté survient-elle surtout au moment de vous servir, pendant le repas, lorsque vous avez très faim ou dans certains contextes?";
        case "social_meals":
            return "Quels repas sociaux ou familiaux rendent vos intentions les plus difficiles à appliquer?";
        case "stress_emotions":
            return "Dans quelles situations le stress ou les émotions modifient-ils le plus vos repas, vos portions ou vos choix alimentaires?";
        case "planning":
            return "Lorsque vous parlez d'un manque de planification, la difficulté concerne-t-elle surtout la préparation des repas, l'organisation de la semaine, l'exécution du plan ou la reprise après une journée moins structurée?";
        case "meal_plan":
            return "Lorsque vous mentionnez « meal plan », voulez-vous dire que vous avez besoin d'un menu précis, que vous avez de la difficulté à suivre un plan existant ou que l'absence de structure nuit à votre constance?";
        case "schedule":
            return "Quels moments de votre horaire variable rendent la préparation alimentaire la plus difficile?";
        case "food_general":
            return "Lorsque vous dites que l'alimentation est un obstacle, pensez-vous surtout à la planification, aux aliments disponibles, aux envies, aux connaissances ou à autre chose?";
        case "food_knowledge":
            return "Quelles informations vous manquent le plus : choix d'aliments, portions, préparation, collations, alimentation autour de l'entraînement ou lecture des étiquettes?";
        case "cravings":
            return "À quels moments les envies apparaissent-elles, et sont-elles liées à la faim, au stress, à l'ennui, à l'habitude ou à la disponibilité d'un aliment?";
        case "consistency":
            return "À quoi ressemblerait une semaine alimentaire suffisamment constante pour vous, et dans quelles situations perdez-vous généralement cette constance?";
        case "hunger":
            return "À quels moments la faim devient-elle difficile à gérer?";
        default:
            return "Comment cet obstacle se manifeste-t-il concrètement dans une semaine typique?";
    }
}
export function obstaclePracticalAction(n) {
    switch (n.semanticCategory) {
        case "substances":
            return "Clarifier l'impact réel avant d'ajuster le plan. Rester dans le champ de pratique du coaching et recommander une ressource professionnelle appropriée lorsqu'un enjeu de santé ou de sécurité dépasse ce cadre.";
        case "budget":
            return "Construire quelques options économiques et interchangeables avec des aliments accessibles.";
        case "portions":
            return "Tester un repère de portion simple dans un seul repas avant de généraliser.";
        case "social_meals":
            return "Définir un ou deux repères flexibles plutôt qu'exiger un repas identique au plan.";
        case "stress_emotions":
            return "Préparer une réponse simple pour une situation fréquente, sans tenter de régler tous les contextes en même temps.";
        case "planning":
            return "Choisir un court moment de planification et une option de dépannage pour les repas non prévus.";
        case "meal_plan":
            return "Clarifier si le besoin porte sur un menu précis, le suivi d'un plan ou une structure de repas.";
        case "schedule":
            return "Définir une option de dépannage et un court moment de préparation compatible avec l'horaire variable.";
        case "food_general":
            return "Clarifier la catégorie réelle avant de modifier la structure alimentaire.";
        case "food_knowledge":
            return "Identifier les connaissances alimentaires manquantes.";
        case "cravings":
            return "Choisir un contexte fréquent, distinguer faim et envie, puis tester une stratégie simple adaptée à ce contexte.";
        case "consistency":
            return "Définir une action minimale après une journée difficile.";
        case "hunger":
            return "Repérer les moments où la faim devient difficile à gérer et tester un ajustement simple.";
        default:
            return "Clarifier comment cet obstacle se manifeste concrètement dans une semaine typique.";
    }
}
export function hasExperienceGoal(rows) {
    return rows.some((r) => r.status === "experience_goal" || PLEASURE.test(r.originalAnswer));
}
export function hasBodyGoal(rows) {
    return rows.some((r) => r.status === "body_composition_goal_needs_definition");
}
export function hasGeneralHealthGoal(rows) {
    return rows.some((r) => r.status === "general_health_goal_needs_operationalization");
}
export function hasGeneralFitnessGoal(rows) {
    return rows.some((r) => r.status === "general_fitness_goal_needs_operationalization");
}
export function hasMedicalIndicator(rows) {
    return rows.some((r) => r.status === "medical_indicator_requires_professional_context");
}
export function hasFoodQualityGoal(rows) {
    return rows.some((r) => r.status === "food_quality_concept_needs_definition");
}
export function hasStrengthGoal(rows) {
    return rows.some((r) => r.status === "strength_performance_goal_needs_targets");
}
export function hasLoadProgressionGoal(rows) {
    return rows.some((r) => r.status === "load_progression_indicator_needs_structure");
}
export function hasMirrorGoal(rows) {
    return rows.some((r) => r.status === "outcome_indicator_needs_definition");
}
export function hasWellbeingGoal(rows) {
    return rows.some((r) => r.status === "wellbeing_goal_needs_definition");
}
export function hasWellbeingSuccessIndicator(rows) {
    return rows.some((r) => r.status === "wellbeing_success_indicator_needs_definition");
}
export function hasConsistencyFoodGoal(rows) {
    return rows.some((r) => r.status === "consistency_behavior_goal_needs_definition");
}
export function hasMealPlanObstacle(rows) {
    return rows.some((r) => r.status === "meal_plan_obstacle_needs_semantic_clarification");
}
export function normalizeDisplayValue(originalValue) {
    const normalized = originalValue.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const displayValue = normalized === "le bien etre" ? "Le bien-être"
        : normalized === "etre bien" ? "Être bien"
            : normalized === "la constance" ? "La constance"
                : normalized === "meal plan" ? "Plan alimentaire"
                    : originalValue;
    return { originalValue, displayValue };
}
