import { DECISION_PREFERENCE_LABELS, PREPARATION_LABELS, } from "./labels.mjs";
function scoreOf(scoring, dimension) {
    return (scoring.dimensions.find((d) => d.dimension === dimension)?.normalizedScore ??
        null);
}
function bandLabel(score, highLabel, midLabel, lowLabel) {
    if (score === null)
        return "À préciser";
    if (score >= 65)
        return highLabel;
    if (score >= 40)
        return midLabel;
    return lowLabel;
}
function levelChangeIntention(score) {
    if (score >= 70)
        return "strong";
    if (score >= 55)
        return "adequate";
    if (score >= 40)
        return "unclear";
    return "limited";
}
function levelConsistency(score) {
    if (score >= 65)
        return "favorable";
    if (score >= 40)
        return "variable";
    return "limited";
}
function levelGoalClarity(openUsableRatio) {
    if (openUsableRatio >= 0.7)
        return "high";
    if (openUsableRatio >= 0.35)
        return "moderate";
    return "low";
}
function levelDifficulty(effort, rigidity) {
    if (effort >= 60 && rigidity <= 55)
        return "favorable";
    if (effort >= 40 || rigidity <= 70)
        return "variable";
    return "fragile";
}
function levelRecovery(consistency, rigidity) {
    if (rigidity >= 70 && consistency < 55)
        return "fragile";
    if (consistency >= 60 && rigidity < 70)
        return "adequate";
    if (consistency >= 65)
        return "adequate";
    return "unconfirmed";
}
/**
 * Derive French "Approche des choix" from choice / explanation / structure —
 * replaces bare "Décision" in summary surfaces.
 */
export function buildChoiceApproachLabel(input) {
    const base = DECISION_PREFERENCE_LABELS[input.decisionPreference];
    if (input.decisionPreference === "guided_choice") {
        return ("Approche des choix : commencer avec deux options encadrées, puis vérifier " +
            "si ce degré de liberté facilite ou ralentit l'action.");
    }
    if (input.decisionPreference === "coach_directed") {
        return `Approche des choix : ${base}${(input.explanationMean ?? 0) >= 55 ? ", avec explications courtes" : ""}`;
    }
    if (input.decisionPreference === "collaborative") {
        return `Approche des choix : ${base} (choix et explications souhaités)`;
    }
    if (input.decisionPreference === "high_autonomy") {
        return `Approche des choix : ${base}${(input.structureMean ?? 0) >= 55 ? ", dans un cadre clair" : ""}`;
    }
    return `Approche des choix : ${base}`;
}
export function computeBehavioralReadiness(input) {
    const consistency = scoreOf(input.scoring, "behavioral_consistency") ?? 50;
    const efficacy = scoreOf(input.scoring, "self_efficacy") ?? 50;
    const rigidity = scoreOf(input.scoring, "rigidity_perfectionism") ?? 50;
    const effort = scoreOf(input.scoring, "effort_tolerance") ?? 50;
    const structure = scoreOf(input.scoring, "structure_need") ?? 50;
    const choice = scoreOf(input.scoring, "choice_need") ?? 50;
    const explanation = scoreOf(input.scoring, "explanation_need") ?? 50;
    const auto = scoreOf(input.scoring, "autonomous_motivation") ?? 50;
    const results = scoreOf(input.scoring, "results_driven_motivation") ?? 50;
    const intentionScore = (auto + results) / 2;
    const consistencyAg = input.agreements.get("behavioral_consistency");
    const consistencyFavorable = consistency >= 65 &&
        consistencyAg?.dominantDirection === "high" &&
        (consistencyAg.classification.startsWith("coherent") ||
            (consistencyAg.classification.startsWith("mixed") &&
                consistencyAg.majorityCount >= 2));
    // Favorable consistency tempers rigidity so a solid history is not erased.
    const rigidityWeight = consistencyFavorable ? 0.12 : 0.25;
    const risk = (100 - consistency) * 0.35 +
        rigidity * rigidityWeight +
        (100 - effort) * 0.2 +
        (100 - efficacy) * 0.2;
    const conditions = [];
    let overall;
    if (risk >= 60) {
        overall = "fragile";
    }
    else if (risk >= 45) {
        overall = "developing";
    }
    else if (risk >= 30) {
        overall = "adequate";
    }
    else {
        overall = "strong";
    }
    if (consistencyFavorable && (overall === "fragile" || overall === "developing")) {
        overall = "adequate_with_conditions";
        conditions.push("S'appuyer sur l'historique de constance, tout en précisant les conditions qui le favorisent.");
    }
    if (overall === "adequate" ||
        overall === "adequate_with_conditions" ||
        overall === "strong") {
        if (rigidity >= 60) {
            overall = "adequate_with_conditions";
            conditions.push("Prévoir une procédure claire après un écart.");
        }
        if (consistencyAg?.classification.startsWith("mixed") ||
            consistencyAg?.classification === "strongly_divergent") {
            overall = "adequate_with_conditions";
            conditions.push("Valider la constance réelle sur les deux premières semaines.");
        }
        if (input.decisionPreference === "uncertain") {
            overall = "adequate_with_conditions";
            conditions.push("Clarifier l'approche des choix dès la première entrevue.");
        }
    }
    const openRatio = input.openGoalUsabilityRatio ?? 0.4;
    const changeIntention = levelChangeIntention(intentionScore);
    const consistencyCapacity = levelConsistency(consistency);
    const goalClarity = levelGoalClarity(openRatio);
    const difficultyTolerance = levelDifficulty(effort, rigidity);
    const recoveryCapacity = levelRecovery(consistency, rigidity);
    const explanationText = overall === "adequate_with_conditions"
        ? "Le client présente des indices favorables de constance, mais ses objectifs, sa réaction aux interruptions et certaines réponses divergentes doivent être précisés avant d'augmenter fortement les exigences."
        : overall === "fragile"
            ? "La préparation paraît fragile : prioriser une routine minimale et clarifier les freins avant d'augmenter la charge."
            : overall === "developing"
                ? "La préparation est en développement : consolider quelques actions répétables avant d'ajouter de la complexité."
                : overall === "strong"
                    ? "La préparation paraît solide; maintenir un cadre clair et des indicateurs observables."
                    : "La préparation paraît adéquate pour démarrer, sous réserve des confirmations d'entrevue.";
    return {
        overall,
        overallLabel: PREPARATION_LABELS[overall],
        explanation: explanationText,
        changeIntention,
        consistencyCapacity,
        goalClarity,
        difficultyTolerance,
        recoveryCapacity,
        consistencyLabel: bandLabel(consistency, "Constance favorable", "Constance à consolider", "Constance fragile"),
        selfEfficacyLabel: bandLabel(efficacy, "Sentiment d'efficacité solide", "Sentiment d'efficacité modéré", "Sentiment d'efficacité à renforcer"),
        structureFitLabel: bandLabel(structure, "Cadre précis recommandé", "Cadre modéré recommandé", "Cadre souple recommandé"),
        choiceApproachLabel: buildChoiceApproachLabel({
            decisionPreference: input.decisionPreference,
            choiceMean: choice,
            explanationMean: explanation,
            structureMean: structure,
        }),
        conditions: [...new Set(conditions)],
    };
}
