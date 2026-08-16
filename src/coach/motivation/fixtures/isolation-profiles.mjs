/**
 * Synthetic profiles used to test that assembleCoachReportSnapshotV42 never
 * leaks state across calls (sequential re-entry or concurrent Promise.all).
 *
 * Each profile carries a unique token embedded directly in identifying
 * fields (clientId/clientName) plus genuinely distinct thematic answers, so
 * cross-contamination — whether from shared mutable module state or from
 * accidentally reusing another call's arrays/objects — is detectable by
 * simply searching the serialized snapshot for another profile's token or
 * theme words.
 */
export const PROFILE_A_TOKEN = "PROFILE_A_WELLBEING";
export const PROFILE_B_TOKEN = "PROFILE_B_STRENGTH";
export const PROFILE_C_TOKEN = "PROFILE_C_FUN";
const BASE_LIKERT = {
    MOT_RES_01: 3,
    EFF_01: 3,
    EFF_02: 3,
    CONS_01: 3,
    RIG_01: 3,
    EFFORT_02: 3,
    LT_03: 3,
    NUT_ROLE_01: 3,
    NUT_PLAN_02: 3,
    NUT_PLAN_03: 3,
    NUT_FLEX_01: 3,
    NUT_COMP_01: 3,
    NUT_EMO_01: 3,
};
/**
 * Profile A — wellbeing theme: meal plan, planning obstacle,
 * precise-menu preference. High choice interest + low overload +
 * high structure need → "autonomie encadrée".
 */
export const PROFILE_A = {
    token: PROFILE_A_TOKEN,
    clientId: `cli_${PROFILE_A_TOKEN}`,
    clientName: PROFILE_A_TOKEN,
    likert: {
        ...BASE_LIKERT,
        CHOICE_01: 5,
        CHOICE_03: 1,
        STRUCT_03: 5,
        EXPL_01: 5,
        COACH_01: 1,
        NUT_PERF_01: 5,
        NUT_SIGNAL_01: 4,
        NUT_SIGNAL_03: 4,
        NUT_STRUCT_01: 4,
        NUT_STRUCT_03: 4,
    },
    text: {
        GOAL_01: "le bien etre",
        GOAL_02: "etre bien",
        OBS_01: "meal plan",
        NUT_GOAL_01: "la constance",
        NUT_PREF_01: "Un menu précis avec des quantités",
    },
    multi: {
        NUT_OBS_01: ["Manque de planification"],
    },
};
/**
 * Profile B — strength theme: strength goal, budget obstacle,
 * visual-cues preference.
 */
export const PROFILE_B = {
    token: PROFILE_B_TOKEN,
    clientId: `cli_${PROFILE_B_TOKEN}`,
    clientName: PROFILE_B_TOKEN,
    likert: {
        ...BASE_LIKERT,
        CHOICE_01: 2,
        CHOICE_03: 4,
        STRUCT_03: 3,
        EXPL_01: 2,
        COACH_01: 3,
        NUT_PERF_01: 3,
        NUT_SIGNAL_01: 3,
        NUT_SIGNAL_03: 3,
        NUT_STRUCT_01: 2,
        NUT_STRUCT_03: 2,
    },
    text: {
        GOAL_01: "devenir fort",
        GOAL_02: "mes charges qui monte",
        OBS_01: "Budget",
        NUT_GOAL_01: "perdre du poids",
        NUT_PREF_01: "Des portions et des repères visuels",
    },
    multi: {
        NUT_OBS_01: ["Budget"],
    },
};
/**
 * Profile C — "plaisir" theme: experience/fun goal, stress obstacle,
 * flexible/liberté preference.
 */
export const PROFILE_C = {
    token: PROFILE_C_TOKEN,
    clientId: `cli_${PROFILE_C_TOKEN}`,
    clientName: PROFILE_C_TOKEN,
    likert: {
        ...BASE_LIKERT,
        CHOICE_01: 4,
        CHOICE_03: 2,
        STRUCT_03: 2,
        EXPL_01: 3,
        COACH_01: 5,
        NUT_PERF_01: 2,
        NUT_SIGNAL_01: 2,
        NUT_SIGNAL_03: 2,
        NUT_STRUCT_01: 1,
        NUT_STRUCT_03: 1,
    },
    text: {
        GOAL_01: "plaisir",
        GOAL_02: "m'amuser pendant mes séances",
        OBS_01: "Horaire de travail variable",
        NUT_GOAL_01: "manger avec plaisir",
        NUT_PREF_01: "Des principes flexibles avec beaucoup de liberté",
    },
    multi: {
        NUT_OBS_01: ["Horaire de travail variable"],
    },
};
export const ISOLATION_PROFILES = [PROFILE_A, PROFILE_B, PROFILE_C];
