import { invertNormalizedScore, normalizeLikertMean, } from "./normalize.mjs";
export const V41_DOMAIN_DEFINITIONS = [
    {
        domainId: "autonomous_motivation",
        label: "Alignement avec l'identité souhaitée",
        coreCodes: ["MOT_AUTO_01"],
        adaptiveCodes: [],
        affectedDecisionIds: ["communication_style", "follow_up_frequency"],
    },
    {
        domainId: "autonomous_value_without_results",
        label: "Valeur personnelle sans résultats rapides",
        coreCodes: [],
        adaptiveCodes: ["MOT_AUTO_02"],
        affectedDecisionIds: ["communication_style", "follow_up_frequency"],
    },
    {
        domainId: "results_orientation",
        label: "Importance des résultats visibles",
        coreCodes: ["MOT_RES_01"],
        adaptiveCodes: [],
        affectedDecisionIds: ["communication_style", "follow_up_frequency"],
    },
    {
        domainId: "results_delay_sensitivity",
        label: "Sensibilité au délai avant les résultats",
        coreCodes: [],
        adaptiveCodes: ["MOT_RES_02"],
        affectedDecisionIds: ["follow_up_frequency", "communication_style"],
    },
    {
        domainId: "adherence_recovery",
        label: "Adhésion et capacité de reprise",
        coreCodes: ["EFF_01", "EFF_02", "CONS_01"],
        adaptiveCodes: ["EFF_03", "CONS_02", "CONS_03"],
        affectedDecisionIds: [
            "follow_up_frequency",
            "recovery_protocol",
            "training_structure",
        ],
    },
    {
        domainId: "adherence_maintenance",
        label: "Maintien pendant les semaines chargées",
        coreCodes: ["EFF_01"],
        adaptiveCodes: ["EFF_03"],
        affectedDecisionIds: ["follow_up_frequency", "training_structure"],
    },
    {
        domainId: "adherence_recovery_signal",
        label: "Reprise après interruption",
        coreCodes: ["EFF_02"],
        adaptiveCodes: ["CONS_02"],
        affectedDecisionIds: ["recovery_protocol", "follow_up_frequency"],
    },
    {
        domainId: "adherence_history",
        label: "Préparation comportementale antérieure",
        coreCodes: ["CONS_01"],
        adaptiveCodes: ["CONS_03"],
        affectedDecisionIds: ["follow_up_frequency", "training_structure"],
    },
    {
        domainId: "all_or_nothing",
        label: "Fonctionnement tout-ou-rien",
        coreCodes: ["RIG_01", "RIG_03"],
        adaptiveCodes: ["RIG_02"],
        affectedDecisionIds: ["all_or_nothing_protocol", "recovery_protocol"],
    },
    {
        domainId: "delay_tolerance",
        label: "Tolérance aux délais",
        coreCodes: ["EFFORT_02"],
        adaptiveCodes: ["EFFORT_03"],
        affectedDecisionIds: ["follow_up_frequency"],
    },
    {
        domainId: "long_term_projection",
        label: "Projection à long terme",
        coreCodes: ["LT_03"],
        adaptiveCodes: ["LT_01"],
        affectedDecisionIds: ["follow_up_frequency", "training_structure"],
    },
    {
        domainId: "structure_need",
        label: "Besoin de structure",
        coreCodes: ["STRUCT_03"],
        adaptiveCodes: ["STRUCT_01"],
        affectedDecisionIds: ["training_structure"],
    },
    {
        domainId: "explanation_need",
        label: "Besoin d'explications",
        coreCodes: ["EXPL_01"],
        adaptiveCodes: ["EXPL_03"],
        affectedDecisionIds: ["communication_style"],
    },
    {
        domainId: "choice_interest",
        label: "Intérêt pour les choix",
        coreCodes: ["CHOICE_01"],
        adaptiveCodes: ["CHOICE_02"],
        affectedDecisionIds: ["choice_approach"],
    },
    {
        domainId: "option_overload",
        label: "Risque de surcharge devant trop d'options",
        coreCodes: ["CHOICE_03"],
        adaptiveCodes: [],
        useRawLikert: true,
        affectedDecisionIds: ["choice_approach"],
    },
    {
        domainId: "coach_receptivity",
        label: "Réceptivité au feedback direct",
        coreCodes: ["COACH_01"],
        adaptiveCodes: ["COACH_02"],
        affectedDecisionIds: ["communication_style"],
    },
    {
        domainId: "nutrition_value",
        label: "Importance globale de l'alimentation",
        coreCodes: ["NUT_ROLE_01"],
        adaptiveCodes: ["NUT_ROLE_02"],
        affectedDecisionIds: ["food_planning_approach"],
    },
    {
        domainId: "performance_fueling",
        label: "Lien alimentation-performance",
        coreCodes: ["NUT_PERF_01"],
        adaptiveCodes: ["NUT_PERF_02"],
        affectedDecisionIds: ["food_planning_approach"],
    },
    {
        domainId: "nutrition_planning",
        label: "Planification alimentaire",
        coreCodes: ["NUT_PLAN_02", "NUT_PLAN_03"],
        adaptiveCodes: ["NUT_PLAN_01"],
        affectedDecisionIds: ["food_planning_approach", "food_structure"],
    },
    {
        domainId: "food_flexibility",
        label: "Flexibilité alimentaire",
        coreCodes: ["NUT_FLEX_01"],
        adaptiveCodes: ["NUT_FLEX_04"],
        affectedDecisionIds: ["food_recovery_protocol"],
    },
    {
        domainId: "compensatory_food",
        label: "Réaction compensatoire",
        coreCodes: ["NUT_COMP_01", "NUT_COMP_03"],
        adaptiveCodes: ["NUT_COMP_02"],
        affectedDecisionIds: ["food_recovery_protocol"],
    },
    {
        domainId: "emotional_stress_food",
        label: "Perturbation sous stress",
        coreCodes: ["NUT_EMO_01"],
        adaptiveCodes: [],
        affectedDecisionIds: ["food_recovery_protocol"],
    },
    {
        domainId: "emotional_reward_food",
        label: "Nourriture comme récompense",
        coreCodes: ["NUT_EMO_02"],
        adaptiveCodes: [],
        affectedDecisionIds: ["food_recovery_protocol"],
    },
    {
        domainId: "nutrition_structure",
        label: "Besoin de structure alimentaire",
        coreCodes: ["NUT_STRUCT_01", "NUT_STRUCT_03"],
        adaptiveCodes: ["NUT_STRUCT_02"],
        affectedDecisionIds: ["food_structure", "food_planning_approach"],
    },
    {
        domainId: "hunger_signals",
        label: "Signaux de faim et de satiété",
        coreCodes: ["NUT_SIGNAL_01", "NUT_SIGNAL_03"],
        adaptiveCodes: ["NUT_SIGNAL_02"],
        affectedDecisionIds: ["food_structure"],
    },
];
/** Domains shown in main indicator tables (exclude pure sub-signals). */
export const V41_PRIMARY_DOMAIN_IDS = new Set([
    "autonomous_motivation",
    "results_orientation",
    "results_delay_sensitivity",
    "autonomous_value_without_results",
    "adherence_recovery",
    "all_or_nothing",
    "delay_tolerance",
    "long_term_projection",
    "structure_need",
    "explanation_need",
    "choice_interest",
    "option_overload",
    "coach_receptivity",
    "nutrition_value",
    "performance_fueling",
    "nutrition_planning",
    "food_flexibility",
    "compensatory_food",
    "emotional_stress_food",
    "emotional_reward_food",
    "nutrition_structure",
    "hunger_signals",
]);
export function classifyBroadDirection(normalizedValue) {
    if (normalizedValue <= 25)
        return "low";
    if (normalizedValue >= 75)
        return "high";
    return "moderate";
}
function extractNormalized(question, answers, useRawLikert) {
    const answer = answers.find((a) => a.questionId === question.id);
    if (answer?.numericValue == null)
        return null;
    let n = normalizeLikertMean(answer.numericValue, question.likertMin ?? 1, question.likertMax ?? 5);
    if (!useRawLikert && question.scoringDirection === "negative") {
        n = invertNormalizedScore(n);
    }
    return n;
}
function classifyTwo(a, b) {
    if (a === b)
        return { agreement: "consistent", direction: a };
    const set = new Set([a, b]);
    if (set.has("moderate") && set.has("high")) {
        return { agreement: "mixed", direction: "high" };
    }
    if (set.has("moderate") && set.has("low")) {
        return { agreement: "mixed", direction: "low" };
    }
    return { agreement: "strongly_divergent", direction: "none" };
}
export function classifyMany(directions) {
    if (directions.length === 0) {
        return { agreement: "insufficient", direction: "none" };
    }
    if (directions.length === 1) {
        return { agreement: "insufficient", direction: directions[0] };
    }
    if (directions.length === 2) {
        return classifyTwo(directions[0], directions[1]);
    }
    const counts = { low: 0, moderate: 0, high: 0 };
    for (const d of directions)
        counts[d] += 1;
    const ranked = ["high", "low", "moderate"].sort((x, y) => counts[y] - counts[x]);
    const top = ranked[0];
    const topCount = counts[top];
    if (topCount === directions.length) {
        return { agreement: "consistent", direction: top };
    }
    if (topCount >= 2) {
        return { agreement: "mixed", direction: top };
    }
    if (counts.low === 1 && counts.moderate === 1 && counts.high === 1) {
        return { agreement: "strongly_divergent", direction: "none" };
    }
    return { agreement: "mixed", direction: top };
}
function levelFromDirection(direction, agreement, invertLevel) {
    if (agreement === "strongly_divergent" || direction === "none") {
        return "uncertain";
    }
    let level = direction;
    if (invertLevel) {
        if (level === "high")
            level = "low";
        else if (level === "low")
            level = "high";
    }
    return level;
}
export function toTrendDisplay(agreement, level) {
    if (agreement === "insufficient")
        return "limited_data";
    if (agreement === "strongly_divergent" || level === "uncertain") {
        return "not_established";
    }
    if (agreement === "consistent") {
        if (level === "high")
            return "high";
        if (level === "low")
            return "low";
        return "moderate";
    }
    // mixed with majority direction
    if (level === "high")
        return "high_to_confirm";
    if (level === "low")
        return "low_to_confirm";
    return "moderate_to_confirm";
}
export function agreementLabelFr(agreement) {
    switch (agreement) {
        case "consistent":
            return "Cohérente";
        case "mixed":
            return "Mixte";
        case "strongly_divergent":
            return "Fortement divergente";
        case "insufficient":
            return "Données limitées";
    }
}
export function trendLabelFr(trend) {
    switch (trend) {
        case "low":
            return "Faible";
        case "low_to_confirm":
            return "Faible à confirmer";
        case "moderate":
            return "Modérée";
        case "moderate_to_confirm":
            return "Modérée à confirmer";
        case "high":
            return "Élevée";
        case "high_to_confirm":
            return "Élevée à confirmer";
        case "not_established":
            return "Non établie";
        case "limited_data":
            return "Données limitées";
    }
}
function classificationLabel(agreement, trend) {
    if (agreement === "insufficient" || trend === "limited_data") {
        return "Données limitées";
    }
    if (agreement === "strongly_divergent" || trend === "not_established") {
        return "Fortement divergente — tendance non établie";
    }
    const trendText = trendLabelFr(trend).toLowerCase();
    if (agreement === "consistent") {
        return `Cohérente — tendance ${trendText.replace(" à confirmer", "")}`;
    }
    return `Mixte — tendance ${trendText}`;
}
function buildInterpretationText(def, level, agreement, trend) {
    if (trend === "not_established") {
        return `${def.label} : réponses contradictoires — tendance non établie. À confirmer en entrevue.`;
    }
    if (trend === "limited_data") {
        return `${def.label} : données limitées.`;
    }
    if (agreement === "insufficient" && level !== "uncertain") {
        return `${def.label} : ${trendLabelFr(trend).toLowerCase()} (solidité limitée — une seule réponse de base).`;
    }
    const adj = trendLabelFr(trend).toLowerCase();
    const solid = agreement === "consistent"
        ? "et cohérente"
        : agreement === "mixed"
            ? "— à confirmer"
            : "";
    return `${def.label} : ${adj} ${solid}`.trim();
}
export function interpretDomain(input) {
    const def = input.definition;
    const byCode = new Map(input.questions.map((q) => [q.code, q]));
    const coreScores = [];
    const adaptiveScores = [];
    for (const code of def.coreCodes) {
        const q = byCode.get(code);
        if (!q)
            continue;
        const n = extractNormalized(q, input.answers, def.useRawLikert);
        if (n === null)
            continue;
        coreScores.push({ code, normalized: n });
    }
    for (const code of def.adaptiveCodes) {
        const q = byCode.get(code);
        if (!q)
            continue;
        const n = extractNormalized(q, input.answers, def.useRawLikert);
        if (n === null)
            continue;
        adaptiveScores.push({ code, normalized: n });
    }
    const all = [...coreScores, ...adaptiveScores];
    const values = all.map((s) => s.normalized);
    const itemCount = values.length;
    const affectedDecisionIds = def.affectedDecisionIds ?? [];
    if (itemCount === 0) {
        return {
            domainId: def.domainId,
            label: def.label,
            level: "uncertain",
            agreement: "insufficient",
            trendDisplay: "limited_data",
            evidenceStrength: "limited",
            trendEstablished: false,
            contributingQuestionCodes: [],
            adaptiveQuestionCodes: [],
            opposingQuestionCodes: [],
            interpretation: `${def.label} : données insuffisantes.`,
            itemCount: 0,
            coreItemCount: 0,
            adaptiveItemCount: 0,
            normalizedValues: [],
            classificationLabel: "Données limitées",
            agreementLabel: "Données limitées",
            trendLabel: "Données limitées",
            affectedDecisionIds,
        };
    }
    const directions = values.map(classifyBroadDirection);
    let { agreement, direction } = classifyMany(directions);
    if (adaptiveScores.length > 0 && coreScores.length > 0) {
        const coreDirs = coreScores.map((s) => classifyBroadDirection(s.normalized));
        const coreAgg = classifyMany(coreDirs);
        const adaptiveDirs = adaptiveScores.map((s) => classifyBroadDirection(s.normalized));
        const sameAsCore = coreAgg.direction !== "none" &&
            adaptiveDirs.every((d) => d === coreAgg.direction || d === "moderate");
        const opposesCore = coreAgg.direction !== "none" &&
            adaptiveDirs.some((d) => (coreAgg.direction === "high" && d === "low") ||
                (coreAgg.direction === "low" && d === "high"));
        if (opposesCore) {
            agreement = "strongly_divergent";
            direction = "none";
        }
        else if (sameAsCore && agreement === "mixed") {
            agreement = coreAgg.agreement === "consistent" ? "consistent" : "mixed";
            direction = coreAgg.direction;
        }
        else if (sameAsCore && coreAgg.agreement === "consistent") {
            agreement = "consistent";
            direction = coreAgg.direction;
        }
    }
    // Single answered item: treat as consistent direction with limited evidence
    if (itemCount === 1 && agreement === "insufficient" && direction !== "none") {
        agreement = "consistent";
    }
    const level = levelFromDirection(direction, agreement, def.invertLevel);
    const trendDisplay = toTrendDisplay(agreement, level);
    const technicalScore = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    let evidenceStrength = "limited";
    if (agreement === "strongly_divergent")
        evidenceStrength = "contradictory";
    else if (agreement === "consistent" && itemCount >= 2) {
        evidenceStrength =
            itemCount >= 3 || adaptiveScores.length > 0 ? "reinforced" : "moderate";
    }
    else if (agreement === "mixed")
        evidenceStrength = "moderate";
    else if (itemCount === 1 && level !== "uncertain")
        evidenceStrength = "limited";
    const dominant = direction === "none" ? null : direction;
    const opposing = all
        .filter((s) => dominant && classifyBroadDirection(s.normalized) !== dominant)
        .map((s) => s.code);
    return {
        domainId: def.domainId,
        label: def.label,
        technicalScore,
        level,
        agreement,
        trendDisplay,
        evidenceStrength,
        trendEstablished: agreement === "consistent",
        contributingQuestionCodes: all.map((s) => s.code),
        adaptiveQuestionCodes: adaptiveScores.map((s) => s.code),
        opposingQuestionCodes: opposing,
        interpretation: buildInterpretationText(def, level, agreement, trendDisplay),
        itemCount,
        coreItemCount: coreScores.length,
        adaptiveItemCount: adaptiveScores.length,
        normalizedValues: values,
        classificationLabel: classificationLabel(agreement, trendDisplay),
        agreementLabel: agreementLabelFr(agreement),
        trendLabel: trendLabelFr(trendDisplay),
        affectedDecisionIds,
    };
}
export function interpretAllDomains(input) {
    return V41_DOMAIN_DEFINITIONS.map((definition) => interpretDomain({
        definition,
        questions: input.questions,
        answers: input.answers,
    })).filter((d) => {
        if (d.itemCount === 0)
            return false;
        if (input.primaryOnly && !V41_PRIMARY_DOMAIN_IDS.has(d.domainId))
            return false;
        return true;
    });
}
export function toCoachingIndicator(domain, action) {
    return {
        domainId: domain.domainId,
        technicalScore: domain.technicalScore,
        level: domain.level,
        evidenceStrength: domain.evidenceStrength,
        itemCount: domain.itemCount,
        coreItemCount: domain.coreItemCount,
        adaptiveItemCount: domain.adaptiveItemCount,
        interpretation: domain.interpretation,
        action,
        trendDisplay: domain.trendDisplay,
    };
}
export function buildAdherenceBreakdown(input) {
    const byId = (id) => V41_DOMAIN_DEFINITIONS.find((d) => d.domainId === id);
    const maintenance = interpretDomain({
        definition: byId("adherence_maintenance"),
        questions: input.questions,
        answers: input.answers,
    });
    const recovery = interpretDomain({
        definition: byId("adherence_recovery_signal"),
        questions: input.questions,
        answers: input.answers,
    });
    const history = interpretDomain({
        definition: byId("adherence_history"),
        questions: input.questions,
        answers: input.answers,
    });
    const overall = interpretDomain({
        definition: byId("adherence_recovery"),
        questions: input.questions,
        answers: input.answers,
    });
    return {
        maintenanceDuringBusyPeriods: toCoachingIndicator(maintenance),
        recoveryAfterInterruption: toCoachingIndicator(recovery),
        behavioralPreparationHistory: toCoachingIndicator(history),
        overall: toCoachingIndicator(overall),
    };
}
export function levelLabelFr(level) {
    switch (level) {
        case "high":
            return "élevée";
        case "low":
            return "faible";
        case "moderate":
            return "modérée";
        case "uncertain":
            return "incertaine";
    }
}
export function componentLabelFromDomain(d) {
    if (!d || d.itemCount === 0)
        return "à préciser";
    if (d.trendDisplay === "not_established")
        return "contradictoire";
    if (d.trendDisplay === "low" || d.trendDisplay === "low_to_confirm") {
        return d.trendDisplay === "low_to_confirm" ? "fragile" : "faible";
    }
    if (d.trendDisplay === "high" || d.trendDisplay === "high_to_confirm") {
        return d.trendDisplay === "high_to_confirm" ? "élevée à confirmer" : "élevée";
    }
    if (d.trendDisplay === "limited_data")
        return "limitée";
    return d.agreement === "mixed" ? "variable" : "modérée";
}
