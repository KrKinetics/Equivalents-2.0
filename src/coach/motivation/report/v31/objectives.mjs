import { OPEN_ANSWER_QUALITY_LABELS } from "./labels.mjs";
const VAGUE = [/^ok$/i, /^oui$/i, /^non$/i, /^idk$/i, /^test$/i, /^bien$/i];
const IMAGE_HEAVY = /arnold|miroir|six pack|abs|steak|protéine|proteine|barbe|croquette|chest/i;
const HEALTH = /santé|sante|médecin|medecin|bilan|maladie|tension|cholestérol|cholesterol/i;
const BLOOD = /sang|prise de sang|analyses?|hémoglobine|hemoglobine|fer\b|blood\s*work|bloodwork|lab\s*work/i;
const VEG = /légume|legume|salade|fibre|végétarien|vegetarien|fruits?/i;
const SHAPE_ENERGY = /forme|énergie|energie|fatigue|vitalité|vitalite|tonus|silhouette|perdre du poids|mincir/i;
const MULTI_GOAL = /\bet\b|,|\/|;|\+|aussi|puis|ensuite/i;
const MEASURABLE = /\d+\s*(kg|%|lbs?|cm|semaines?|mois|jours?|x\s*\/\s*sem)/i;
function canonicalObstacle(value) {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("fr-CA")
        .replace(/\s+/g, " ")
        .trim();
}
/**
 * Normalizes checkbox and free-text obstacle answers into individual labels.
 * A comma-delimited combined answer is never preserved as its own obstacle.
 */
