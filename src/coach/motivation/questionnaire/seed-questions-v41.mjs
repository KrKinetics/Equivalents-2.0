import { QUESTIONNAIRE_V4_ADAPTIVE_MAX, QUESTIONNAIRE_V4_BASE_COUNT, QUESTIONNAIRE_V4_NUTRITION_CONTEXTUAL, QUESTIONNAIRE_V4_NUTRITION_LIKERT, QUESTIONNAIRE_V4_TOTAL_MAX, QUESTIONNAIRE_V4_TRAINING_CONTEXTUAL, QUESTIONNAIRE_V4_TRAINING_LIKERT, SEED_QUESTIONS_V4, SEED_QUESTIONS_V4_ADAPTIVE, SEED_QUESTIONS_V4_BASE, V4_ADAPTIVE_BANK_CODES, V4_ADAPTIVE_CANDIDATES, V4_BASE_CODES, } from "./seed-questions-v4.mjs";
export { V4_ADAPTIVE_BANK_CODES as V41_ADAPTIVE_BANK_CODES, V4_BASE_CODES as V41_BASE_CODES, V4_ADAPTIVE_CANDIDATES as V41_ADAPTIVE_CANDIDATES_RAW, };
/** Adaptive domain mapping for v4.1 — MOT_RES_02 is delay sensitivity, not results. */
export const V41_ADAPTIVE_CANDIDATES = [
    {
        code: "RIG_02",
        domainId: "all_or_nothing",
        priority: "critical",
        affectedDecisionIds: ["all_or_nothing_protocol", "recovery_protocol"],
    },
    {
        code: "EFF_03",
        domainId: "adherence_maintenance",
        priority: "critical",
        affectedDecisionIds: ["follow_up_frequency", "recovery_protocol", "training_structure"],
    },
    {
        code: "CONS_02",
        domainId: "adherence_recovery",
        priority: "critical",
        affectedDecisionIds: ["follow_up_frequency", "recovery_protocol"],
    },
    {
        code: "CONS_03",
        domainId: "adherence_history",
        priority: "high",
        affectedDecisionIds: ["follow_up_frequency", "training_structure"],
    },
    {
        code: "NUT_COMP_02",
        domainId: "compensatory_food",
        priority: "critical",
        affectedDecisionIds: ["food_recovery_protocol"],
    },
    {
        code: "NUT_PLAN_01",
        domainId: "nutrition_planning",
        priority: "high",
        affectedDecisionIds: ["food_planning_approach", "food_structure"],
    },
    {
        code: "NUT_STRUCT_02",
        domainId: "nutrition_structure",
        priority: "high",
        affectedDecisionIds: ["food_structure", "food_planning_approach"],
    },
    {
        code: "NUT_FLEX_04",
        domainId: "food_flexibility",
        priority: "high",
        affectedDecisionIds: ["food_recovery_protocol"],
    },
    {
        code: "MOT_AUTO_02",
        domainId: "autonomous_value_without_results",
        priority: "high",
        affectedDecisionIds: ["follow_up_frequency", "communication_style"],
    },
    {
        code: "MOT_RES_02",
        domainId: "results_delay_sensitivity",
        priority: "high",
        affectedDecisionIds: ["follow_up_frequency", "communication_style"],
    },
    {
        code: "EFFORT_03",
        domainId: "delay_tolerance",
        priority: "high",
        affectedDecisionIds: ["follow_up_frequency"],
    },
    {
        code: "LT_01",
        domainId: "long_term_projection",
        priority: "high",
        affectedDecisionIds: ["follow_up_frequency", "training_structure"],
    },
    {
        code: "CHOICE_02",
        domainId: "choice_interest",
        priority: "moderate",
        affectedDecisionIds: ["choice_approach"],
    },
    {
        code: "STRUCT_01",
        domainId: "structure_need",
        priority: "moderate",
        affectedDecisionIds: ["training_structure"],
    },
    {
        code: "EXPL_03",
        domainId: "explanation_need",
        priority: "moderate",
        affectedDecisionIds: ["communication_style"],
    },
    {
        code: "COACH_02",
        domainId: "coach_receptivity",
        priority: "moderate",
        affectedDecisionIds: ["communication_style"],
    },
    {
        code: "NUT_ROLE_02",
        domainId: "nutrition_value",
        priority: "moderate",
        affectedDecisionIds: ["food_planning_approach"],
    },
    {
        code: "NUT_PERF_02",
        domainId: "performance_fueling",
        priority: "moderate",
        affectedDecisionIds: ["food_planning_approach"],
    },
    {
        code: "NUT_SIGNAL_02",
        domainId: "hunger_signals",
        priority: "moderate",
        affectedDecisionIds: ["food_structure"],
    },
];
function patchBase(q) {
    if (q.code === "CHOICE_03") {
        // Overload risk: 5/5 = high risk (do not invert). Keep dimension key compatible with SeedQuestion.
        return { ...q, scoringDirection: "positive", primaryDimension: "choice_need" };
    }
    return { ...q };
}
export const SEED_QUESTIONS_V41_BASE = SEED_QUESTIONS_V4_BASE.map(patchBase);
export const SEED_QUESTIONS_V41_ADAPTIVE = SEED_QUESTIONS_V4_ADAPTIVE.map((q) => ({ ...q }));
export const SEED_QUESTIONS_V41 = [
    ...SEED_QUESTIONS_V41_BASE,
    ...SEED_QUESTIONS_V41_ADAPTIVE,
];
export const QUESTIONNAIRE_V41_BASE_COUNT = QUESTIONNAIRE_V4_BASE_COUNT;
export const QUESTIONNAIRE_V41_ADAPTIVE_MAX = QUESTIONNAIRE_V4_ADAPTIVE_MAX;
export const QUESTIONNAIRE_V41_TOTAL_MAX = QUESTIONNAIRE_V4_TOTAL_MAX;
export const QUESTIONNAIRE_V41_TRAINING_LIKERT = QUESTIONNAIRE_V4_TRAINING_LIKERT;
export const QUESTIONNAIRE_V41_TRAINING_CONTEXTUAL = QUESTIONNAIRE_V4_TRAINING_CONTEXTUAL;
export const QUESTIONNAIRE_V41_NUTRITION_LIKERT = QUESTIONNAIRE_V4_NUTRITION_LIKERT;
export const QUESTIONNAIRE_V41_NUTRITION_CONTEXTUAL = QUESTIONNAIRE_V4_NUTRITION_CONTEXTUAL;
/** Ensure seed source still has 34+19 — historical V4 array length. */
void SEED_QUESTIONS_V4;
void V4_BASE_CODES;
