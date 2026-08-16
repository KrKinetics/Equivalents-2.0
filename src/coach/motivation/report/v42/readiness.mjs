import { componentLabelFromDomain, levelLabelFr, trendLabelFr, } from "../../scoring/domain-interpretation-v41.mjs";
function d(domains, id) {
    return domains.find((x) => x.domainId === id);
}
function overallValue(overall) {
    switch (overall) {
        case "fragile":
            return "fragile";
        case "developing":
            return "en développement";
        case "strong":
            return "solide";
        default:
            return "adéquate avec conditions";
    }
}
function softExplanationNeed(expl) {
    if (!expl || expl.itemCount === 0)
        return "à préciser";
    if (expl.itemCount === 1) {
        return `${componentLabelFromDomain(expl)} (appui limité)`;
    }
    return componentLabelFromDomain(expl);
}
export function buildBehavioralReadinessV42(input) {
    const results = d(input.domains, "results_orientation");
    const delay = d(input.domains, "delay_tolerance");
    const longTerm = d(input.domains, "long_term_projection");
    const expl = d(input.domains, "explanation_need");
    const coach = d(input.domains, "coach_receptivity");
    const rigidity = d(input.domains, "all_or_nothing");
    const usableGoals = input.openAnswers.filter((a) => a.status === "usable" ||
        a.status === "experience_goal" ||
        a.status === "body_composition_goal_needs_definition" ||
        a.status === "behavior_goal_needs_frequency" ||
        a.status === "general_health_goal_needs_operationalization" ||
        a.status === "general_fitness_goal_needs_operationalization" ||
        a.status === "food_quality_concept_needs_definition");
    const goalClarity = usableGoals.length === 0
        ? "faible"
        : usableGoals.some((a) => a.status === "body_composition_goal_needs_definition" ||
            a.status === "needs_clarification" ||
            a.status === "general_health_goal_needs_operationalization" ||
            a.status === "general_fitness_goal_needs_operationalization")
            ? "partielle"
            : "adéquate";
    const initialMotivation = results?.level === "high"
        ? "fortement orientée vers les résultats"
        : results
            ? `orientée ${levelLabelFr(results.level)}`
            : "à confirmer";
    const maintenanceDomain = d(input.domains, "adherence_maintenance");
    const recoveryDomain = d(input.domains, "adherence_recovery_signal");
    const historyDomain = d(input.domains, "adherence_history");
    const maintenanceCapacity = componentLabelFromDomain(maintenanceDomain);
    const recoveryCapacity = componentLabelFromDomain(recoveryDomain);
    const delayTolerance = longTermComponentLabel(delay);
    const longTermProjection = longTermComponentLabel(longTerm);
    const explanationNeed = softExplanationNeed(expl);
    const coachingReceptivity = componentLabelFromDomain(coach);
    const fragileSignals = [
        maintenanceCapacity.includes("faible") || maintenanceCapacity.includes("variable"),
        recoveryCapacity.includes("fragile") || recoveryCapacity.includes("faible"),
        delayTolerance.includes("faible"),
        longTerm?.level === "low",
        rigidity?.level === "high",
    ].filter(Boolean).length;
    const overall = fragileSignals >= 2
        ? "fragile"
        : fragileSignals === 1
            ? "developing"
            : "adequate_with_conditions";
    const preparationLabeled = {
        label: "Préparation comportementale",
        value: overallValue(overall),
    };
    const structureLabeled = {
        label: "Structure recommandée",
        value: "modérée",
    };
    const choiceApproachLabeled = {
        label: "Approche des choix",
        value: input.choiceApproach.label,
    };
    const overallLabel = `${preparationLabeled.label} : ${preparationLabeled.value}`;
    const explanation = "Commencer avec un cadre simple, expliqué et facilement récupérable après un écart.";
    const followUpFrequency = overall === "fragile" || recoveryCapacity.includes("fragile")
        ? "twice_weekly"
        : "weekly";
    const followUpLabel = followUpFrequency === "twice_weekly"
        ? "deux fois par semaine"
        : "hebdomadaire";
    const followUpRationale = followUpFrequency === "twice_weekly"
        ? "Deux contacts courts par semaine pendant les quatre premières semaines afin de soutenir la reprise, vérifier les actions réalisées et éviter qu'un écart devienne une interruption prolongée."
        : "Un contact hebdomadaire pour vérifier l'exécution et ajuster sans surcharger le suivi.";
    const overallAdherence = d(input.domains, "adherence_recovery");
    const adherenceSummary = [
        `Adhésion globale : ${overallAdherence ? trendLabelFr(overallAdherence.trendDisplay).toLowerCase() : "à confirmer"}`,
        `Maintien pendant les semaines chargées : ${maintenanceCapacity}`,
        `Reprise après interruption : ${recoveryCapacity}`,
        `Préparation comportementale antérieure : ${componentLabelFromDomain(historyDomain)}`,
    ];
    const summaryLines = [
        overallLabel,
        `Clarté des objectifs : ${goalClarity}`,
        `Motivation initiale : ${initialMotivation}`,
        `Capacité de maintien : ${maintenanceCapacity}`,
        `Capacité de reprise : ${recoveryCapacity}`,
        `Tolérance aux délais : ${delayTolerance}`,
        `Projection à long terme : ${longTermProjection}`,
        `Besoin d'explications : ${explanationNeed}`,
        `Réceptivité au coaching : ${coachingReceptivity}`,
        ...adherenceSummary,
        explanation,
    ];
    return {
        overall,
        overallLabel,
        preparationLabeled,
        structureLabeled,
        choiceApproachLabeled,
        explanation,
        goalClarity,
        initialMotivation,
        maintenanceCapacity,
        recoveryCapacity,
        delayTolerance,
        longTermProjection,
        explanationNeed,
        coachingReceptivity,
        followUpFrequency,
        followUpLabel,
        followUpRationale,
        structureLabel: `${structureLabeled.label} : ${structureLabeled.value}`,
        choiceApproachLabel: `${choiceApproachLabeled.label} : ${choiceApproachLabeled.value}`,
        summaryLines,
        adherenceSummary,
    };
}
function longTermComponentLabel(domain) {
    if (!domain || domain.itemCount === 0)
        return "à confirmer";
    if (domain.itemCount === 1) {
        return `tendance ${trendLabelFr(domain.trendDisplay).toLowerCase()} — appui limité`;
    }
    if (domain.agreement === "strongly_divergent")
        return "contradictoire";
    if (domain.agreement === "consistent" && domain.level === "low") {
        return "faible et cohérente";
    }
    if (domain.agreement === "mixed") {
        return domain.level === "high"
            ? "variable — tendance élevée"
            : domain.level === "low"
                ? "variable — tendance faible"
                : "variable";
    }
    return componentLabelFromDomain(domain);
}
export function longTermNarrative(longTerm) {
    if (!longTerm ||
        longTerm.agreement === "strongly_divergent" ||
        (longTerm.agreement === "mixed" && longTerm.level === "uncertain")) {
        return ("La projection à long terme est contradictoire. Le client ne décrit pas spontanément l'entraînement comme un projet de plusieurs années, " +
            "mais se dit prêt à investir plusieurs mois. Son délai réel avant de juger l'efficacité de la démarche doit être confirmé.");
    }
    if (longTerm.itemCount === 1) {
        return (`La projection à long terme présente une tendance ${trendLabelFr(longTerm.trendDisplay).toLowerCase()}, ` +
            "mais repose actuellement sur une seule réponse.");
    }
    if (longTerm.agreement === "consistent" && longTerm.level === "low") {
        return ("La projection à long terme apparaît faible et cohérente. Le client pourrait juger rapidement l'efficacité de la démarche; " +
            "son délai réel avant de remettre le plan en question doit être précisé.");
    }
    if (longTerm.level === "high" && longTerm.agreement === "consistent") {
        return "La projection à long terme paraît favorable; conserver des jalons intermédiaires pour soutenir l'engagement.";
    }
    if (longTerm.agreement === "mixed") {
        return (`La projection à long terme paraît ${trendLabelFr(longTerm.trendDisplay).toLowerCase()}. ` +
            "Le délai réel avant de juger l'efficacité de la démarche doit être confirmé.");
    }
    return "La projection à long terme reste à confirmer en entrevue.";
}
