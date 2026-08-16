import { DIMENSION_LABELS_FR, NUTRITION_DIMENSION_LABELS_FR, } from "../../domain/dimensions.mjs";
export function formatPdfDate(value) {
    if (!value)
        return "Non disponible";
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime()))
        return "Non disponible";
    return d.toLocaleDateString("fr-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}
/**
 * Footer / meta datetime without seconds.
 * Example: "24 juillet 2026 à 12 h 44"
 */
export function formatPdfDateTime(value) {
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime()))
        return "Non disponible";
    const datePart = d.toLocaleDateString("fr-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${datePart} à ${hours} h ${minutes}`;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item ?? "")).filter((item) => item.trim().length > 0);
}
function inferAnswerKind(displayValue) {
    const v = displayValue.trim();
    if (/^\d+\s*\/\s*\d+$/.test(v) || /^\d+\s+sur\s+\d+$/i.test(v))
        return "likert";
    if (v.length > 40 || /\s/.test(v))
        return "open";
    if (/^\d+$/.test(v))
        return "likert";
    return "other";
}
/**
 * Builds the ordered textual content of the coach PDF.
 * Pure and stable for identical inputs (including fixed generatedAt).
 * Presentation layer may regroup sections visually but must keep this text.
 */
export function buildCoachReportPdfSections(input) {
    const report = input.report ?? {};
    const notesWithText = (input.notes ?? []).filter((n) => n.body?.trim().length > 0);
    const scores = Array.isArray(report.calculatedScores) ? report.calculatedScores : [];
    const interpretations = Array.isArray(report.interpretations) ? report.interpretations : [];
    const directAnswers = Array.isArray(report.directClientAnswers)
        ? report.directClientAnswers
        : [];
    const narrativeParagraphs = Array.isArray(report.narrative?.paragraphs)
        ? report.narrative.paragraphs
        : [];
    const sections = [
        { type: "heading", text: "KR Kinetics" },
        { type: "heading", text: "Rapport coach" },
        {
            type: "meta",
            lines: [
                `Client: ${input.clientName}`,
                `Date de complétion: ${formatPdfDate(input.completedAt)}`,
                `Version du questionnaire: ${input.questionnaireVersion}`,
                `Version du moteur de règles: ${input.rulesetVersion}`,
                `Date de génération: ${formatPdfDateTime(input.generatedAt)}`,
            ],
        },
        { type: "heading", text: "Synthèse générale" },
        { type: "paragraph", text: report.generalSummary || "Non disponible" },
        { type: "heading", text: "Objectifs prioritaires" },
        { type: "bullets", items: asStringArray(report.priorityGoals) },
        { type: "heading", text: "Principaux moteurs de motivation" },
        { type: "bullets", items: asStringArray(report.motivationDrivers) },
        { type: "heading", text: "Forces favorisant l'adhésion" },
        { type: "bullets", items: asStringArray(report.adherenceStrengths) },
        { type: "heading", text: "Obstacles potentiels" },
        { type: "bullets", items: asStringArray(report.potentialObstacles) },
        { type: "heading", text: "Réaction probable aux écarts" },
        {
            type: "paragraph",
            text: report.likelyReactionToSetbacks || "Non disponible",
        },
        { type: "heading", text: "Perception personnelle du succès" },
        {
            type: "paragraph",
            text: report.personalSuccessPerception || "Non disponible",
        },
        { type: "heading", text: "Style de communication recommandé" },
        {
            type: "paragraph",
            text: report.recommendedCommunicationStyle || "Non disponible",
        },
        { type: "heading", text: "Niveau de structure recommandé" },
        {
            type: "paragraph",
            text: report.recommendedStructureLevel || "Non disponible",
        },
        { type: "heading", text: "Stratégies d'accompagnement suggérées" },
        { type: "bullets", items: asStringArray(report.suggestedSupportStrategies) },
        { type: "heading", text: "Scores calculés" },
        {
            type: "table",
            headers: ["Dimension", "Score / 100", "Items", "Couverture"],
            rows: scores.map((s) => [
                DIMENSION_LABELS_FR[s.dimension] ?? String(s.dimension),
                s.normalizedScore === null || s.normalizedScore === undefined
                    ? "-"
                    : String(s.normalizedScore),
                String(s.contributingQuestionCount ?? 0),
                String(s.confidence ?? 0),
            ]),
        },
        { type: "heading", text: "Interprétations du moteur de règles" },
    ];
    if (interpretations.length === 0) {
        sections.push({ type: "paragraph", text: "Aucune règle déclenchée." });
    }
    else {
        for (const insight of interpretations) {
            sections.push({
                type: "paragraph",
                text: `${insight.title ?? ""} - ${insight.message ?? ""} Recommandation: ${insight.coachingRecommendation ?? ""}`,
            });
        }
    }
    const contradictions = asStringArray(report.contradictionsOrUncertainties);
    sections.push({ type: "heading", text: "Contradictions ou incertitudes" });
    if (contradictions.length === 0) {
        sections.push({ type: "paragraph", text: "Aucune contradiction détectée." });
    }
    else {
        sections.push({ type: "bullets", items: contradictions });
    }
    sections.push({ type: "heading", text: "Questions à approfondir en rendez-vous" });
    sections.push({
        type: "bullets",
        items: asStringArray(report.interviewFollowUpQuestions),
    });
    sections.push({ type: "heading", text: "Éléments sportifs à confirmer en entrevue" });
    sections.push({
        type: "bullets",
        items: asStringArray(report.itemsToConfirmInInterview).filter((item) => !/aliment|nutrition|repas|menu|épicerie|faim|satiété|alimentaire/i.test(item)),
    });
    if (report.narrative || narrativeParagraphs.length > 0) {
        sections.push({
            type: "heading",
            text: report.narrative?.title ||
                "Portrait narratif du client et approche recommandée",
        });
        for (const paragraph of narrativeParagraphs) {
            sections.push({ type: "paragraph", text: String(paragraph ?? "") });
        }
    }
    if (report.nutrition) {
        sections.push({
            type: "heading",
            text: report.nutrition.narrative.title || "Profil alimentaire et approche recommandée",
        });
        sections.push({ type: "paragraph", text: report.nutrition.summary });
        sections.push({
            type: "table",
            headers: ["Dimension", "Score / 100", "Items", "Couverture"],
            rows: (report.nutrition.scores ?? []).map((s) => [
                NUTRITION_DIMENSION_LABELS_FR[s.dimension] ??
                    String(s.dimension),
                s.normalizedScore === null || s.normalizedScore === undefined
                    ? "-"
                    : String(s.normalizedScore),
                String(s.contributingQuestionCount ?? 0),
                String(s.confidence ?? 0),
            ]),
        });
        for (const paragraph of report.nutrition.narrative.paragraphs) {
            sections.push({ type: "paragraph", text: paragraph });
        }
        sections.push({
            type: "heading",
            text: "Repères d'accompagnement alimentaire",
        });
        sections.push({ type: "bullets", items: asStringArray(report.nutrition.coachingTips) });
        sections.push({
            type: "heading",
            text: "Éléments alimentaires à confirmer en entrevue",
        });
        sections.push({
            type: "bullets",
            items: asStringArray(report.nutrition.interviewPoints),
        });
        const goals = asStringArray(report.nutrition.goals);
        if (goals.length > 0) {
            sections.push({ type: "heading", text: "Objectif alimentaire déclaré" });
            sections.push({ type: "bullets", items: goals });
        }
        if (report.nutrition.successDefinition?.trim()) {
            sections.push({ type: "heading", text: "Définition alimentaire du succès" });
            sections.push({ type: "paragraph", text: report.nutrition.successDefinition });
        }
        const obstacles = asStringArray(report.nutrition.obstacles);
        if (obstacles.length > 0) {
            sections.push({ type: "heading", text: "Obstacles alimentaires sélectionnés" });
            sections.push({ type: "bullets", items: obstacles });
        }
        if (report.nutrition.preferredStructure?.trim()) {
            sections.push({ type: "heading", text: "Type d'encadrement préféré" });
            sections.push({ type: "paragraph", text: report.nutrition.preferredStructure });
        }
        if (report.nutrition.contextualConstraints?.trim()) {
            sections.push({
                type: "heading",
                text: "Contraintes ou préférences déclarées",
            });
            sections.push({
                type: "paragraph",
                text: report.nutrition.contextualConstraints,
            });
        }
    }
    const trainingAnswers = directAnswers.filter((a) => a.domain !== "nutrition" && !String(a.questionCode ?? "").startsWith("NUT_"));
    const nutritionAnswers = directAnswers.filter((a) => a.domain === "nutrition" || String(a.questionCode ?? "").startsWith("NUT_"));
    sections.push({ type: "heading", text: "Réponses directes du client" });
    if (trainingAnswers.length > 0) {
        sections.push({ type: "heading", text: "Réponses sur l'entraînement" });
        for (const answer of trainingAnswers) {
            sections.push({
                type: "paragraph",
                text: `[${answer.questionCode ?? ""}] ${answer.questionText ?? ""} -> ${answer.displayValue ?? ""}`,
            });
        }
    }
    if (nutritionAnswers.length > 0) {
        sections.push({ type: "heading", text: "Réponses sur l'alimentation" });
        for (const answer of nutritionAnswers) {
            sections.push({
                type: "paragraph",
                text: `[${answer.questionCode ?? ""}] ${answer.questionText ?? ""} -> ${answer.displayValue ?? ""}`,
            });
        }
    }
    if (notesWithText.length > 0) {
        sections.push({ type: "heading", text: "Notes privées du coach" });
        for (const note of notesWithText) {
            sections.push({
                type: "paragraph",
                text: `${formatPdfDateTime(note.createdAt)} - ${note.body.trim()}`,
            });
        }
    }
    return sections;
}
/** Stable fingerprint of PDF logical content (ignores binary PDF ids). */
export function fingerprintPdfSections(sections) {
    return JSON.stringify(sections);
}
export function getNonEmptyNotes(notes) {
    return (notes ?? []).filter((n) => n.body?.trim().length > 0);
}
export function buildScoreRows(report) {
    const scores = Array.isArray(report.calculatedScores) ? report.calculatedScores : [];
    return scores.map((s) => {
        const value = s.normalizedScore === null || s.normalizedScore === undefined
            ? null
            : Number(s.normalizedScore);
        return {
            dimension: DIMENSION_LABELS_FR[s.dimension] ?? String(s.dimension),
            score: value === null || Number.isNaN(value) ? "—" : String(value),
            items: String(s.contributingQuestionCount ?? 0),
            confidence: String(s.confidence ?? 0),
            scoreValue: value !== null && !Number.isNaN(value) ? value : null,
        };
    });
}
export function buildDirectAnswersForPdf(report) {
    const answers = Array.isArray(report.directClientAnswers) ? report.directClientAnswers : [];
    return answers.map((answer) => {
        const displayValue = String(answer.displayValue ?? "");
        return {
            code: String(answer.questionCode ?? ""),
            question: String(answer.questionText ?? ""),
            displayValue,
            kind: inferAnswerKind(displayValue),
            domain: answer.domain ??
                (String(answer.questionCode ?? "").startsWith("NUT_")
                    ? "nutrition"
                    : "training"),
        };
    });
}
export function buildNutritionScoreRows(report) {
    const scores = report.nutrition?.scores ?? [];
    return scores.map((s) => {
        const value = s.normalizedScore === null || s.normalizedScore === undefined
            ? null
            : Number(s.normalizedScore);
        return {
            dimension: NUTRITION_DIMENSION_LABELS_FR[s.dimension] ??
                String(s.dimension),
            score: value === null || Number.isNaN(value) ? "—" : String(value),
            items: String(s.contributingQuestionCount ?? 0),
            confidence: String(s.confidence ?? 0),
            scoreValue: value !== null && !Number.isNaN(value) ? value : null,
        };
    });
}
export { asStringArray };
