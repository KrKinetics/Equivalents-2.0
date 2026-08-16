import { FOLLOW_UP_LABELS, PREPARATION_LABELS, STRUCTURE_LABELS, } from "./labels.mjs";
import { buildChoiceApproachLabel, computeBehavioralReadiness } from "./behavioral-readiness.mjs";
import { guidedChoiceCopy } from "./findings.mjs";
function scoreOf(scoring, dimension) {
    return (scoring.dimensions.find((d) => d.dimension === dimension)?.normalizedScore ??
        null);
}
export function buildInitialPlanV31(input) {
    const readiness = computeBehavioralReadiness({
        scoring: input.scoring,
        agreements: input.agreements,
        decisionPreference: input.decisionPreference,
        openGoalUsabilityRatio: input.openGoalUsabilityRatio,
    });
    const prep = readiness.overall;
    const structureNeed = scoreOf(input.scoring, "structure_need") ?? 50;
    const structure = structureNeed >= 65 ? "high" : structureNeed >= 40 ? "moderate" : "low";
    const rigidity = scoreOf(input.scoring, "rigidity_perfectionism");
    const checkIn = prep === "fragile" || (rigidity ?? 0) >= 70
        ? "twice_weekly"
        : prep === "strong"
            ? "biweekly"
            : "weekly";
    const risks = input.findings
        .filter((f) => f.type === "risk")
        .slice(0, 3)
        .map((f) => f.title);
    const clarifications = input.findings
        .filter((f) => f.type === "clarification")
        .slice(0, 3)
        .map((f) => f.title);
    const strengths = input.findings
        .filter((f) => f.type === "strength")
        .slice(0, 3)
        .map((f) => f.title);
    // Never invent receptivity-as-strength when unclear.
    if (strengths.length === 0) {
        strengths.push("Cadre à bâtir à partir des priorités confirmées en entrevue");
    }
    const priorities = input.findings
        .filter((f) => f.importance === "high" || f.type === "priority")
        .slice(0, 3)
        .map((f) => f.recommendedAction);
    while (priorities.length < 3) {
        const extras = [
            "Créer une version minimale de chaque séance.",
            "Définir trois indicateurs de progression hors poids et miroir.",
            "Établir la procédure après une séance manquée dès la première rencontre.",
        ];
        for (const e of extras) {
            if (priorities.length >= 3)
                break;
            if (!priorities.includes(e))
                priorities.push(e);
        }
        break;
    }
    let communicationStyle = "Communiquer de façon concrète, une à deux priorités à la fois.";
    if (input.decisionPreference === "guided_choice") {
        communicationStyle = guidedChoiceCopy().action;
    }
    else if ((scoreOf(input.scoring, "explanation_need") ?? 0) >= 65) {
        communicationStyle =
            "Expliquer le pourquoi, conserver un cadre clair et limiter les options.";
    }
    const mixed = input.findings.find((f) => f.id === "finding_motivation_mixed");
    const profileSummary = mixed?.observation ??
        "Portrait motivationnel à confirmer en entrevue; traiter chaque conclusion comme une hypothèse de travail.";
    const nutritionApproach = input.nutritionApproach ??
        "Commencer par une structure flexible composée de quelques repas répétables, de solutions pour les journées chargées et d'une procédure claire après un écart. Observer l'influence du stress et aider le client à distinguer progressivement la faim physique des envies liées au contexte.";
    const choiceApproachLabel = buildChoiceApproachLabel({
        decisionPreference: input.decisionPreference,
        choiceMean: scoreOf(input.scoring, "choice_need"),
        explanationMean: scoreOf(input.scoring, "explanation_need"),
        structureMean: scoreOf(input.scoring, "structure_need"),
    });
    return {
        profileSummary,
        preparationLevel: prep,
        preparationLabel: PREPARATION_LABELS[prep],
        recommendedStructure: structure,
        structureLabel: STRUCTURE_LABELS[structure],
        recommendedCheckInFrequency: checkIn,
        followUpLabel: FOLLOW_UP_LABELS[checkIn],
        communicationStyle,
        decisionPreference: input.decisionPreference,
        choiceApproachLabel,
        initialPriorities: priorities.slice(0, 3),
        mainStrengths: strengths.slice(0, 3),
        mainRisks: risks.slice(0, 3),
        clarifications: clarifications.slice(0, 3),
        missedSessionProtocol: "Si une séance est manquée : réaliser la version minimale dans les 48 h, sans rattrapage punitif, puis reprendre le plan prévu.",
        progressIndicators: [
            "Séances complétées ou versions minimales réalisées",
            "Énergie perçue et qualité de récupération",
            "Progression technique ou de charge sur un ou deux mouvements clés",
        ],
        nutritionApproach,
        firstFourWeeksActions: priorities.slice(0, 3),
        priorityInterviewQuestions: [
            "Qu'est-ce qui indiquerait que les quatre premières semaines fonctionnent, hors miroir et balance?",
            "Comment réagissez-vous habituellement après une séance manquée?",
            ...(input.decisionPreference === "guided_choice"
                ? [
                    "Combien d'options équivalentes êtes-vous à l'aise de comparer avant de choisir?",
                ]
                : [
                    "Préférez-vous surtout comprendre les décisions, ou aussi choisir parmi des options?",
                ]),
        ].slice(0, 3),
    };
}
