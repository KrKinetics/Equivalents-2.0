import { REPORT_USABILITY_LABELS } from "./labels.mjs";
const CANONICAL_ACTION_KEYS = [
    [/version minimale|séance.{0,20}minimale/i, "minimal_session"],
    [/indicateur.{0,30}(progression|choisi|noté)|hors miroir|sans balance/i, "progress_indicators"],
    [/objectif.{0,30}(observable|mesurable|reformul)/i, "operational_objectives"],
    [/obstacle.{0,30}(horaire|rencontr)|semaine chargée/i, "schedule_obstacles"],
    [/alcool|événement.{0,20}social/i, "alcohol_plan"],
    [/ajuster.{0,30}(charge|attente)|réduction temporaire/i, "adaptive_adjustment"],
    [/choix encadrés|niveau d'explication/i, "guided_choices"],
    [/hypothèse.{0,30}(confirm|infirm)|comportement observé/i, "validate_hypotheses"],
];
function canonicalActionKey(action) {
    const known = CANONICAL_ACTION_KEYS.find(([pattern]) => pattern.test(action));
    if (known)
        return known[1];
    return action
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("fr-CA")
        .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
        .trim();
}
function dedupePlanActions(plan) {
    const seen = new Set();
    for (const week of plan.weeks) {
        week.coachActions = week.coachActions.filter((action) => {
            const key = canonicalActionKey(action);
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        week.actions = week.coachActions;
    }
    return plan;
}
export function buildFourWeekCoachingPlan(input) {
    const topActions = input.priorities.slice(0, 3);
    const riskActions = input.findings
        .filter((f) => f.type === "risk")
        .slice(0, 2)
        .map((f) => f.recommendedAction);
    const obstacleAction = input.obstacles[0]?.practicalAction;
    const alcoholObstacle = input.obstacles.find((o) => o.category === "alcohol");
    const weeks = [
        {
            week: 1,
            title: "Semaine 1 — Clarifier et simplifier",
            objective: "Clarifier et simplifier",
            focus: "Transformer les objectifs et fixer une version minimale du plan.",
            coachActions: [
                topActions[0] ??
                    "Transformer les objectifs en indicateurs observables.",
                "Définir une version minimale de chaque séance.",
                "Sélectionner trois indicateurs de progression hors miroir et balance.",
                input.nutritionApproach
                    ? "Choisir quelques repères alimentaires simples."
                    : "Clarifier les priorités alimentaires initiales si pertinentes.",
            ].slice(0, 4),
            clientIndicators: [
                "Séances minimales réalisées",
                "Indicateurs choisis et notés",
                "Objectifs reformulés en observables",
            ],
            validationPoints: [
                "Les indicateurs sont-ils mesurables sans balance ni miroir?",
                "La version minimale est-elle réaliste en semaine chargée?",
            ],
            actions: [],
        },
        {
            week: 2,
            title: "Semaine 2 — Tester la réalité du plan",
            objective: "Tester la réalité du plan",
            focus: "Vérifier l'exécution réelle et les obstacles d'horaire.",
            coachActions: [
                "Vérifier les séances réellement réalisées.",
                "Identifier les obstacles d'horaire.",
                alcoholObstacle?.practicalAction ??
                    obstacleAction ??
                    "Observer les situations alimentaires difficiles.",
                riskActions[0] ??
                    "Ajuster la charge ou les attentes sans changer complètement de méthode.",
            ].slice(0, 4),
            clientIndicators: [
                "Taux de séances complétées",
                "Obstacles rencontrés",
                "Écarts alimentaires notés sans jugement",
            ],
            validationPoints: [
                "Quels créneaux tiennent réellement?",
                alcoholObstacle
                    ? alcoholObstacle.planQuestion
                    : "Quelles situations ont le plus freiné le plan?",
            ],
            actions: [],
        },
        {
            week: 3,
            title: "Semaine 3 — Ajuster l'autonomie",
            objective: "Ajuster l'autonomie",
            focus: "Tester deux choix encadrés et le niveau d'explication utile.",
            coachActions: [
                "Tester deux choix encadrés.",
                "Observer si les choix facilitent ou ralentissent l'action.",
                "Ajuster le niveau d'explication.",
                "Tester la réaction aux corrections prioritaires.",
            ],
            clientIndicators: [
                "Temps de décision face aux options",
                "Adhésion après correction",
                "Besoin d'explication exprimé",
            ],
            validationPoints: [
                "Deux options aident-elles plus qu'une seule directive?",
                "Le feedback court est-il suffisant?",
            ],
            actions: [],
        },
        {
            week: 4,
            title: "Semaine 4 — Valider le portrait",
            objective: "Valider le portrait",
            focus: "Comparer hypothèses initiales et comportements observés.",
            coachActions: [
                "Comparer les hypothèses initiales aux comportements observés.",
                "Confirmer ou invalider les conclusions.",
                "Ajuster la fréquence des suivis.",
                "Choisir les priorités du bloc suivant.",
            ],
            clientIndicators: [
                "Hypothèses confirmées / infirmées",
                "Fréquence de suivi perçue comme utile",
                "Priorités du prochain bloc",
            ],
            validationPoints: [
                "Quelles conclusions restent des hypothèses?",
                "Quelle fréquence de suivi conserver?",
            ],
            actions: [],
        },
    ];
    return dedupePlanActions({ weeks });
}
export function buildInitialApproachWarnings(input) {
    const warnings = [];
    const defaults = [
        {
            id: "warn_multi_priorities",
            severity: "high",
            message: "Ne pas multiplier les priorités simultanées.",
            reason: "Un trop grand nombre de cibles dilue l'exécution des deux premières semaines.",
        },
        {
            id: "warn_weight_mirror",
            severity: "high",
            message: "Ne pas utiliser uniquement le poids ou le miroir comme indicateurs.",
            reason: "Ces signaux sont trop lents ou trop émotionnels pour guider le démarrage.",
        },
        {
            id: "warn_too_many_choices",
            severity: "moderate",
            message: "Ne pas offrir trop de choix en même temps.",
            reason: "Le profil suggère qu'un excès d'options peut freiner la décision.",
        },
        {
            id: "warn_rigid_food",
            severity: "moderate",
            message: "Ne pas imposer une structure alimentaire rigide avant de comprendre le quotidien.",
            reason: "Les contraintes réelles (horaire, alcool, contexte) doivent d'abord être cartographiées.",
        },
        {
            id: "warn_punitive",
            severity: "high",
            message: "Ne pas utiliser de rattrapage punitif après une séance ou un repas manqué.",
            reason: "Le perfectionnisme déclaré rend le rattrapage contre-productif.",
        },
        {
            id: "warn_blood_work",
            severity: "moderate",
            message: "Ne pas interpréter soi-même les résultats sanguins.",
            reason: "Tout suivi de bilans doit rester sous responsabilité d'un professionnel de la santé.",
        },
    ];
    for (const finding of input.findings.filter((f) => f.type === "risk").slice(0, 2)) {
        warnings.push({
            id: `warn_${finding.id}`,
            severity: finding.importance === "high" ? "high" : "moderate",
            message: finding.title,
            reason: finding.possibleConsequence,
        });
    }
    for (const d of defaults) {
        if (warnings.length >= 5)
            break;
        if (!warnings.some((w) => w.id === d.id || w.message === d.message)) {
            warnings.push(d);
        }
    }
    return warnings.slice(0, 5);
}
export function buildReportUsability(input) {
    const limitingFactors = [];
    if (input.responseCompletenessPercent < 90) {
        limitingFactors.push("Complétude des réponses inférieure à 90 %.");
    }
    if (input.divergentDimensionCount >= 2) {
        limitingFactors.push("Plusieurs dimensions présentent des réponses fortement divergentes.");
    }
    if (input.openAnswersNeedingClarification >= 2) {
        limitingFactors.push("Objectifs ouverts à clarifier avant de figer le plan.");
    }
    if (input.highRiskFindingCount >= 2) {
        limitingFactors.push("Plusieurs risques élevés nécessitent une confirmation en entrevue.");
    }
    const openUsability = Math.max(0, 100 - input.openAnswersNeedingClarification * 25);
    const answerConsistency = Math.max(0, 100 - input.divergentDimensionCount * 20);
    const limitedEvidence = input.highImportanceLimitedEvidenceCount ?? 0;
    let overall = "strong";
    if (limitingFactors.length >= 3 ||
        input.responseCompletenessPercent < 70) {
        overall = "limited";
    }
    else if (limitingFactors.length >= 1 ||
        input.divergentDimensionCount >= 1 ||
        limitedEvidence >= 1) {
        overall = "usable_with_validation";
    }
    const level = overall === "strong"
        ? "high"
        : overall === "usable_with_validation"
            ? "moderate"
            : "limited";
    const message = overall === "strong"
        ? "Le questionnaire est complet et les tendances principales sont suffisamment cohérentes pour guider l'approche initiale."
        : overall === "usable_with_validation"
            ? "Le questionnaire est complet et certaines tendances sont cohérentes, notamment l'historique de constance. Plusieurs dimensions demeurent toutefois mixtes ou fortement divergentes, et les objectifs déclarés doivent être rendus plus précis."
            : "Le rapport reste utile comme hypothèse de travail, mais plusieurs éléments limitent la fiabilité de l'approche initiale.";
    const summary = overall === "strong"
        ? "Le rapport est suffisamment solide pour guider l'approche initiale, sous réserve des confirmations habituelles en entrevue."
        : overall === "usable_with_validation"
            ? "Exploitabilité actuelle : utilisable avec validation."
            : "Exploitabilité actuelle : limitée — plusieurs éléments doivent être clarifiés avant d'augmenter la charge.";
    return {
        overall,
        level,
        levelLabel: overall === "strong"
            ? REPORT_USABILITY_LABELS.strong
            : overall === "usable_with_validation"
                ? REPORT_USABILITY_LABELS.usable_with_validation
                : REPORT_USABILITY_LABELS.limited,
        summary,
        message,
        responseCompleteness: input.responseCompletenessPercent,
        answerConsistency,
        openAnswerUsability: openUsability,
        unresolvedDivergenceCount: input.divergentDimensionCount,
        highImportanceLimitedEvidenceCount: limitedEvidence,
        limitingFactors,
    };
}
export function buildInterviewChecklist(input) {
    const seed = [
        {
            id: "check_objectives_observable",
            label: "Transformer les objectifs en indicateurs observables",
            category: "objective",
            checked: false,
        },
        {
            id: "check_blood_work",
            label: "Clarifier les résultats sanguins visés et leur suivi professionnel",
            category: "clarification",
            checked: false,
        },
        {
            id: "check_alcohol_impact",
            label: "Déterminer l'impact réel de l'alcool",
            category: "obstacle",
            checked: false,
        },
        {
            id: "check_follow_up_freq",
            label: "Valider la fréquence de suivi",
            category: "follow_up",
            checked: false,
        },
        {
            id: "check_choice_count",
            label: "Tester le nombre de choix utiles",
            category: "clarification",
            checked: false,
        },
        {
            id: "check_min_session",
            label: "Définir la version minimale des séances",
            category: "priority",
            checked: false,
        },
        {
            id: "check_food_models",
            label: "Choisir les modèles alimentaires initiaux",
            category: "objective",
            checked: false,
        },
        {
            id: "check_missed_protocol",
            label: "Définir la procédure après un écart",
            category: "priority",
            checked: false,
        },
    ];
    const items = seed.map((item, index) => ({
        ...item,
        sortOrder: index,
    }));
    // Keep alcohol item only when declared; otherwise replace with first obstacle question.
    const hasAlcohol = input.obstacles.some((o) => o.category === "alcohol");
    if (!hasAlcohol) {
        const idx = items.findIndex((i) => i.id === "check_alcohol_impact");
        if (idx >= 0) {
            const obstacle = input.obstacles[0];
            if (obstacle) {
                items[idx] = {
                    ...items[idx],
                    id: `check_${obstacle.id}`,
                    label: obstacle.planQuestion,
                    category: "obstacle",
                };
            }
            else {
                items.splice(idx, 1);
            }
        }
    }
    const hasBlood = input.objectiveClarifications.some((o) => /sang|blood|analyse/i.test(o.originalAnswer));
    if (!hasBlood) {
        const idx = items.findIndex((i) => i.id === "check_blood_work");
        if (idx >= 0)
            items.splice(idx, 1);
    }
    return items.map((item, index) => ({ ...item, sortOrder: index }));
}
