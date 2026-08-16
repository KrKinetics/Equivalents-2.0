import { describe, expect, it } from "./expect-shim.mjs";
import { classifyBroadDirection, interpretDomain, toTrendDisplay, } from "../../src/coach/motivation/scoring/domain-interpretation-v41.mjs";
import { applyPresentationEvidenceRules, } from "../../src/coach/motivation/scoring/presentation-evidence-v42.mjs";
import { assertOperationalFindingsMatchEvidence, assertUsabilityMatchesDomainInterpretations, } from "../../src/coach/motivation/report/v42/assertions.mjs";
import { assembleCoachReportSnapshotV42 } from "../../src/coach/motivation/report/v42/assemble.mjs";
import { buildConfirmedStrengths, buildProbableLevers, buildProbableStrengths, } from "../../src/coach/motivation/report/v42/findings.mjs";
import { assessOpenAnswerStatus, interviewQuestionFor, normalizeOpenAnswerText, } from "../../src/coach/motivation/report/v42/open-answers.mjs";
import { mergeNormalizedObstacles } from "../../src/coach/motivation/report/v42/obstacles.mjs";
import { buildRichNutritionNarrative } from "../../src/coach/motivation/report/v42/narrative.mjs";
import { buildChoiceApproach } from "../../src/coach/motivation/report/v42/choice-approach.mjs";
import { buildPersonalizedPrioritiesV42, dedupeInterviewQuestions, } from "../../src/coach/motivation/report/v42/plan.mjs";
import { buildReportUsabilityV42 } from "../../src/coach/motivation/report/v42/usability.mjs";
function likert(code, id, primaryDimension) {
    return {
        id,
        code,
        text: code,
        type: "likert",
        required: true,
        active: true,
        order: 1,
        section: "t",
        likertMin: 1,
        likertMax: 5,
        scoringDirection: "positive",
        interpretationTags: [],
        primaryDimension: primaryDimension,
    };
}
function ans(questionId, numericValue) {
    return { questionId, numericValue };
}
describe("presentation evidence v4.2", () => {
    const def = {
        domainId: "coach_receptivity",
        label: "Réceptivité au feedback direct",
        coreCodes: ["COACH_01"],
        adaptiveCodes: [],
    };
    it("single item → Donnée unique, never Cohérente", () => {
        const raw = interpretDomain({
            definition: def,
            questions: [likert("COACH_01", "q1")],
            answers: [ans("q1", 5)],
        });
        expect(raw.agreement).toBe("consistent");
        expect(raw.technicalScore).toBe(100);
        const presented = applyPresentationEvidenceRules(raw);
        expect(presented.agreement).toBe("insufficient");
        expect(presented.agreementLabel).toBe("Donnée unique");
        expect(presented.evidenceStrength).toBe("limited");
        expect(presented.trendLabel).toBe("Élevée - appui limité");
        expect(presented.technicalScore).toBe(100);
        expect(presented.agreementLabel).not.toBe("Cohérente");
    });
    it("two items unchanged by presentation rules", () => {
        const hungerDef = {
            domainId: "hunger_signals",
            label: "Signaux de faim",
            coreCodes: ["NUT_SIGNAL_01"],
            adaptiveCodes: ["NUT_SIGNAL_03"],
        };
        const raw = interpretDomain({
            definition: hungerDef,
            questions: [likert("NUT_SIGNAL_01", "q1"), likert("NUT_SIGNAL_03", "q2")],
            answers: [ans("q1", 5), ans("q2", 5)],
        });
        const presented = applyPresentationEvidenceRules(raw);
        expect(presented.agreement).toBe("consistent");
        expect(presented.agreementLabel).toBe("Cohérente");
    });
});
describe("open answers v4.2", () => {
    it("classifies être en forme as general_fitness, not experience_goal", () => {
        expect(assessOpenAnswerStatus("être en forme")).toBe("general_fitness_goal_needs_operationalization");
        expect(assessOpenAnswerStatus("en forme")).toBe("general_fitness_goal_needs_operationalization");
        expect(assessOpenAnswerStatus("énergie")).toBe("vague");
        expect(assessOpenAnswerStatus("plaisir")).toBe("experience_goal");
        const fitnessQ = interviewQuestionFor("general_fitness_goal_needs_operationalization", "être en forme");
        expect(fitnessQ.canonicalKey).toBe("general_fitness");
        expect(fitnessQ.text).toMatch(/énergie|endurance|force|composition corporelle/i);
    });
    it("normalizes miroir and qualité labels", () => {
        const mirror = normalizeOpenAnswerText("miroir");
        expect(mirror.normalizedLabel).toBe("Indicateur visuel à préciser");
        expect(mirror.originalText).toBe("miroir");
        const quality = normalizeOpenAnswerText("qualité");
        expect(quality.semanticCategory).toBe("food_quality");
        expect(quality.normalizedLabel).toBe("Qualité alimentaire - critères concrets à définir");
    });
    it("classifies devenir fort as a strength/performance goal", () => {
        expect(assessOpenAnswerStatus("devenir fort")).toBe("strength_performance_goal_needs_targets");
    });
    it("classifies mes charges qui monte as a load-progression indicator", () => {
        expect(assessOpenAnswerStatus("mes charges qui monte")).toBe("load_progression_indicator_needs_structure");
    });
    it("never classifies a visual-cues portion preference as a portions obstacle", () => {
        const preference = normalizeOpenAnswerText("Des portions et des repères visuels");
        expect(preference.semanticCategory).not.toBe("portions");
        expect(preference.clarificationNeeded).toBe(false);
    });
});
describe("obstacles v4.2", () => {
    it("keeps planning and schedule as separate obstacles", () => {
        const merged = mergeNormalizedObstacles([
            {
                raw: "Manque de planification",
                normalized: normalizeOpenAnswerText("Manque de planification"),
            },
            {
                raw: "Horaire de travail variable",
                normalized: normalizeOpenAnswerText("Horaire de travail variable"),
            },
        ]);
        expect(merged).toHaveLength(2);
        expect(merged.map((item) => item.canonicalId)).toEqual(["food_planning", "food_schedule"]);
        expect(merged.map((item) => item.normalizedLabel)).toEqual(["Manque de planification", "Horaire de travail variable"]);
    });
    it("uses specific Q+action for stress and food_general", () => {
        const stress = mergeNormalizedObstacles([
            {
                raw: "Stress",
                normalized: normalizeOpenAnswerText("Stress"),
            },
        ]);
        expect(stress[0]?.canonicalId).toBe("stress_emotions");
        expect(stress[0]?.planQuestion).toMatch(/stress|émotions/i);
        expect(stress[0]?.practicalAction).toMatch(/situation/i);
        const food = mergeNormalizedObstacles([
            {
                raw: "bouffe",
                normalized: normalizeOpenAnswerText("bouffe"),
            },
        ]);
        expect(food[0]?.canonicalId).toBe("food_general");
        expect(food[0]?.planQuestion).toMatch(/planification|portions|envies/i);
    });
});
describe("strengths v4.2", () => {
    const singleItemHigh = {
        domainId: "coach_receptivity",
        label: "Réceptivité au feedback direct",
        level: "high",
        agreement: "insufficient",
        trendDisplay: "high",
        evidenceStrength: "limited",
        trendEstablished: false,
        contributingQuestionCodes: ["COACH_01"],
        adaptiveQuestionCodes: [],
        opposingQuestionCodes: [],
        interpretation: "élevée",
        itemCount: 1,
        coreItemCount: 1,
        adaptiveItemCount: 0,
        normalizedValues: [100],
        classificationLabel: "Donnée unique — élevée - appui limité",
        agreementLabel: "Donnée unique",
        trendLabel: "Élevée - appui limité",
        technicalScore: 100,
        affectedDecisionIds: [],
    };
    const twoItemHigh = {
        ...singleItemHigh,
        domainId: "hunger_signals",
        label: "Signaux de faim",
        agreement: "consistent",
        evidenceStrength: "moderate",
        trendEstablished: true,
        itemCount: 2,
        coreItemCount: 1,
        adaptiveItemCount: 1,
        agreementLabel: "Cohérente",
        trendLabel: "Élevée",
        classificationLabel: "Cohérente — tendance élevée",
    };
    it("single-item high → lever with limited support, not strength", () => {
        expect(buildProbableStrengths([singleItemHigh])).toEqual([]);
        expect(buildConfirmedStrengths([singleItemHigh])).toEqual([]);
        const levers = buildProbableLevers([singleItemHigh]);
        expect(levers[0]?.type).toBe("probable_lever");
        expect(levers[0]?.title).toMatch(/Levier probable/i);
        expect(levers[0]?.detail).toMatch(/appui limité/i);
        expect(levers[0]?.title).not.toMatch(/Force probable/i);
    });
    it("two consistent items high → Force probable appuyée", () => {
        const strengths = buildProbableStrengths([twoItemHigh]);
        expect(strengths[0]?.title).toBe("Force probable appuyée — Signaux de faim");
        expect(strengths[0]?.title).not.toMatch(/fortement appuyée/i);
    });
});
describe("nutrition grammar v4.2", () => {
    it("uses repose sur une seule réponse for single-item performance", () => {
        const paragraphs = buildRichNutritionNarrative({
            domains: [
                {
                    domainId: "performance_fueling",
                    label: "Lien alimentation-performance",
                    level: "high",
                    agreement: "insufficient",
                    trendDisplay: "high",
                    evidenceStrength: "limited",
                    trendEstablished: false,
                    contributingQuestionCodes: ["NUT_PERF_01"],
                    adaptiveQuestionCodes: [],
                    opposingQuestionCodes: [],
                    interpretation: "",
                    itemCount: 1,
                    coreItemCount: 1,
                    adaptiveItemCount: 0,
                    normalizedValues: [100],
                    classificationLabel: "",
                    agreementLabel: "Donnée unique",
                    trendLabel: "Élevée - appui limité",
                    technicalScore: 100,
                    affectedDecisionIds: [],
                },
            ],
            obstacles: [],
        });
        expect(paragraphs.join(" ")).toMatch(/repose sur une seule réponse/i);
    });
    it("role narrative uses constituent probablement", () => {
        const paragraphs = buildRichNutritionNarrative({
            domains: [
                {
                    domainId: "nutrition_value",
                    label: "Importance alimentaire",
                    level: "low",
                    agreement: "consistent",
                    trendDisplay: "low",
                    evidenceStrength: "moderate",
                    trendEstablished: true,
                    contributingQuestionCodes: [],
                    adaptiveQuestionCodes: [],
                    opposingQuestionCodes: [],
                    interpretation: "",
                    itemCount: 2,
                    coreItemCount: 2,
                    adaptiveItemCount: 0,
                    normalizedValues: [30, 40],
                    classificationLabel: "",
                    agreementLabel: "Cohérente",
                    trendLabel: "Faible",
                    technicalScore: 35,
                    affectedDecisionIds: [],
                },
                {
                    domainId: "performance_fueling",
                    label: "Lien alimentation-performance",
                    level: "moderate",
                    agreement: "consistent",
                    trendDisplay: "moderate",
                    evidenceStrength: "moderate",
                    trendEstablished: true,
                    contributingQuestionCodes: [],
                    adaptiveQuestionCodes: [],
                    opposingQuestionCodes: [],
                    interpretation: "",
                    itemCount: 2,
                    coreItemCount: 2,
                    adaptiveItemCount: 0,
                    normalizedValues: [60, 65],
                    classificationLabel: "",
                    agreementLabel: "Cohérente",
                    trendLabel: "Modérée",
                    technicalScore: 62,
                    affectedDecisionIds: [],
                },
            ],
            obstacles: [],
        });
        expect(paragraphs[0]).toMatch(/constituent probablement/i);
    });
});
describe("usability v4.2", () => {
    it("excludes single-item domains from coherent list", () => {
        const usability = buildReportUsabilityV42({
            domains: [
                {
                    domainId: "explanation_need",
                    label: "Explications",
                    level: "high",
                    agreement: "insufficient",
                    trendDisplay: "high",
                    evidenceStrength: "limited",
                    trendEstablished: false,
                    contributingQuestionCodes: ["EXPL_01"],
                    adaptiveQuestionCodes: [],
                    opposingQuestionCodes: [],
                    interpretation: "élevée",
                    itemCount: 1,
                    coreItemCount: 1,
                    adaptiveItemCount: 0,
                    normalizedValues: [100],
                    classificationLabel: "Donnée unique",
                    agreementLabel: "Donnée unique",
                    trendLabel: "Élevée - appui limité",
                    technicalScore: 100,
                    affectedDecisionIds: [],
                },
            ],
            openAnswers: [],
        });
        expect(usability.coherentDomains).toEqual([]);
        expect(usability.limitedDataDomains).toContain("Explications");
    });
});
describe("interview questions v4.2", () => {
    it("dedupes by canonicalKey", () => {
        const deduped = dedupeInterviewQuestions([
            {
                canonicalKey: "food_planning",
                sourceQuestionCode: "OBS_01",
                category: "obstacle",
                text: "Q planning",
                priority: "high",
            },
            {
                canonicalKey: "food_planning",
                sourceQuestionCode: "OBS_02",
                category: "obstacle",
                text: "Q schedule",
                priority: "moderate",
            },
        ]);
        expect(deduped).toHaveLength(1);
    });
});
describe("choice approach v4.2", () => {
    it("high interest + low overload + high structure need → autonomie encadrée", () => {
        const approach = buildChoiceApproach({
            interestInOptions: 100,
            optionOverloadRisk: 0,
            structureNeedLevel: "high",
        });
        expect(approach.preference).toBe("structured_autonomy");
        expect(approach.label).toBe("autonomie encadrée");
    });
});
describe("personalized priorities v4.2", () => {
    const basePlanInput = {
        hasBodyGoal: false,
        hasMirrorGoal: false,
        hasGeneralHealthGoal: false,
        hasGeneralFitnessGoal: false,
        hasStrengthGoal: false,
        hasLoadProgression: false,
        hasMedicalIndicator: false,
        hasFoodQualityGoal: false,
        hasFoodObstacle: false,
        hasVegGoal: false,
        hasSubstances: false,
        hasBudget: false,
        hasPortionsObstacle: false,
        hasSocialMeals: false,
        hasVariableSchedule: false,
        hasCravings: false,
        hasWellbeingGoal: false,
        hasWellbeingSuccessIndicator: false,
        hasConsistencyFoodGoal: false,
        hasMealPlanObstacle: false,
        hasLackOfPlanning: false,
        hasConsistencyObstacle: false,
        recoveryUncertain: false,
        followUpTwiceWeekly: false,
        knowledgeGap: false,
    };
    it("does not always include a miroir priority", () => {
        const withoutMirror = buildPersonalizedPrioritiesV42({
            ...basePlanInput,
            hasStrengthGoal: true,
        });
        expect(withoutMirror.some((p) => /miroir/i.test(p))).toBe(false);
        const withMirror = buildPersonalizedPrioritiesV42({
            ...basePlanInput,
            hasMirrorGoal: true,
        });
        expect(withMirror.some((p) => /miroir/i.test(p))).toBe(true);
    });
});
describe("coherence v4.2 trends (unchanged technical)", () => {
    it("CHOICE_03 = 4 → high overload (technical layer)", () => {
        const overloadDef = {
            domainId: "option_overload",
            label: "Risque de surcharge devant trop d'options",
            coreCodes: ["CHOICE_03"],
            adaptiveCodes: [],
            useRawLikert: true,
        };
        const domain = interpretDomain({
            definition: overloadDef,
            questions: [likert("CHOICE_03", "q1")],
            answers: [ans("q1", 4)],
        });
        expect(domain.level).toBe("high");
        expect(classifyBroadDirection(75)).toBe("high");
        expect(toTrendDisplay("consistent", "high")).toBe("high");
    });
});
describe("assemble v4.2 snapshot", () => {
    const minimalScoring = {
        profileScores: {},
        nutritionScores: {},
        overallScore: 50,
        missingRequiredQuestionIds: [],
        dimensions: [
            { dimension: "choice_need", normalizedScore: 25, itemCount: 3 },
            { dimension: "explanation_need", normalizedScore: 50, itemCount: 1 },
        ],
    };
    function textQ(code, id, tags = ["goal"]) {
        return {
            id,
            code,
            text: code,
            type: "short_text",
            required: false,
            active: true,
            order: 1,
            section: "t",
            interpretationTags: tags,
        };
    }
    function textAns(questionId, textValue) {
        return { questionId, textValue };
    }
    it("builds v4.2 presentation with v4.1 questionnaire/ruleset versions", () => {
        const codes = ["COACH_01", "GOAL_01", "NUT_GOAL_01", "MOT_RES_01", "CHOICE_01", "CHOICE_03"];
        const questions = codes.map((code, i) => {
            if (code.startsWith("GOAL") || code.startsWith("NUT_GO")) {
                return textQ(code, `q${i}`, code.includes("NUT") ? ["nutrition_goal"] : ["goal"]);
            }
            return likert(code, `q${i}`, code.startsWith("CHOICE") ? "choice_need" : undefined);
        });
        const answers = questions.map((q) => {
            if (q.type === "short_text") {
                if (q.code === "GOAL_01")
                    return textAns(q.id, "être en forme");
                if (q.code === "NUT_GOAL_01")
                    return textAns(q.id, "qualité");
                return textAns(q.id, "test");
            }
            return ans(q.id, q.code === "COACH_01" ? 5 : 3);
        });
        const snapshot = assembleCoachReportSnapshotV42({
            assessmentId: "a1",
            clientId: "c1",
            clientName: "test",
            clientCoachId: "coach1",
            status: "completed",
            completedAt: new Date(),
            questionnaireVersion: "questionnaire-v4.1",
            rulesetVersion: "ruleset-v4.1",
            questions,
            answers,
            scoring: minimalScoring,
            insights: [],
            contradictions: [],
        });
        expect(snapshot.schemaVersion).toBe("report-model-v4.2");
        expect(snapshot.metadata.reportModelVersion).toBe("v4.2");
        expect(snapshot.questionnaireVersion).toBe("questionnaire-v4.1");
        expect(snapshot.rulesetVersion).toBe("ruleset-v4.1");
        const coach = snapshot.domainInterpretations.find((d) => d.domainId === "coach_receptivity");
        expect(coach?.agreementLabel).toBe("Donnée unique");
        expect(coach?.technicalScore).toBe(100);
        expect(snapshot.openAnswers.some((a) => a.status === "general_fitness_goal_needs_operationalization")).toBe(true);
        expect(snapshot.priorityInterviewQuestions.length).toBeLessThanOrEqual(5);
        expect(assertUsabilityMatchesDomainInterpretations(snapshot)).toEqual([]);
        expect(assertOperationalFindingsMatchEvidence(snapshot)).toEqual([]);
    });
});