export function normalizeSelectedObstacles(rawAnswer) {
    const seen = new Set();
    const obstacles = [];
    const values = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
    for (const value of values) {
        for (const part of value.split(",")) {
            const obstacle = part.trim();
            const key = canonicalObstacle(obstacle);
            if (!key || seen.has(key))
                continue;
            seen.add(key);
            obstacles.push(obstacle);
        }
    }
    return obstacles;
}
function statusQuestion(code, answer, status) {
    const isNut = code.startsWith("NUT_");
    if (status === "missing") {
        return isNut
            ? "Quel changement alimentaire précis et observable souhaitez-vous remarquer d'ici 8 à 12 semaines?"
            : "Quel changement précis souhaitez-vous observer ou mesurer au cours des 12 prochaines semaines?";
    }
    if (HEALTH.test(answer) || BLOOD.test(answer)) {
        return BLOOD.test(answer)
            ? "Quels marqueurs souhaitez-vous suivre avec le professionnel de la santé responsable de vos analyses?"
            : "Quel changement concret dans votre énergie, vos capacités physiques ou vos habitudes représenterait pour vous une amélioration de votre santé?";
    }
    if (VEG.test(answer)) {
        return "À quelle fréquence ou dans quels repas souhaitez-vous augmenter votre consommation de légumes?";
    }
    if (SHAPE_ENERGY.test(answer)) {
        return "Comment pourrions-nous mesurer séparément l'évolution de votre forme physique et de votre énergie?";
    }
    if (status === "multiple_goals_to_separate") {
        return "Parmi ces objectifs, lequel doit être prioritaire pour les quatre premières semaines?";
    }
    if (status === "measurable_but_underspecified") {
        return "Comment mesurerez-vous ce résultat, et à quelle fréquence le suivrez-vous?";
    }
    if (status === "usable_needs_operationalization") {
        return "Quelle action hebdomadaire concrète transformera cet objectif en habitude observable?";
    }
    if (status === "vague" || status === "needs_clarification" || status === "brief") {
        return isNut
            ? "Quel changement alimentaire précis et observable souhaitez-vous remarquer d'ici 8 à 12 semaines?"
            : "Quel changement précis souhaitez-vous observer ou mesurer au cours des 12 prochaines semaines?";
    }
    return isNut
        ? "Confirmer le critère de succès alimentaire pour les 8 à 12 prochaines semaines."
        : "Confirmer le critère de succès pour les 12 prochaines semaines.";
}
export function assessOpenAnswerText(answer) {
    const text = answer.trim();
    if (!text)
        return "missing";
    if (VAGUE.some((p) => p.test(text)) || IMAGE_HEAVY.test(text) || text.length < 12) {
        return text.length < 8 || VAGUE.some((p) => p.test(text))
            ? "vague"
            : "needs_clarification";
    }
    const goalParts = text.split(MULTI_GOAL).map((s) => s.trim()).filter((s) => s.length > 8);
    if (goalParts.length >= 2 && MULTI_GOAL.test(text)) {
        return "multiple_goals_to_separate";
    }
    if ((MEASURABLE.test(text) || VEG.test(text)) &&
        text.length < 50) {
        return "measurable_but_underspecified";
    }
    if (text.length < 40 || HEALTH.test(text) || SHAPE_ENERGY.test(text)) {
        return "usable_needs_operationalization";
    }
    if (text.length >= 40 && !IMAGE_HEAVY.test(text)) {
        return "usable";
    }
    return "needs_clarification";
}
export function buildOpenAnswerAssessments(questions, answers, overrides = new Map()) {
    const open = questions.filter((q) => q.active &&
        (q.type === "short_text" || q.type === "long_text") &&
        (q.interpretationTags?.includes("goal") ||
            q.interpretationTags?.includes("success") ||
            q.interpretationTags?.includes("nutrition_goal") ||
            q.interpretationTags?.includes("nutrition_success")));
    return open.map((q) => {
        const answer = answers.find((a) => a.questionId === q.id);
        const originalAnswer = answer?.textValue?.trim() ?? "";
        let status = assessOpenAnswerText(originalAnswer);
        const override = overrides.get(q.code);
        if (override)
            status = override;
        return {
            questionCode: q.code,
            originalAnswer: originalAnswer || "Non répondu",
            status,
            statusLabel: OPEN_ANSWER_QUALITY_LABELS[status],
            proposedInterviewQuestion: statusQuestion(q.code, originalAnswer, status),
            operationalGoal: status === "usable" || status === "usable_needs_operationalization"
                ? originalAnswer.slice(0, 160)
                : undefined,
        };
    });
}
export function buildObjectiveClarifications(questions, answers, overrides = new Map()) {
    return buildOpenAnswerAssessments(questions, answers, overrides).map((row) => ({
        questionCode: row.questionCode,
        originalAnswer: row.originalAnswer,
        quality: row.status,
        proposedInterviewQuestion: row.proposedInterviewQuestion,
        operationalGoal: row.operationalGoal,
        confirmedByCoach: overrides.get(row.questionCode) === "usable" ||
            overrides.get(row.questionCode) === "usable_needs_operationalization",
    }));
}
const ALCOHOL = /alcool|bi[eè]re|vin|spiritueux|verre|soûl|souler|binge|alcoolis/i;
const SCHEDULE = /horaire|planif|temps|emploi|travail|famille|garde|shift|quart/i;
const HUNGER = /faim|affam|grignot|envie|fringale/i;
const PORTIONS = /portion|quantit[ée]|trop manger|rassasi/i;
const STRESS = /stress|anxiété|anxiete|pression|burn.?out/i;
const BUDGET = /budget|co[uû]t|cher|argent|financ/i;
const TRAVEL = /voyage|déplacement|deplacement|hôtel|hotel|route/i;
const SOCIAL = /soirée|soiree|restaurant|amis|sorties?/i;
export const OBSTACLE_INTERVIEW_QUESTIONS = {
    alcohol: "Dans quelles situations la consommation d'alcool nuit-elle le plus à votre entraînement, à vos repas, à votre sommeil ou à votre récupération?",
    planning: "Quel moment précis de la semaine pouvez-vous réserver pour planifier vos séances et vos repas, même lorsque l'horaire se resserre?",
    hunger: "À quels moments la faim devient-elle difficile à gérer, et qu'avez-vous mangé ou fait dans les deux heures précédentes?",
    portions: "Dans quels repas les portions dépassent-elles le plus souvent votre faim, et quel repère simple pourrait vous aider à vous arrêter?",
    stress: "Quand le stress augmente, quel changement observez-vous d'abord dans vos repas, votre sommeil ou vos séances?",
    budget: "Quel budget hebdomadaire et quelles options abordables permettraient de garder des repas simples sans improviser?",
};
/**
 * Extract declared obstacles from multi-choice / text answers.
 * Alcohol → plan question + practical action, never medical advice.
 */
