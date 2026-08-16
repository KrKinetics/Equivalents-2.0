import { DIMENSION_LABELS_FR, NUTRITION_DIMENSION_LABELS_FR, NUTRITION_DIMENSIONS, PROFILE_DIMENSIONS, isNutritionDimension, } from "../../domain/dimensions.mjs";
import { agreementLabelFr, calculateDimensionAgreementV31, } from "../../scoring/dimension-agreement-v31.mjs";
import { calculateNutritionScores, hasNutritionData, } from "../../scoring/nutrition.mjs";
import { invertNormalizedScore, normalizeLikertMean, } from "../../scoring/normalize.mjs";
import { computeBehavioralReadiness } from "./behavioral-readiness.mjs";
import { buildFourWeekCoachingPlan, buildInitialApproachWarnings, buildInterviewChecklist, buildReportUsability, } from "./coaching-extras.mjs";
import { buildOperationalFindings, detectDecisionPreference, sortFindings, } from "./findings.mjs";
import { buildInitialPlanV31 } from "./initial-plan.mjs";
import { generateNutritionNarrativeV31, generateSportNarrativeV31, } from "./narrative.mjs";
import { buildObjectiveClarifications, buildOpenAnswerAssessments, extractDeclaredObstacles, } from "./objectives.mjs";
import { groupNutritionUncertainties, groupSportUncertainties, } from "./uncertainties.mjs";
function displayAnswer(question, answer, optionLabels) {
    if (!answer)
        return "Non répondu";
    if (typeof answer.numericValue === "number") {
        if (question.type === "likert") {
            return `${answer.numericValue} / ${question.likertMax ?? 5}`;
        }
        return String(answer.numericValue);
    }
    if (answer.selectedOptionIds?.length) {
        return answer.selectedOptionIds
            .map((id) => optionLabels?.get(id) ?? id)
            .join(", ");
    }
    return answer.textValue?.trim() || "Non répondu";
}
function domainOf(question) {
    if (question.code.startsWith("NUT_") ||
        question.interpretationTags?.includes("nutrition") ||
        (question.primaryDimension && isNutritionDimension(question.primaryDimension))) {
        return "nutrition";
    }
    return "training";
}
function itemNormalized(question, answers, opts = {}) {
    const invertNegative = opts.invertNegative !== false;
    const answer = answers.find((a) => a.questionId === question.id);
    if (!answer || typeof answer.numericValue !== "number")
        return null;
    let n = normalizeLikertMean(answer.numericValue, question.likertMin ?? 1, question.likertMax ?? 5);
    if (invertNegative && question.scoringDirection === "negative") {
        n = invertNormalizedScore(n);
    }
    return n;
}
function buildRows(dimensions, labels, scoreLookup, agreements) {
    return dimensions
        .map((dimension) => {
        const ag = agreements.get(dimension);
        const lookup = scoreLookup.get(dimension);
        if (!ag || !lookup || lookup.items === 0)
            return null;
        return {
            dimension,
            label: labels[dimension] ?? dimension,
            score: lookup.score,
            itemCount: lookup.items,
            agreement: ag,
            agreementLabel: agreementLabelFr(ag.classification),
            trendMode: ag.classification === "strongly_divergent"
                ? "uncertain"
                : "normal",
        };
    })
        .filter((r) => Boolean(r));
}
export function assembleCoachReportSnapshotV31(input) {
    const { questions, answers, scoring, optionLabels } = input;
    const agreements = new Map();
    for (const dimension of PROFILE_DIMENSIONS) {
        const ag = calculateDimensionAgreementV31(dimension, questions, answers);
        if (ag.itemCount > 0)
            agreements.set(dimension, ag);
    }
    const nutritionRaw = calculateNutritionScores(questions, answers);
    const nutritionScoring = hasNutritionData(nutritionRaw) ? nutritionRaw : null;
    if (nutritionScoring) {
        for (const dimension of NUTRITION_DIMENSIONS) {
            const ag = calculateDimensionAgreementV31(dimension, questions, answers);
            if (ag.itemCount > 0)
                agreements.set(dimension, ag);
        }
    }
    const choiceQs = questions.filter((q) => q.primaryDimension === "choice_need");
    const choice01 = itemNormalized(choiceQs.find((q) => q.code === "CHOICE_01") ?? choiceQs[0], answers);
    const choice02 = itemNormalized(choiceQs.find((q) => q.code === "CHOICE_02") ?? choiceQs[1], answers);
    const choice03 = itemNormalized(choiceQs.find((q) => q.code === "CHOICE_03") ?? choiceQs[2], answers, { invertNegative: false });
    const choiceMean = scoring.dimensions.find((d) => d.dimension === "choice_need")?.normalizedScore ??
        null;
    const explanationMean = scoring.dimensions.find((d) => d.dimension === "explanation_need")
        ?.normalizedScore ?? null;
    const decisionPreference = detectDecisionPreference({
        choice01,
        choice02Inverted: choice02,
        choice03Agreement: choice03,
        choiceMean,
        explanationMean,
    });
    const prefLabel = answers
        .map((a) => {
        const q = questions.find((qq) => qq.id === a.questionId);
        if (!q?.interpretationTags?.includes("nutrition_preference"))
            return null;
        if (a.selectedOptionIds?.length) {
            return a.selectedOptionIds
                .map((id) => optionLabels?.get(id) ?? id)
                .join(", ");
        }
        return a.textValue?.trim() ?? null;
    })
        .find(Boolean) ?? "";
    const preferredFlexible = /flexible|liberté/i.test(prefLabel);
    const nutMap = new Map((nutritionScoring?.dimensions ?? []).map((d) => [
        d.dimension,
        d.normalizedScore,
    ]));
    let findings = buildOperationalFindings({
        scoring,
        agreements,
        decisionPreference,
        nutrition: nutritionScoring
            ? {
                flexibility: nutMap.get("food_flexibility") ?? null,
                compensation: nutMap.get("compensatory_food_response") ?? null,
                structureNeed: nutMap.get("nutrition_structure_need") ?? null,
                preferredFlexible,
            }
            : undefined,
    });
    findings = sortFindings(findings);
    const nutritionApproach = preferredFlexible
        ? "Commencer par une structure flexible composée de quelques repas répétables, de solutions pour les journées chargées et d'une procédure claire après un écart. Observer l'influence du stress et aider le client à distinguer progressivement la faim physique des envies liées au contexte."
        : undefined;
    const openAnswerAssessmentsEarly = buildOpenAnswerAssessments(questions, answers, input.openAnswerOverrides);
    const openGoalUsabilityRatio = openAnswerAssessmentsEarly.length === 0
        ? 0.5
        : openAnswerAssessmentsEarly.filter((o) => o.status === "usable" ||
            o.status === "usable_needs_operationalization" ||
            o.status === "measurable_but_underspecified").length / openAnswerAssessmentsEarly.length;
    const initialPlan = buildInitialPlanV31({
        scoring,
        findings,
        decisionPreference,
        agreements,
        nutritionApproach,
        openGoalUsabilityRatio,
    });
    const behavioralReadiness = computeBehavioralReadiness({
        scoring,
        agreements,
        decisionPreference,
        openGoalUsabilityRatio,
    });
    // Keep plan label aligned with readiness decomposition.
    initialPlan.preparationLevel = behavioralReadiness.overall;
    initialPlan.preparationLabel = behavioralReadiness.overallLabel;
    initialPlan.choiceApproachLabel = behavioralReadiness.choiceApproachLabel;
    const sportLookup = new Map(scoring.dimensions.map((d) => [
        d.dimension,
        { score: d.normalizedScore, items: d.contributingQuestionCount },
    ]));
    const sportScores = buildRows(PROFILE_DIMENSIONS, DIMENSION_LABELS_FR, sportLookup, agreements);
    const sportNarrative = generateSportNarrativeV31({
        scoring,
        agreements,
        findings,
        decisionPreference,
    });
    let nutritionSection;
    if (nutritionScoring) {
        const nutLookup = new Map(nutritionScoring.dimensions.map((d) => [
            d.dimension,
            { score: d.normalizedScore, items: d.contributingQuestionCount },
        ]));
        const nutScores = buildRows(NUTRITION_DIMENSIONS, NUTRITION_DIMENSION_LABELS_FR, nutLookup, agreements);
        const nutNarrative = generateNutritionNarrativeV31({
            scores: Object.fromEntries(nutMap),
            agreements,
            preferredFlexible,
            findings,
        });
        nutritionSection = {
            scores: nutScores,
            groupedUncertainties: groupNutritionUncertainties(agreements, NUTRITION_DIMENSION_LABELS_FR),
            narrativeSections: nutNarrative.sections,
            wordCount: nutNarrative.wordCount,
        };
    }
    const answeredRequired = questions.filter((q) => q.required && q.active).length;
    const missing = scoring.missingRequiredQuestionIds.length;
    const completeness = answeredRequired === 0
        ? 100
        : Math.round(((answeredRequired - missing) / answeredRequired) * 100);
    const directAnswers = questions
        .filter((q) => q.active)
        .sort((a, b) => a.order - b.order)
        .map((q) => {
        const answer = answers.find((a) => a.questionId === q.id);
        const isOpen = q.type === "short_text" || q.type === "long_text";
        return {
            questionCode: q.code,
            questionText: q.text,
            displayValue: displayAnswer(q, answer, optionLabels),
            section: q.section,
            domain: domainOf(q),
            isOpenAnswer: isOpen,
            isShortLikert: q.type === "likert",
        };
    });
    const objectiveClarifications = buildObjectiveClarifications(questions, answers, input.openAnswerOverrides);
    const openAnswerAssessments = openAnswerAssessmentsEarly;
    const declaredObstacles = extractDeclaredObstacles(questions, answers, optionLabels);
    const divergentDimensionCount = [...agreements.values()].filter((ag) => ag.classification === "strongly_divergent").length;
    const openAnswersNeedingClarification = openAnswerAssessments.filter((o) => o.status !== "usable" &&
        o.status !== "usable_needs_operationalization").length;
    const highRiskFindingCount = findings.filter((f) => f.type === "risk" && f.importance === "high").length;
    const reportUsability = buildReportUsability({
        responseCompletenessPercent: completeness,
        divergentDimensionCount,
        openAnswersNeedingClarification,
        highRiskFindingCount,
        highImportanceLimitedEvidenceCount: findings.filter((f) => f.importance === "high" && f.evidenceStrength === "limited").length,
        reinforcedConsistentCount: findings.filter((f) => f.type === "strength" && f.evidenceStrength === "reinforced").length,
    });
    const fourWeekPlan = buildFourWeekCoachingPlan({
        findings,
        priorities: initialPlan.initialPriorities,
        missedSessionProtocol: initialPlan.missedSessionProtocol,
        nutritionApproach: initialPlan.nutritionApproach,
        obstacles: declaredObstacles,
    });
    const initialApproachWarnings = buildInitialApproachWarnings({
        findings,
        obstacles: declaredObstacles,
        usabilityLimitingFactors: reportUsability.limitingFactors,
    });
    const interviewChecklist = buildInterviewChecklist({
        findings,
        objectiveClarifications,
        obstacles: declaredObstacles,
        priorityQuestions: initialPlan.priorityInterviewQuestions,
    });
    return {
        schemaVersion: "report-model-v3.1",
        metadata: {
            assessmentId: input.assessmentId,
            clientId: input.clientId,
            clientName: input.clientName,
            clientCoachId: input.clientCoachId,
            status: input.status,
            completedAt: input.completedAt,
            questionnaireVersion: input.questionnaireVersion,
            rulesetVersion: input.rulesetVersion,
            reportModelVersion: "v3.1",
            responseCompletenessPercent: completeness,
            generatedAt: new Date().toISOString(),
        },
        initialPlan,
        behavioralReadiness,
        fourWeekPlan,
        initialApproachWarnings,
        reportUsability,
        interviewChecklist,
        openAnswerAssessments,
        declaredObstacles,
        sport: {
            scores: sportScores,
            groupedUncertainties: groupSportUncertainties(agreements, DIMENSION_LABELS_FR),
            narrativeSections: sportNarrative.sections,
            wordCount: sportNarrative.wordCount,
        },
        nutrition: nutritionSection,
        findings,
        objectiveClarifications,
        directAnswers,
    };
}
export function isCoachReportSnapshotV31(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.schemaVersion === "report-model-v3.1");
}
/** Soft-normalize older v3.1 snapshots missing newer fields. */
export function normalizeSnapshotV31(snapshot) {
    return {
        ...snapshot,
        behavioralReadiness: {
            overall: snapshot.behavioralReadiness?.overall ?? snapshot.initialPlan.preparationLevel,
            overallLabel: snapshot.behavioralReadiness?.overallLabel ??
                snapshot.initialPlan.preparationLabel,
            explanation: snapshot.behavioralReadiness?.explanation ??
                "Préparation à confirmer après régénération du rapport.",
            changeIntention: snapshot.behavioralReadiness?.changeIntention ?? "unclear",
            consistencyCapacity: snapshot.behavioralReadiness?.consistencyCapacity ?? "variable",
            goalClarity: snapshot.behavioralReadiness?.goalClarity ?? "moderate",
            difficultyTolerance: snapshot.behavioralReadiness?.difficultyTolerance ?? "variable",
            recoveryCapacity: snapshot.behavioralReadiness?.recoveryCapacity ?? "unconfirmed",
            consistencyLabel: snapshot.behavioralReadiness?.consistencyLabel ?? "—",
            selfEfficacyLabel: snapshot.behavioralReadiness?.selfEfficacyLabel ?? "—",
            structureFitLabel: snapshot.behavioralReadiness?.structureFitLabel ??
                snapshot.initialPlan.structureLabel,
            choiceApproachLabel: snapshot.behavioralReadiness?.choiceApproachLabel ??
                snapshot.initialPlan.choiceApproachLabel ??
                `Approche des choix : à préciser`,
            conditions: snapshot.behavioralReadiness?.conditions ?? [],
        },
        fourWeekPlan: snapshot.fourWeekPlan ?? {
            weeks: [1, 2, 3, 4].map((week) => ({
                week: week,
                title: `Semaine ${week}`,
                objective: `Semaine ${week}`,
                focus: snapshot.initialPlan.profileSummary.slice(0, 120),
                coachActions: snapshot.initialPlan.firstFourWeeksActions.slice(0, 3),
                clientIndicators: [],
                validationPoints: [],
                actions: snapshot.initialPlan.firstFourWeeksActions.slice(0, 3),
            })),
        },
        initialApproachWarnings: snapshot.initialApproachWarnings ?? [],
        reportUsability: {
            overall: snapshot.reportUsability?.overall ?? "usable_with_validation",
            level: snapshot.reportUsability?.level ?? "moderate",
            levelLabel: snapshot.reportUsability?.levelLabel ?? "Utilisable avec validation",
            summary: snapshot.reportUsability?.summary ??
                "Utilisabilité à confirmer après régénération du rapport.",
            message: snapshot.reportUsability?.message ??
                snapshot.reportUsability?.summary ??
                "Utilisabilité à confirmer après régénération du rapport.",
            responseCompleteness: snapshot.reportUsability?.responseCompleteness ?? 100,
            answerConsistency: snapshot.reportUsability?.answerConsistency ?? 70,
            openAnswerUsability: snapshot.reportUsability?.openAnswerUsability ?? 50,
            unresolvedDivergenceCount: snapshot.reportUsability?.unresolvedDivergenceCount ?? 0,
            highImportanceLimitedEvidenceCount: snapshot.reportUsability?.highImportanceLimitedEvidenceCount ?? 0,
            limitingFactors: snapshot.reportUsability?.limitingFactors ?? [],
        },
        interviewChecklist: snapshot.interviewChecklist ?? [],
        openAnswerAssessments: snapshot.openAnswerAssessments ??
            snapshot.objectiveClarifications.map((o) => ({
                questionCode: o.questionCode,
                originalAnswer: o.originalAnswer,
                status: o.quality,
                statusLabel: o.quality,
                proposedInterviewQuestion: o.proposedInterviewQuestion,
                operationalGoal: o.operationalGoal,
            })),
        declaredObstacles: snapshot.declaredObstacles ?? [],
        initialPlan: {
            ...snapshot.initialPlan,
            choiceApproachLabel: snapshot.initialPlan.choiceApproachLabel ??
                "Approche des choix : à préciser en entrevue",
        },
        sport: {
            ...snapshot.sport,
            scores: snapshot.sport.scores.map((s) => ({
                ...s,
                trendMode: s.trendMode ??
                    (s.agreement?.classification === "strongly_divergent"
                        ? "uncertain"
                        : "normal"),
            })),
            groupedUncertainties: snapshot.sport.groupedUncertainties.map((u) => ({
                ...u,
                pdfSummary: u.pdfSummary ?? u.summary,
            })),
        },
        nutrition: snapshot.nutrition
            ? {
                ...snapshot.nutrition,
                scores: snapshot.nutrition.scores.map((s) => ({
                    ...s,
                    trendMode: s.trendMode ??
                        (s.agreement?.classification === "strongly_divergent"
                            ? "uncertain"
                            : "normal"),
                })),
                groupedUncertainties: snapshot.nutrition.groupedUncertainties.map((u) => ({
                    ...u,
                    pdfSummary: u.pdfSummary ?? u.summary,
                })),
            }
            : undefined,
        findings: snapshot.findings.map((f) => {
            const legacyType = f.type;
            const type = legacyType === "coaching_preference" || legacyType === "action"
                ? "priority"
                : f.type;
            return {
                ...f,
                interpretation: f.interpretation ?? f.observation,
                validationQuestion: f.validationQuestion ?? f.toConfirm,
                toConfirm: f.toConfirm ?? f.validationQuestion,
                type,
            };
        }),
    };
}
