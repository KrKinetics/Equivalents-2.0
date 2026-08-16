import { SEED_QUESTIONS_V3 } from "./seed-questions.mjs";
/** 14 training Likert + 3 open = 17 training */
const TRAINING_BASE = [
    "MOT_AUTO_01",
    "MOT_RES_01",
    "EFF_01",
    "EFF_02",
    "CONS_01",
    "RIG_01",
    "RIG_03",
    "EFFORT_02",
    "LT_03",
    "STRUCT_03",
    "EXPL_01",
    "CHOICE_01",
    "CHOICE_03",
    "COACH_01",
    "GOAL_01",
    "GOAL_02",
    "OBS_01",
];
/** 13 nutrition Likert + 4 contextual = 17 nutrition */
const NUTRITION_BASE = [
    "NUT_ROLE_01",
    "NUT_PERF_01",
    "NUT_PLAN_02",
    "NUT_PLAN_03",
    "NUT_FLEX_01",
    "NUT_COMP_01",
    "NUT_COMP_03",
    "NUT_EMO_01",
    "NUT_EMO_02",
    "NUT_STRUCT_01",
    "NUT_STRUCT_03",
    "NUT_SIGNAL_01",
    "NUT_SIGNAL_03",
    "NUT_GOAL_01",
    "NUT_OBS_01",
    "NUT_PREF_01",
    "NUT_CONTEXT_01",
];
export const V4_BASE_CODES = [...TRAINING_BASE, ...NUTRITION_BASE];
/** Adaptive bank — max 4 shown; NUT_SUCCESS_01 intentionally excluded. */
export const V4_ADAPTIVE_BANK_CODES = [
    "MOT_AUTO_02",
    "MOT_RES_02",
    "EFF_03",
    "RIG_02",
    "EFFORT_03",
    "LT_01",
    "STRUCT_01",
    "EXPL_03",
    "CHOICE_02",
    "COACH_02",
    "CONS_02",
    "CONS_03",
    "NUT_ROLE_02",
    "NUT_PERF_02",
    "NUT_PLAN_01",
    "NUT_FLEX_04",
    "NUT_COMP_02",
    "NUT_STRUCT_02",
    "NUT_SIGNAL_02",
];
export const V4_ADAPTIVE_CANDIDATES = [
    { code: "EFF_03", domainId: "adherence_recovery", priority: "critical" },
    { code: "CONS_02", domainId: "adherence_recovery", priority: "critical" },
    { code: "CONS_03", domainId: "adherence_recovery", priority: "high" },
    { code: "RIG_02", domainId: "all_or_nothing", priority: "critical" },
    { code: "NUT_COMP_02", domainId: "compensatory_food", priority: "critical" },
    { code: "NUT_FLEX_04", domainId: "food_flexibility", priority: "high" },
    { code: "MOT_AUTO_02", domainId: "autonomous_motivation", priority: "high" },
    { code: "MOT_RES_02", domainId: "results_orientation", priority: "high" },
    { code: "EFFORT_03", domainId: "delay_tolerance", priority: "high" },
    { code: "LT_01", domainId: "long_term_projection", priority: "high" },
    { code: "CHOICE_02", domainId: "coaching_style", priority: "moderate" },
    { code: "STRUCT_01", domainId: "coaching_style", priority: "moderate" },
    { code: "EXPL_03", domainId: "coaching_style", priority: "moderate" },
    { code: "COACH_02", domainId: "coaching_style", priority: "moderate" },
    { code: "NUT_PLAN_01", domainId: "nutrition_planning", priority: "moderate" },
    { code: "NUT_ROLE_02", domainId: "nutrition_value", priority: "moderate" },
    { code: "NUT_PERF_02", domainId: "performance_fueling", priority: "moderate" },
    { code: "NUT_STRUCT_02", domainId: "nutrition_structure", priority: "moderate" },
    { code: "NUT_SIGNAL_02", domainId: "hunger_signals", priority: "moderate" },
];
function byCode(code) {
    const q = SEED_QUESTIONS_V3.find((item) => item.code === code);
    if (!q)
        throw new Error(`Missing seed question for v4: ${code}`);
    return q;
}
export const SEED_QUESTIONS_V4_BASE = V4_BASE_CODES.map((code) => {
    const q = byCode(code);
    const tags = [...(q.tags ?? [])].filter((t) => t !== "adaptive" && t !== "adaptive_bank");
    return { ...q, tags, required: q.required ?? true };
});
export const SEED_QUESTIONS_V4_ADAPTIVE = V4_ADAPTIVE_BANK_CODES.map((code) => {
    const q = byCode(code);
    const tags = new Set([...(q.tags ?? []), "adaptive", "adaptive_bank"]);
    return {
        ...q,
        tags: [...tags],
        required: false,
        section: "Quelques précisions rapides",
    };
});
export const SEED_QUESTIONS_V4 = [
    ...SEED_QUESTIONS_V4_BASE,
    ...SEED_QUESTIONS_V4_ADAPTIVE,
];
export const QUESTIONNAIRE_V4_BASE_COUNT = SEED_QUESTIONS_V4_BASE.length;
export const QUESTIONNAIRE_V4_ADAPTIVE_MAX = 4;
export const QUESTIONNAIRE_V4_TOTAL_MAX = QUESTIONNAIRE_V4_BASE_COUNT + QUESTIONNAIRE_V4_ADAPTIVE_MAX;
export const QUESTIONNAIRE_V4_TRAINING_LIKERT = 14;
export const QUESTIONNAIRE_V4_TRAINING_CONTEXTUAL = 3;
export const QUESTIONNAIRE_V4_NUTRITION_LIKERT = 13;
export const QUESTIONNAIRE_V4_NUTRITION_CONTEXTUAL = 4;
