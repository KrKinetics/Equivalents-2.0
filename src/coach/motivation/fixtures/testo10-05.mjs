/**
 * Deterministic golden fixture reproducing testo10-05 style answers.
 */
export const TESTO1005_CLIENT = "testo10-05";
export const TESTO1005_LIKERT = {
    MOT_AUTO_01: 2,
    MOT_RES_01: 4,
    EFF_01: 2,
    EFF_02: 2,
    CONS_01: 2,
    RIG_01: 4,
    RIG_03: 3,
    EFFORT_02: 4,
    LT_03: 2,
    STRUCT_03: 3,
    EXPL_01: 4,
    CHOICE_01: 2,
    CHOICE_03: 4,
    COACH_01: 5,
    NUT_ROLE_01: 2,
    NUT_PERF_01: 3,
    NUT_PLAN_02: 4,
    NUT_PLAN_03: 2,
    NUT_FLEX_01: 4,
    NUT_COMP_01: 2,
    NUT_COMP_03: 2,
    NUT_EMO_01: 4,
    NUT_EMO_02: 3,
    NUT_STRUCT_01: 2,
    NUT_STRUCT_03: 2,
    NUT_SIGNAL_01: 3,
    NUT_SIGNAL_03: 3,
};
export const TESTO1005_TEXT = {
    GOAL_01: "être en santé",
    GOAL_02: "blood work",
    OBS_01: "la drogue",
    NUT_GOAL_01: "qualité",
    NUT_CONTEXT_01: "budget limité",
};
export const TESTO1005_MULTI = {
    NUT_OBS_01: [
        "Budget",
        "Difficulté avec les portions",
        "Repas sociaux ou familiaux",
    ],
};
export const TESTO1005_EXPECTED_ADAPTIVE_MAX = 4;
export const TESTO1005_PREFERRED_ADAPTIVE = [
    "RIG_02",
    "EFF_03",
    "CONS_02",
    "NUT_PLAN_01",
    "NUT_STRUCT_02",
    "NUT_COMP_02",
];
