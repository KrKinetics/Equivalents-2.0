import { NO_PROBABLE_STRENGTH_MESSAGE, NO_STRENGTH_MESSAGE, } from "./assets.mjs";
function domain(domains, id) {
    return domains.find((d) => d.domainId === id);
}
function isHighStrengthCandidate(d) {
    if (d.evidenceStrength === "contradictory")
        return false;
    if (d.level !== "high")
        return false;
    if (d.itemCount === 1)
        return false;
    if (d.agreement === "consistent" && d.evidenceStrength !== "limited") {
        return true;
    }
    const singleCoreOk = new Set([
        "explanation_need",
        "coach_receptivity",
        "food_flexibility",
    ]);
    return (singleCoreOk.has(d.domainId) &&
        d.coreItemCount >= 2 &&
        d.agreement !== "strongly_divergent" &&
        (d.technicalScore ?? 0) >= 75);
}
function isSingleItemHighLever(d) {
    return (d.itemCount === 1 &&
        d.level === "high" &&
        d.evidenceStrength !== "contradictory");
}
const PROBABLE_STRENGTH_DOMAINS = new Set([
    "explanation_need",
    "coach_receptivity",
    "structure_need",
    "hunger_signals",
    "food_flexibility",
    "adherence_recovery",
]);
function strengthTitle(d) {
    // Never "fortement appuyée" from questionnaire alone — reserve "Force confirmée" for coach validation.
    return `Force probable appuyée — ${d.label}`;
}
/** Probable strengths — never "Force confirmée" before coach validation. */
export function buildProbableStrengths(domains) {
    return domains
        .filter((d) => PROBABLE_STRENGTH_DOMAINS.has(d.domainId) && isHighStrengthCandidate(d))
        .map((d) => ({
        type: "probable_strength",
        title: strengthTitle(d),
        detail: d.classificationLabel,
        source: d.domainId,
    }));
}
/** Confirmed strengths only when coach explicitly validated the domain. */
export function buildConfirmedStrengths(domains, coachValidations = []) {
    const validatedIds = new Set(coachValidations
        .filter((v) => v.status === "confirmed" || v.status === "partially_confirmed")
        .map((v) => v.insightId));
    if (validatedIds.size === 0)
        return [];
    return domains
        .filter((d) => PROBABLE_STRENGTH_DOMAINS.has(d.domainId) &&
        isHighStrengthCandidate(d) &&
        validatedIds.has(d.domainId))
        .map((d) => ({
        type: "confirmed_strength",
        title: `Force confirmée — ${d.label}`,
        detail: d.classificationLabel,
        source: d.domainId,
    }));
}
export function buildProbableLevers(domains) {
    const levers = [];
    const results = domain(domains, "results_orientation");
    if (results &&
        results.level === "high" &&
        (results.agreement === "consistent" || results.agreement === "mixed")) {
        levers.push({
            type: "probable_lever",
            title: "Levier probable — résultats visibles",
            detail: "Les résultats visibles peuvent soutenir l'engagement initial.",
            source: "results_orientation",
        });
    }
    for (const d of domains) {
        if (!PROBABLE_STRENGTH_DOMAINS.has(d.domainId))
            continue;
        if (!isSingleItemHighLever(d))
            continue;
        levers.push({
            type: "probable_lever",
            title: `Levier probable — ${d.label}`,
            detail: `Appui limité — ${d.classificationLabel}`,
            source: d.domainId,
        });
    }
    return levers;
}
export function buildDeclaredLevers(openAnswers) {
    const levers = [];
    for (const row of openAnswers) {
        if (row.status === "experience_goal") {
            levers.push({
                type: "declared_lever",
                title: "Levier déclaré — expérience / plaisir",
                detail: row.originalAnswer,
                source: row.questionCode,
            });
        }
        if (row.status === "body_composition_goal_needs_definition" ||
            row.status === "general_health_goal_needs_operationalization" ||
            row.status === "general_fitness_goal_needs_operationalization" ||
            row.status === "strength_performance_goal_needs_targets" ||
            row.status === "load_progression_indicator_needs_structure" ||
            /forme|[eé]nergie/i.test(row.originalAnswer)) {
            if (!levers.some((l) => l.source === row.questionCode)) {
                levers.push({
                    type: "declared_lever",
                    title: "Levier déclaré — objectif exprimé",
                    detail: row.originalAnswer,
                    source: row.questionCode,
                });
            }
        }
    }
    return levers.slice(0, 3);
}
export function strengthLabelsOrNone(strengths, useProbable = true) {
    if (strengths.length)
        return strengths.map((s) => s.title);
    return [useProbable ? NO_PROBABLE_STRENGTH_MESSAGE : NO_STRENGTH_MESSAGE];
}
export function buildActionableFindingsV42(input) {
    const findings = [];
    const adherence = domain(input.domains, "adherence_recovery");
    const results = domain(input.domains, "results_orientation");
    const longTerm = domain(input.domains, "long_term_projection");
    const flex = domain(input.domains, "food_flexibility");
    const comp = domain(input.domains, "compensatory_food");
    const rigidity = domain(input.domains, "all_or_nothing");
    if (adherence &&
        (adherence.level === "low" ||
            adherence.level === "uncertain" ||
            adherence.agreement === "mixed" ||
            adherence.trendDisplay === "low_to_confirm")) {
        findings.push({
            id: "f_adherence",
            title: "Adhésion et capacité de reprise à tester",
            observation: adherence.interpretation,
            interpretation: "La capacité de reprise ne doit pas être présumée; une procédure minimale doit être testée.",
            possibleConsequence: "Sans filet de reprise, un écart peut devenir une interruption prolongée.",
            recommendedAction: "Définir une version minimale de séance et une procédure de reprise après interruption.",
            validationQuestion: "Quelle version minimale seriez-vous prêt à faire après une semaine difficile?",
            importance: "high",
        });
    }
    if (results && results.level === "high") {
        const mirrorBased = Boolean(input.hasMirrorGoal);
        findings.push({
            id: "f_results",
            title: input.hasStrengthGoal
                ? "Engagement soutenu par des progrès de performance"
                : "Engagement influencé par les résultats visibles",
            observation: results.interpretation,
            interpretation: input.hasStrengthGoal
                ? "L'engagement peut être soutenu par des progrès concrets de force et de technique."
                : "L'engagement semble fortement influencé par les résultats visibles, tandis que les raisons plus personnelles de poursuivre peuvent demeurer à clarifier.",
            possibleConsequence: "Un manque de progrès visibles pourrait fragiliser l'engagement si d'autres indicateurs ne sont pas installés.",
            recommendedAction: mirrorBased
                ? "Rendre les progrès concrets sans laisser le miroir ou la balance devenir les seuls critères."
                : input.hasStrengthGoal
                    ? "Suivre la qualité technique et la régularité en plus des charges et répétitions."
                    : "Rendre les progrès concrets via des indicateurs observables définis avec le client.",
            validationQuestion: mirrorBased
                ? "Quels indicateurs autres que le miroir accepterez-vous d'utiliser?"
                : input.hasStrengthGoal
                    ? "Sur quels exercices souhaitez-vous suivre vos charges, et quelle progression représenterait une réussite?"
                    : "Quels indicateurs concrets accepterez-vous d'utiliser pour juger les progrès?",
            importance: "high",
        });
    }
    if (longTerm &&
        (longTerm.agreement === "strongly_divergent" ||
            longTerm.agreement === "mixed" ||
            (longTerm.adaptiveItemCount > 0 && longTerm.agreement !== "consistent"))) {
        findings.push({
            id: "f_long_term",
            title: "Projection à long terme contradictoire",
            observation: longTerm.interpretation,
            interpretation: "La projection à long terme est contradictoire. Le délai réel avant de juger l'efficacité de la démarche doit être confirmé.",
            possibleConsequence: "Risque de jugement prématuré si l'orientation vers les résultats et l'impatience restent élevées.",
            recommendedAction: "Confirmer le délai réaliste avant d'évaluer l'efficacité du programme.",
            validationQuestion: "Après combien de semaines ou de mois jugerez-vous que la démarche fonctionne?",
            importance: "moderate",
        });
    }
    if (rigidity &&
        (rigidity.trendDisplay === "high_to_confirm" ||
            rigidity.agreement === "mixed" ||
            rigidity.level === "high")) {
        findings.push({
            id: "f_all_or_nothing",
            title: "Fonctionnement tout-ou-rien à confirmer",
            observation: rigidity.interpretation,
            interpretation: "Un fonctionnement tout-ou-rien pourrait amplifier la réaction après un écart.",
            possibleConsequence: "Un écart isolé pourrait entraîner l'abandon complet du plan.",
            recommendedAction: "Tester une procédure de reprise minimale après un écart sans compensation punitive.",
            validationQuestion: "Que faites-vous habituellement après avoir manqué une séance ou un repas prévu?",
            importance: "moderate",
        });
    }
    if (flex &&
        comp &&
        (flex.level === "high" || flex.level === "moderate") &&
        (comp.level === "high" || comp.level === "moderate")) {
        findings.push({
            id: "f_flex_comp",
            title: "Flexibilité et compensation à clarifier",
            observation: `${flex.interpretation} ${comp.interpretation}`,
            interpretation: "Le client semble capable de flexibilité dans certaines situations, mais rapporte également une tendance à compenser ou à ressentir une perte de contrôle après certains écarts.",
            possibleConsequence: "Certaines situations peuvent déclencher une réaction punitive plutôt qu'une reprise normale.",
            recommendedAction: "Reprendre normalement au repas suivant, sans restriction punitive ni entraînement compensatoire.",
            validationQuestion: "Dans quelles situations reprenez-vous normalement après un écart?",
            importance: "moderate",
        });
    }
    if (input.choiceApproach.preference === "collaborative_guided" ||
        input.choiceApproach.preference === "structured_autonomy" ||
        input.choiceApproach.preference === "high_autonomy") {
        findings.push({
            id: "f_choice",
            title: input.choiceApproach.preference === "collaborative_guided"
                ? "Collaboration guidée pour les choix"
                : "Autonomie encadrée pour les choix",
            observation: input.choiceApproach.summary,
            interpretation: input.choiceApproach.summary,
            possibleConsequence: input.choiceApproach.preference === "collaborative_guided"
                ? "Trop d'options pourrait ralentir l'action."
                : "Une progression floue pourrait diluer les gains malgré l'autonomie.",
            recommendedAction: input.choiceApproach.preference === "collaborative_guided"
                ? "Présenter une recommandation principale avec au maximum une alternative."
                : "Proposer des choix équivalents dans les éléments secondaires tout en conservant une progression claire.",
            validationQuestion: input.choiceApproach.validationQuestion,
            importance: "moderate",
        });
    }
    if (input.foodObstacle) {
        findings.push({
            id: "f_food",
            title: "Obstacle alimentaire à préciser",
            observation: `Obstacle déclaré : ${input.foodObstacle}.`,
            interpretation: "Formulation générale à clarifier avant de structurer l'accompagnement.",
            possibleConsequence: "Interventions trop génériques sans précision.",
            recommendedAction: "Clarifier ce que le client entend par cet obstacle alimentaire.",
            validationQuestion: "Lorsque vous dites que l'alimentation est un obstacle, à quoi pensez-vous surtout?",
            importance: "moderate",
        });
    }
    return findings
        .sort((a, b) => {
        const r = (x) => x.importance === "high" ? 0 : x.importance === "moderate" ? 1 : 2;
        return r(a) - r(b);
    })
        .slice(0, 5);
}
