import { assembleCoachReportSnapshotV31 } from "../v31/assemble.mjs";
import { interpretAllDomains, interpretDomain, levelLabelFr, toCoachingIndicator, V41_DOMAIN_DEFINITIONS, } from "../../scoring/domain-interpretation-v41.mjs";
import { applyPresentationEvidenceRules, applyPresentationEvidenceRulesAll, } from "../../scoring/presentation-evidence-v42.mjs";
import { assertReportModelV42 } from "./assertions.mjs";
import { NO_PROBABLE_STRENGTH_MESSAGE } from "./assets.mjs";
import { buildChoiceApproach, buildCommunicationApproach, } from "./choice-approach.mjs";
import { buildActionableFindingsV42, buildConfirmedStrengths, buildDeclaredLevers, buildProbableLevers, buildProbableStrengths, strengthLabelsOrNone, } from "./findings.mjs";
import { buildRichNutritionNarrative, buildSportNarrativeSections, } from "./narrative.mjs";
import { collectNormalizedOpenAnswersV42, extractDeclaredObstaclesV42, extractNormalizedObstaclesV42, } from "./obstacles.mjs";
import { buildOpenAnswerAssessmentsV42, hasBodyGoal, hasFoodQualityGoal, hasGeneralFitnessGoal, hasGeneralHealthGoal, hasLoadProgressionGoal, hasMedicalIndicator, hasMirrorGoal, hasStrengthGoal, hasWellbeingGoal, hasWellbeingSuccessIndicator, hasConsistencyFoodGoal, hasMealPlanObstacle, } from "./open-answers.mjs";
import { detectCrossSourceConflictsV42 } from "./conflicts.mjs";
import { buildNutritionStructureApproach } from "./narrative.mjs";
import { buildFourWeekPlanV42, buildInterviewChecklistV42, buildInterviewQuestionsV42, buildPersonalizedPrioritiesV42, } from "./plan.mjs";
import { buildBehavioralReadinessV42 } from "./readiness.mjs";
import { buildReportUsabilityV42 } from "./usability.mjs";
function rawLikert(questions, answers, code) {
    const q = questions.find((item) => item.code === code);
    const a = q && answers.find((x) => x.questionId === q.id);
    return typeof a?.numericValue === "number" ? a.numericValue : null;
}
function normalizedLikert(questions, answers, code) {
    const q = questions.find((item) => item.code === code);
    const v = rawLikert(questions, answers, code);
    if (!q || v === null)
        return 0;
    return ((v - (q.likertMin ?? 1)) / ((q.likertMax ?? 5) - (q.likertMin ?? 1))) * 100;
}
function optionText(questions, answers, code, optionLabels) {
    const q = questions.find((item) => item.code === code);
    const a = q && answers.find((x) => x.questionId === q.id);
    if (!a)
        return undefined;
    if (a.textValue?.trim())
        return a.textValue.trim();
    const id = a.selectedOptionIds?.[0];
    return id ? optionLabels?.get(id) : undefined;
}
function toOperational(findings) {
    return findings.map((f) => ({
        id: f.id,
        type: "priority",
        title: f.title,
        observation: f.observation,
        interpretation: f.interpretation,
        possibleConsequence: f.possibleConsequence,
        recommendedAction: f.recommendedAction,
        validationQuestion: f.validationQuestion,
        toConfirm: f.validationQuestion,
        importance: f.importance,
        evidenceStrength: "moderate",
        requiresInterviewConfirmation: true,
        contributingDimensions: [],
    }));
}
function domainRowsForTable(domains) {
    return domains.map((d) => ({
        dimension: d.domainId,
        label: d.label,
        score: d.technicalScore ?? null,
        itemCount: d.itemCount,
        agreement: {
            agreementLevel: d.agreement === "insufficient"
                ? "insufficient"
                : d.agreement === "consistent"
                    ? "consistent"
                    : d.agreement === "mixed"
                        ? "mixed"
                        : "strongly_divergent",
            classification: d.agreementLabel,
            trendEstablished: d.trendEstablished,
            dominantDirection: d.level === "uncertain" ? "none" : d.level,
            itemCount: d.itemCount,
            spread: 0,
            mean: d.technicalScore ?? 0,
        },
        agreementLabel: d.agreementLabel,
        trendLabel: d.trendLabel,
        trendMode: d.trendEstablished ? "normal" : "uncertain",
    }));
}
function interpretDomainsForPresentation(input) {
    return applyPresentationEvidenceRulesAll(interpretAllDomains({
        questions: input.questions,
        answers: input.answers,
    }));
}
function interpretPresentationDomain(domainId, input) {
    const definition = V41_DOMAIN_DEFINITIONS.find((d) => d.domainId === domainId);
    if (!definition) {
        throw new Error(`Unknown domain: ${domainId}`);
    }
    return applyPresentationEvidenceRules(interpretDomain({
        definition,
        questions: input.questions,
        answers: input.answers,
    }));
}
function buildPresentationAdherenceBreakdown(input) {
    const maintenance = interpretPresentationDomain("adherence_maintenance", input);
    const recovery = interpretPresentationDomain("adherence_recovery_signal", input);
    const history = interpretPresentationDomain("adherence_history", input);
    const overall = interpretPresentationDomain("adherence_recovery", input);
    return {
        maintenanceDuringBusyPeriods: toCoachingIndicator(maintenance),
        recoveryAfterInterruption: toCoachingIndicator(recovery),
        behavioralPreparationHistory: toCoachingIndicator(history),
        overall: toCoachingIndicator(overall),
    };
}
export function assembleCoachReportSnapshotV42(input) {
    const baseline = assembleCoachReportSnapshotV31(input);
    const domains = interpretDomainsForPresentation(input);
    const adherenceBreakdown = buildPresentationAdherenceBreakdown(input);
    const openAnswers = buildOpenAnswerAssessmentsV42(input.questions, input.answers);
    const normalizedOpenAnswers = collectNormalizedOpenAnswersV42(input.questions, input.answers, input.optionLabels);
    const normalizedObstacles = extractNormalizedObstaclesV42(input.questions, input.answers, input.optionLabels);
    const declaredObstacles = extractDeclaredObstaclesV42(input.questions, input.answers, input.optionLabels);
    const structureDomain = domains.find((d) => d.domainId === "structure_need");
    const explanationDomain = domains.find((d) => d.domainId === "explanation_need");
    const coachDomain = domains.find((d) => d.domainId === "coach_receptivity");
    const choiceApproach = buildChoiceApproach({
        interestInOptions: normalizedLikert(input.questions, input.answers, "CHOICE_01"),
        preferenceForCoachDirection: (() => {
            const v = rawLikert(input.questions, input.answers, "CHOICE_02");
            return v == null
                ? undefined
                : normalizedLikert(input.questions, input.answers, "CHOICE_02");
        })(),
        optionOverloadRisk: normalizedLikert(input.questions, input.answers, "CHOICE_03"),
        explanationNeed: explanationDomain
            ? toCoachingIndicator(explanationDomain)
            : undefined,
        structureNeedLevel: structureDomain?.level,
    });
    const communicationApproach = buildCommunicationApproach({
        explanationNeedLevel: explanationDomain?.level,
        coachReceptivityLevel: coachDomain?.level,
    });
    const readiness = buildBehavioralReadinessV42({
        domains,
        openAnswers,
        choiceApproach,
        adherenceBreakdown,
    });
    const usability = buildReportUsabilityV42({ domains, openAnswers });
    const probableStrengths = buildProbableStrengths(domains);
    const confirmedStrengths = buildConfirmedStrengths(domains, input.coachValidations ?? []);
    const probableLevers = buildProbableLevers(domains);
    const declaredLevers = buildDeclaredLevers(openAnswers);
    const foodObstacle = normalizedOpenAnswers.find((n) => n.semanticCategory === "food_general");
    const knowledgeGap = normalizedOpenAnswers.some((n) => n.semanticCategory === "food_knowledge");
    const cravings = normalizedOpenAnswers.some((n) => n.semanticCategory === "cravings");
    const bodyGoal = hasBodyGoal(openAnswers);
    const mirrorGoal = hasMirrorGoal(openAnswers);
    const strengthGoal = hasStrengthGoal(openAnswers);
    const loadProgression = hasLoadProgressionGoal(openAnswers);
    const generalHealthGoal = hasGeneralHealthGoal(openAnswers);
    const generalFitnessGoal = hasGeneralFitnessGoal(openAnswers);
    const medicalIndicator = hasMedicalIndicator(openAnswers);
    const foodQualityGoal = hasFoodQualityGoal(openAnswers);
    const wellbeingGoal = hasWellbeingGoal(openAnswers);
    const wellbeingSuccessIndicator = hasWellbeingSuccessIndicator(openAnswers);
    const consistencyFoodGoal = hasConsistencyFoodGoal(openAnswers);
    const mealPlanObstacle = hasMealPlanObstacle(openAnswers) ||
        normalizedObstacles.some((n) => n.canonicalId === "meal_plan");
    const vegGoal = openAnswers.some((a) => a.status === "behavior_goal_needs_frequency");
    const hasSubstances = normalizedObstacles.some((n) => n.canonicalId === "substances");
    const hasBudget = normalizedObstacles.some((n) => n.canonicalId === "budget");
    const hasPortionsObstacle = normalizedObstacles.some((n) => n.canonicalId === "portions");
    const hasSocialMeals = normalizedObstacles.some((n) => n.canonicalId === "social_meals");
    const hasVariableSchedule = normalizedObstacles.some((n) => n.canonicalId === "food_schedule");
    const hasLackOfPlanning = normalizedObstacles.some((n) => n.canonicalId === "food_planning");
    const hasConsistencyObstacle = normalizedObstacles.some((n) => n.canonicalId === "consistency");
    const hasCravings = normalizedObstacles.some((n) => n.canonicalId === "cravings") || cravings;
    const softFeedback = explanationDomain?.level === "high" &&
        (coachDomain?.level === "low" || coachDomain?.level === "uncertain");
    const planInput = {
        hasBodyGoal: bodyGoal,
        hasMirrorGoal: mirrorGoal,
        hasGeneralHealthGoal: generalHealthGoal,
        hasGeneralFitnessGoal: generalFitnessGoal,
        hasStrengthGoal: strengthGoal,
        hasLoadProgression: loadProgression,
        hasMedicalIndicator: medicalIndicator,
        hasFoodQualityGoal: foodQualityGoal,
        hasFoodObstacle: Boolean(foodObstacle),
        hasVegGoal: vegGoal,
        hasSubstances,
        hasBudget,
        hasPortionsObstacle,
        hasSocialMeals,
        hasVariableSchedule,
        hasCravings,
        hasWellbeingGoal: wellbeingGoal,
        hasWellbeingSuccessIndicator: wellbeingSuccessIndicator,
        hasConsistencyFoodGoal: consistencyFoodGoal,
        hasMealPlanObstacle: mealPlanObstacle,
        hasLackOfPlanning,
        hasConsistencyObstacle,
        recoveryUncertain: readiness.recoveryCapacity.includes("fragile") ||
            readiness.recoveryCapacity.includes("incertain"),
        followUpTwiceWeekly: readiness.followUpFrequency === "twice_weekly",
        knowledgeGap,
    };
    const priorities = buildPersonalizedPrioritiesV42(planInput);
    const fourWeekPlanDetailed = buildFourWeekPlanV42({
        ...planInput,
        collaborativeChoice: choiceApproach.preference === "collaborative_guided",
        structuredAutonomy: choiceApproach.preference === "structured_autonomy" ||
            choiceApproach.preference === "high_autonomy",
        softFeedback,
    });
    const checklist = buildInterviewChecklistV42({
        priorities,
        hasFoodObstacle: Boolean(foodObstacle),
        hasBodyGoal: bodyGoal,
        hasMirrorGoal: mirrorGoal,
        hasSubstances,
        hasStrengthGoal: strengthGoal,
        hasLoadProgression: loadProgression,
        hasVariableSchedule,
        hasCravings,
        hasSocialMeals,
        hasFoodQualityGoal: foodQualityGoal,
        hasWellbeingGoal: wellbeingGoal,
        hasMealPlanObstacle: mealPlanObstacle,
        hasConsistencyFoodGoal: consistencyFoodGoal,
        hasLackOfPlanning,
        softFeedback,
        choiceApproach,
    });
    const priorityInterviewQuestions = buildInterviewQuestionsV42({
        openAnswers,
        obstacles: declaredObstacles,
        normalizedObstacles,
        choiceApproach,
        followUpTwiceWeekly: readiness.followUpFrequency === "twice_weekly",
    });
    const actionableFindings = buildActionableFindingsV42({
        domains,
        choiceApproach,
        hasBodyGoal: bodyGoal,
        hasMirrorGoal: mirrorGoal,
        hasStrengthGoal: strengthGoal,
        foodObstacle: foodObstacle?.normalizedLabel,
    });
    const findings = toOperational(actionableFindings);
    const sportDomains = domains.filter((d) => [
        "autonomous_motivation",
        "autonomous_value_without_results",
        "results_orientation",
        "results_delay_sensitivity",
        "adherence_recovery",
        "all_or_nothing",
        "delay_tolerance",
        "long_term_projection",
        "structure_need",
        "explanation_need",
        "choice_interest",
        "option_overload",
        "coach_receptivity",
    ].includes(d.domainId));
    const nutritionDomains = domains.filter((d) => [
        "nutrition_value",
        "performance_fueling",
        "nutrition_planning",
        "food_flexibility",
        "compensatory_food",
        "emotional_stress_food",
        "emotional_reward_food",
        "nutrition_structure",
        "hunger_signals",
    ].includes(d.domainId));
    const sportNarrative = buildSportNarrativeSections(domains, choiceApproach, {
        hasWellbeingGoal: wellbeingGoal,
    });
    const conflicts = detectCrossSourceConflictsV42({ domains, obstacles: normalizedObstacles });
    const preferenceText = optionText(input.questions, input.answers, "NUT_PREF_01", input.optionLabels);
    const nutritionParagraphs = buildRichNutritionNarrative({
        domains,
        obstacles: normalizedOpenAnswers,
        normalizedObstacles,
        preferenceText,
        conflicts,
    });
    const vigilanceRisks = [];
    const adherence = domains.find((d) => d.domainId === "adherence_recovery");
    if (adherence &&
        (adherence.level === "low" ||
            adherence.agreement === "mixed" ||
            adherence.trendDisplay === "low_to_confirm")) {
        vigilanceRisks.push("Point de vigilance — L'adhésion et la capacité de reprise restent à confirmer.");
    }
    const rigidity = domains.find((d) => d.domainId === "all_or_nothing");
    if (rigidity && (rigidity.level === "high" || rigidity.trendDisplay === "high_to_confirm")) {
        vigilanceRisks.push("Point de vigilance — Fonctionnement tout-ou-rien à surveiller après un écart.");
    }
    const answeredIds = new Set(input.answers
        .filter((a) => a.numericValue != null ||
        Boolean(a.textValue?.trim()) ||
        Boolean(a.selectedOptionIds?.length))
        .map((a) => a.questionId));
    const directAnswers = baseline.directAnswers
        .filter((row) => {
        const q = input.questions.find((item) => item.code === row.questionCode);
        if (!q)
            return true;
        if (q.interpretationTags?.includes("adaptive_bank") && !answeredIds.has(q.id)) {
            return false;
        }
        return true;
    })
        .map((row) => {
        const q = input.questions.find((item) => item.code === row.questionCode);
        if (q?.interpretationTags?.includes("adaptive_bank")) {
            return {
                ...row,
                section: "Précision adaptative",
                questionText: `[Précision adaptative] ${row.questionText}`,
            };
        }
        return row;
    });
    const adaptiveAnswers = directAnswers.filter((row) => row.section === "Précision adaptative" ||
        row.questionText.startsWith("[Précision adaptative]"));
    const fourWeekPlan = {
        weeks: fourWeekPlanDetailed.map((w) => ({
            week: w.week,
            title: w.title,
            objective: w.objective,
            focus: w.objective,
            coachActions: w.actions.map((a) => a.text),
            clientIndicators: strengthGoal || loadProgression
                ? ["Séances complétées", "Charges, répétitions et RPE notés"]
                : mirrorGoal
                    ? ["Séances complétées", "Indicateurs hors miroir notés"]
                    : ["Séances complétées", "Actions réalisées"],
            validationPoints: w.actions.slice(0, 2).map((a) => a.text),
            actions: w.actions.map((a) => a.text),
        })),
    };
    const resultsDomain = domains.find((d) => d.domainId === "results_orientation");
    const resultsSummary = resultsDomain &&
        resultsDomain.level === "high" &&
        resultsDomain.agreement === "consistent" &&
        resultsDomain.itemCount > 1
        ? `Orientation vers les résultats : ${levelLabelFr(resultsDomain.level)} et cohérente. Solidité actuelle : ${resultsDomain.evidenceStrength === "reinforced" ? "renforcée" : resultsDomain.evidenceStrength === "moderate" ? "modérée" : "limitée"}.`
        : sportNarrative[0]?.paragraphs[0] ?? baseline.initialPlan.profileSummary;
    const openAnswerAssessments = openAnswers.map((a) => ({
        questionCode: a.questionCode,
        originalAnswer: a.originalAnswer,
        status: a.status === "experience_goal" ||
            a.status === "body_composition_goal_needs_definition" ||
            a.status === "behavior_goal_needs_frequency" ||
            a.status === "outcome_indicator_needs_definition" ||
            a.status === "general_health_goal_needs_operationalization" ||
            a.status === "general_fitness_goal_needs_operationalization" ||
            a.status === "strength_performance_goal_needs_targets" ||
            a.status === "load_progression_indicator_needs_structure" ||
            a.status === "medical_indicator_requires_professional_context" ||
            a.status === "food_quality_concept_needs_definition"
            ? "usable_needs_operationalization"
            : a.status === "missing"
                ? "missing"
                : a.status === "vague"
                    ? "vague"
                    : a.status === "usable"
                        ? "usable"
                        : "needs_clarification",
        statusLabel: a.statusLabel,
        proposedInterviewQuestion: a.proposedInterviewQuestion,
        operationalGoal: a.operationalGoal,
    }));
    const annexPreserved = directAnswers.map((row) => row);
    const strengthAssets = confirmedStrengths.length ? confirmedStrengths : probableStrengths;
    const leversOrStrengths = [
        ...strengthLabelsOrNone(strengthAssets, confirmedStrengths.length === 0),
        ...probableLevers.map((l) => l.title),
        ...declaredLevers.map((l) => l.title),
    ];
    const clarifications = [
        ...(generalHealthGoal
            ? ["Clarifier ce que signifie « être en santé »."]
            : []),
        ...(generalFitnessGoal
            ? ["Préciser ce que signifie « être en forme » pour ce client."]
            : []),
        ...(medicalIndicator
            ? ["Préciser les marqueurs sanguins suivis avec le professionnel responsable."]
            : []),
        ...(foodQualityGoal ? ["Définir ce que signifie « qualité » alimentaire."] : []),
        ...(foodObstacle
            ? ["Clarifier ce que le client entend par son obstacle alimentaire."]
            : []),
        ...(mirrorGoal || bodyGoal
            ? ["Définir les indicateurs corporels acceptables hors miroir."]
            : []),
        ...(strengthGoal
            ? ["Préciser les mouvements et cibles de force."]
            : []),
        ...(hasSubstances
            ? ["Clarifier la consommation de substances et son impact."]
            : []),
        choiceApproach.validationQuestion,
    ];
    const initialApproachWarnings = [
        ...(softFeedback
            ? [
                {
                    id: "warn_feedback_style",
                    severity: "moderate",
                    message: "Ne pas présenter les corrections de façon confrontante sans permission.",
                },
            ]
            : []),
        ...(choiceApproach.preference === "collaborative_guided"
            ? [
                {
                    id: "warn_too_many_choices",
                    severity: "moderate",
                    message: "Ne pas offrir trop de choix en même temps.",
                },
            ]
            : []),
        ...(mirrorGoal
            ? [
                {
                    id: "warn_weight_mirror",
                    severity: "moderate",
                    message: "Ne pas utiliser uniquement le poids ou le miroir comme indicateurs.",
                },
            ]
            : []),
        ...(readiness.recoveryCapacity.includes("fragile")
            ? [
                {
                    id: "warn_all_or_nothing",
                    severity: "high",
                    message: "Réaction tout-ou-rien après un écart",
                },
            ]
            : []),
    ];
    const initialPlan = {
        ...baseline.initialPlan,
        profileSummary: resultsSummary,
        portraitOperational: sportNarrative[0]?.paragraphs[0] ?? resultsSummary,
        preparationLevel: readiness.overall === "fragile"
            ? "fragile"
            : readiness.overall === "strong"
                ? "strong"
                : readiness.overall === "developing"
                    ? "developing"
                    : "adequate_with_conditions",
        preparationLabel: readiness.preparationLabeled.value,
        recommendedCheckInFrequency: readiness.followUpFrequency,
        followUpLabel: readiness.followUpLabel,
        followUpRationale: readiness.followUpRationale,
        recommendedStructure: "moderate",
        structureLabel: readiness.structureLabeled.value,
        decisionPreference: choiceApproach.preference === "collaborative_guided"
            ? "guided_choice"
            : choiceApproach.preference === "coach_directed"
                ? "coach_directed"
                : choiceApproach.preference === "structured_autonomy" ||
                    choiceApproach.preference === "high_autonomy"
                    ? "high_autonomy"
                    : "uncertain",
        choiceApproachLabel: choiceApproach.label,
        choiceApproach,
        preparationLabeled: readiness.preparationLabeled,
        structureLabeled: readiness.structureLabeled,
        choiceApproachLabeled: {
            label: "Approche des choix",
            value: choiceApproach.label,
        },
        mainStrengths: strengthLabelsOrNone(strengthAssets, confirmedStrengths.length === 0),
        probableStrengths,
        probableLevers: probableLevers.map((l) => l.title),
        declaredLevers,
        confirmedStrengths,
        preparationBreakdown: readiness.summaryLines,
        mainDecisions: [
            readiness.followUpRationale,
            nutritionParagraphs[0] ?? "",
        ].filter(Boolean),
        priorities,
        initialPriorities: priorities,
        leversOrStrengths,
        mainRisks: vigilanceRisks.length ? vigilanceRisks : [],
        clarifications,
        missedSessionProtocol: "Tester une procédure minimale de reprise après une séance manquée — intervention recommandée, non une force déjà présente.",
        nutritionApproach: buildNutritionStructureApproach(domains, preferenceText),
        communicationStyle: communicationApproach.label,
        communicationApproach,
        firstFourWeeksActions: fourWeekPlanDetailed
            .flatMap((w) => w.actions.map((a) => a.text))
            .slice(0, 8),
        priorityInterviewQuestions: priorityInterviewQuestions.map((q) => q.text),
    };
    const reportUsability = {
        ...baseline.reportUsability,
        overall: usability.level === "strong"
            ? "strong"
            : usability.level === "limited"
                ? "limited"
                : "usable_with_validation",
        level: usability.level === "strong"
            ? "high"
            : usability.level === "limited"
                ? "limited"
                : "moderate",
        summary: usability.message,
        message: usability.message,
        levelLabel: usability.level === "strong"
            ? "Élevée"
            : usability.level === "limited"
                ? "Limitée"
                : "Utilisable avec validation",
    };
    const behavioralReadiness = {
        ...baseline.behavioralReadiness,
        ...readiness,
        overall: readiness.overall,
        overallLabel: readiness.overallLabel,
        explanation: readiness.explanation,
        choiceApproachLabel: readiness.choiceApproachLabel,
        consistencyLabel: `Capacité de maintien : ${readiness.maintenanceCapacity}`,
        selfEfficacyLabel: `Capacité de reprise : ${readiness.recoveryCapacity}`,
        structureFitLabel: readiness.structureLabel,
        // Keep the starting frame as explanation only — never re-list as "Condition — …".
        conditions: [],
        consistencyCapacity: "variable",
        goalClarity: "moderate",
        difficultyTolerance: "variable",
        recoveryCapacity: "unconfirmed",
        changeIntention: "unclear",
    };
    const snapshot = {
        ...baseline,
        schemaVersion: "report-model-v4.2",
        questionnaireVersion: "questionnaire-v4.1",
        rulesetVersion: "ruleset-v4.1",
        initialApproachWarnings,
        domainInterpretations: domains,
        coachingIndicators: domains.map((d) => toCoachingIndicator(d)),
        adherenceBreakdown,
        usability,
        reportUsability,
        readiness,
        behavioralReadiness,
        metadata: {
            ...baseline.metadata,
            reportModelVersion: "v4.2",
            rulesetVersion: "ruleset-v4.1",
            questionnaireVersion: "questionnaire-v4.1",
        },
        initialPlan,
        confirmedStrengths,
        probableStrengths,
        probableLevers,
        declaredLevers,
        actionableFindings,
        findings,
        openAnswers,
        openAnswerAssessments,
        normalizedOpenAnswers,
        declaredObstacles,
        normalizedObstacles,
        conflicts,
        fourWeekPlanDetailed,
        fourWeekPlan,
        interviewChecklist: checklist.map((c) => ({
            id: c.id,
            label: c.label,
            category: c.category,
            checked: false,
            sortOrder: c.sortOrder,
        })),
        priorityInterviewQuestions,
        directAnswers: annexPreserved,
        adaptiveAnswers,
        sport: {
            ...baseline.sport,
            scores: domainRowsForTable(sportDomains),
            domainInterpretations: sportDomains,
            narrativeSections: sportNarrative,
            wordCount: sportNarrative.flatMap((s) => s.paragraphs).join(" ").split(/\s+/).length,
        },
        nutrition: nutritionDomains.length
            ? {
                ...(baseline.nutrition ?? { groupedUncertainties: [] }),
                scores: domainRowsForTable(nutritionDomains),
                domainInterpretations: nutritionDomains,
                narrativeSections: [
                    {
                        key: "v42-nutrition",
                        title: "Analyse alimentaire",
                        paragraphs: nutritionParagraphs,
                    },
                ],
                wordCount: nutritionParagraphs.join(" ").split(/\s+/).length,
                rolePerformanceCrossRule: nutritionParagraphs[0],
            }
            : undefined,
    };
    const consistencyErrors = assertReportModelV42(snapshot);
    if (consistencyErrors.length > 0 && process.env.NODE_ENV === "test") {
        Object.assign(snapshot.metadata, {
            consistencyWarnings: consistencyErrors,
        });
    }
    return snapshot;
}
export function isCoachReportSnapshotV42(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.schemaVersion === "report-model-v4.2");
}
export { hasGeneralFitnessGoal, NO_PROBABLE_STRENGTH_MESSAGE };