export function extractDeclaredObstacles(questions, answers, optionLabels) {
    const obstacles = [];
    const seen = new Set();
    const push = (obstacle) => {
        if (seen.has(obstacle.id))
            return;
        seen.add(obstacle.id);
        obstacles.push(obstacle);
    };
    for (const q of questions) {
        if (!q.active)
            continue;
        const tags = q.interpretationTags ?? [];
        const isObstacleQ = tags.includes("obstacle") ||
            tags.includes("nutrition_obstacle") ||
            /obstacle|frein|difficult/i.test(q.code) ||
            /obstacle|frein|difficult/i.test(q.text);
        if (!isObstacleQ && q.type !== "multiple_choice" && q.type !== "single_choice") {
            continue;
        }
        const answer = answers.find((a) => a.questionId === q.id);
        if (!answer)
            continue;
        const rawLabels = [];
        if (answer.selectedOptionIds?.length) {
            for (const id of answer.selectedOptionIds) {
                rawLabels.push(optionLabels?.get(id) ?? id);
            }
        }
        if (answer.textValue?.trim())
            rawLabels.push(answer.textValue.trim());
        const labels = normalizeSelectedObstacles(rawLabels);
        for (const label of labels) {
            if (ALCOHOL.test(label)) {
                push({
                    id: "obstacle_alcohol",
                    rawLabel: label,
                    category: "alcohol",
                    planQuestion: OBSTACLE_INTERVIEW_QUESTIONS.alcohol,
                    practicalAction: "Prévoir les fins de semaine et les événements sociaux dans la structure plutôt que de les traiter comme des écarts imprévisibles.",
                });
            }
            else if (SCHEDULE.test(label) && !ALCOHOL.test(label)) {
                push({
                    id: `obstacle_schedule_${obstacles.length}`,
                    rawLabel: label,
                    category: "schedule",
                    planQuestion: OBSTACLE_INTERVIEW_QUESTIONS.planning,
                    practicalAction: "Réserver deux créneaux fixes et une version minimale de 20 minutes pour les journées imprévues.",
                });
            }
            else if (HUNGER.test(label)) {
                push({
                    id: `obstacle_hunger_${obstacles.length}`,
                    rawLabel: label,
                    category: "other",
                    planQuestion: OBSTACLE_INTERVIEW_QUESTIONS.hunger,
                    practicalAction: "Prévoir une option rassasiante et facilement accessible avant le moment où la faim devient urgente.",
                });
            }
            else if (PORTIONS.test(label)) {
                push({
                    id: `obstacle_portions_${obstacles.length}`,
                    rawLabel: label,
                    category: "other",
                    planQuestion: OBSTACLE_INTERVIEW_QUESTIONS.portions,
                    practicalAction: "Choisir un seul repère de portion à tester au repas le plus difficile, sans viser la perfection.",
                });
            }
            else if (STRESS.test(label)) {
                push({
                    id: `obstacle_stress_${obstacles.length}`,
                    rawLabel: label,
                    category: "stress",
                    planQuestion: OBSTACLE_INTERVIEW_QUESTIONS.stress,
                    practicalAction: "Définir une procédure de réduction temporaire (volume ou intensité) plutôt qu'un arrêt complet.",
                });
            }
            else if (BUDGET.test(label)) {
                push({
                    id: `obstacle_budget_${obstacles.length}`,
                    rawLabel: label,
                    category: "other",
                    planQuestion: OBSTACLE_INTERVIEW_QUESTIONS.budget,
                    practicalAction: "Identifier quelques aliments de base abordables et une liste courte d'achats réutilisable.",
                });
            }
            else if (TRAVEL.test(label)) {
                push({
                    id: `obstacle_travel_${obstacles.length}`,
                    rawLabel: label,
                    category: "travel",
                    planQuestion: "Combien de jours de déplacement prévoyez-vous sur un mois typique?",
                    practicalAction: "Préparer une séance « voyage » sans équipement et deux options de repas simples hors domicile.",
                });
            }
            else if (SOCIAL.test(label)) {
                push({
                    id: `obstacle_social_${obstacles.length}`,
                    rawLabel: label,
                    category: "social",
                    planQuestion: "Quelles sorties sociales sont non négociables, et lesquelles peuvent être ajustées?",
                    practicalAction: "Choisir à l'avance une stratégie simple (portion, timing, reprise le lendemain) pour les sorties prévues.",
                });
            }
            else if (isObstacleQ && label.length > 2 && !/^non$/i.test(label)) {
                push({
                    id: `obstacle_other_${obstacles.length}`,
                    rawLabel: label,
                    category: "other",
                    planQuestion: `Comment « ${label.slice(0, 60)} » se manifeste-t-il concrètement dans une semaine typique?`,
                    practicalAction: "Identifier une action minimale qui reste faisable même lorsque cet obstacle est présent.",
                });
            }
        }
    }
    return obstacles;
}
