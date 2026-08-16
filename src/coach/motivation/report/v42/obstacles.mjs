import { normalizeOpenAnswerText, obstaclePracticalAction, obstacleValidationQuestion, } from "./open-answers.mjs";
const ACTION_VERBS = /^(Clarifier|Définir|Valider|Tester|Identifier|Choisir|Confirmer|Construire|Préciser|Repérer|Observer|Vérifier|Comparer|Ajuster|Créer|Réserver)\b/i;
const STRESS_LABELS = /\b(stress|[eé]motion|anxi[eé]t)\b/i;
function ensureAction(text) {
    if (ACTION_VERBS.test(text))
        return text;
    return `Clarifier ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
function canonicalIdFor(normalized, raw) {
    const lower = raw.toLowerCase().trim();
    if (lower === "manque de planification" || normalized.semanticCategory === "planning")
        return "food_planning";
    if (lower === "horaire de travail variable" || normalized.semanticCategory === "schedule")
        return "food_schedule";
    if (normalized.semanticCategory === "meal_plan")
        return "meal_plan";
    if (normalized.semanticCategory === "stress_emotions" || STRESS_LABELS.test(lower)) {
        return "stress_emotions";
    }
    if (normalized.semanticCategory === "food_general")
        return "food_general";
    if (normalized.semanticCategory === "substances")
        return "substances";
    if (normalized.semanticCategory === "budget")
        return "budget";
    if (normalized.semanticCategory === "portions")
        return "portions";
    if (normalized.semanticCategory === "social_meals")
        return "social_meals";
    if (normalized.semanticCategory === "cravings")
        return "cravings";
    if (normalized.semanticCategory === "food_knowledge")
        return "food_knowledge";
    if (normalized.semanticCategory === "hunger")
        return "hunger";
    if (normalized.semanticCategory === "consistency")
        return "consistency";
    return `other_${normalized.semanticCategory}`;
}
function mergedLabel(canonicalId, normalized) {
    if (canonicalId === "food_planning")
        return "Manque de planification";
    if (canonicalId === "food_schedule")
        return "Horaire de travail variable";
    if (canonicalId === "stress_emotions")
        return "Stress ou émotions";
    return normalized.normalizedLabel;
}
function categoryFor(canonicalId) {
    if (canonicalId === "food_schedule")
        return "schedule";
    if (canonicalId === "social_meals")
        return "social";
    return "other";
}
function syntheticNormalized(canonicalId) {
    if (canonicalId === "food_planning") {
        return {
            originalText: "Manque de planification",
            normalizedLabel: "Manque de planification",
            semanticCategory: "planning",
            clarificationNeeded: true,
        };
    }
    if (canonicalId === "food_schedule") {
        return { originalText: "Horaire de travail variable", normalizedLabel: "Horaire de travail variable", semanticCategory: "schedule", clarificationNeeded: true };
    }
    if (canonicalId === "stress_emotions") {
        return {
            originalText: "Stress ou émotions",
            normalizedLabel: "Stress ou émotions",
            semanticCategory: "stress_emotions",
            clarificationNeeded: true,
        };
    }
    if (canonicalId === "food_general") {
        return {
            originalText: "Alimentation — obstacle général",
            normalizedLabel: "Alimentation — obstacle général à préciser",
            semanticCategory: "food_general",
            clarificationNeeded: true,
        };
    }
    return {
        originalText: canonicalId,
        normalizedLabel: canonicalId,
        semanticCategory: "other",
        clarificationNeeded: true,
    };
}
export function mergeNormalizedObstacles(rawEntries) {
    const byCanonical = new Map();
    for (const { raw, normalized } of rawEntries) {
        const canonicalId = canonicalIdFor(normalized, raw);
        const existing = byCanonical.get(canonicalId);
        const label = mergedLabel(canonicalId, normalized);
        if (existing) {
            if (!existing.originalTexts.includes(raw)) {
                existing.originalTexts.push(raw);
            }
            continue;
        }
        const synthetic = syntheticNormalized(canonicalId);
        const forQ = canonicalId === "food_planning" || canonicalId === "food_schedule" || canonicalId === "stress_emotions"
            ? synthetic
            : canonicalId === canonicalIdFor(normalized, raw)
                ? normalized
                : synthetic;
        byCanonical.set(canonicalId, {
            canonicalId,
            rawLabel: raw,
            normalizedLabel: label,
            originalTexts: [raw],
            category: categoryFor(canonicalId),
            planQuestion: obstacleValidationQuestion(forQ),
            practicalAction: ensureAction(obstaclePracticalAction(forQ)),
        });
    }
    return [...byCanonical.values()];
}
export function extractDeclaredObstaclesV42(questions, answers, optionLabels) {
    return mergeNormalizedObstacles(collectObstacleRawEntries(questions, answers, optionLabels)).map((o, index) => ({
        id: `obstacle_v42_${index}`,
        rawLabel: o.normalizedLabel,
        category: o.category,
        planQuestion: o.planQuestion,
        practicalAction: o.practicalAction,
    }));
}
export function extractNormalizedObstaclesV42(questions, answers, optionLabels) {
    return mergeNormalizedObstacles(collectObstacleRawEntries(questions, answers, optionLabels));
}
function collectObstacleRawEntries(questions, answers, optionLabels) {
    const entries = [];
    const seen = new Set();
    for (const q of questions) {
        if (!q.active)
            continue;
        const tags = q.interpretationTags ?? [];
        const isObstacle = tags.includes("obstacle") ||
            tags.includes("nutrition_obstacle") ||
            /^OBS_/i.test(q.code) ||
            /^NUT_OBS_/i.test(q.code);
        // Never scrape preferences / single_choice / unrelated multiple_choice.
        if (!isObstacle)
            continue;
        const answer = answers.find((a) => a.questionId === q.id);
        if (!answer)
            continue;
        const raws = [];
        if (answer.selectedOptionIds?.length) {
            for (const id of answer.selectedOptionIds) {
                raws.push(optionLabels?.get(id) ?? id);
            }
        }
        if (answer.textValue?.trim())
            raws.push(answer.textValue.trim());
        for (const raw of raws) {
            for (const part of raw.split(",")) {
                const label = part.trim();
                if (!label || label.length < 2 || /^non$/i.test(label))
                    continue;
                const key = label.toLowerCase();
                if (seen.has(key))
                    continue;
                seen.add(key);
                entries.push({ raw: label, normalized: normalizeOpenAnswerText(label) });
            }
        }
    }
    return entries;
}
export function collectNormalizedOpenAnswersV42(questions, answers, optionLabels) {
    const out = [];
    const seen = new Set();
    for (const q of questions) {
        if (!q.active)
            continue;
        const tags = q.interpretationTags ?? [];
        if (!tags.includes("obstacle") &&
            !tags.includes("nutrition_obstacle") &&
            !/^OBS_/i.test(q.code) &&
            !/^NUT_OBS_/i.test(q.code)) {
            continue;
        }
        const answer = answers.find((a) => a.questionId === q.id);
        if (!answer)
            continue;
        const texts = [];
        if (answer.textValue?.trim())
            texts.push(answer.textValue.trim());
        for (const id of answer.selectedOptionIds ?? []) {
            texts.push(optionLabels?.get(id) ?? id);
        }
        for (const text of texts) {
            for (const part of text.split(",")) {
                const trimmed = part.trim();
                if (!trimmed || seen.has(trimmed.toLowerCase()))
                    continue;
                seen.add(trimmed.toLowerCase());
                out.push(normalizeOpenAnswerText(trimmed));
            }
        }
    }
    return out;
}
