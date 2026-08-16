export const TEST1000098_CLIENT = "TEST1000098";
export const TEST1000098_TOKEN = "PROFILE_A_WELLBEING";
export const TEST1000098_LIKERT = {
    MOT_RES_01: 5, EFF_01: 1, EFF_02: 1, CONS_01: 4, RIG_01: 5,
    EFFORT_02: 1, LT_03: 1, STRUCT_03: 5, EXPL_01: 1, CHOICE_01: 1,
    CHOICE_03: 5, COACH_01: 1, NUT_ROLE_01: 1, NUT_PERF_01: 1,
    NUT_PLAN_02: 5, NUT_PLAN_03: 5, NUT_FLEX_01: 5, NUT_COMP_01: 4,
    NUT_COMP_03: 4, NUT_EMO_01: 5, NUT_EMO_02: 1, NUT_STRUCT_01: 3,
    NUT_STRUCT_03: 3, NUT_SIGNAL_01: 3, NUT_SIGNAL_03: 3,
};
export const TEST1000098_TEXT = {
    GOAL_01: "LE BIEN ETRE",
    GOAL_02: "ETRE BIEN",
    NUT_GOAL_01: "LA CONSTANCE",
    OBS_01: "MEAL PLAN",
    NUT_CONTEXT_01: "NON",
};
export const TEST1000098_MULTI = {
    NUT_OBS_01: ["Manque de planification", "Envies fréquentes", "Manque de constance"],
};
export const TEST1000098_PREFERENCE_MATCH = /menu\s+pr[eé]cis.*quantit[eé]/i;
/** Adaptive bank answers — keep planning coherent/high for the cross-source conflict. */
export const TEST1000098_ADAPTIVE_VALUES = {
    NUT_PLAN_01: 5,
    CHOICE_02: 1,
    EXPL_02: 1,
    LT_01: 1,
    RIG_02: 5,
    EFF_03: 1,
    CONS_02: 4,
    NUT_STRUCT_02: 2,
    NUT_SIGNAL_02: 2,
    NUT_COMP_02: 2,
};
