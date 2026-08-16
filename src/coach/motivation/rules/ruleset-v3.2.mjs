import { CONTRADICTIONS_V31, RULES_V31 } from "./ruleset-v3.1.mjs";
/** Analysis rules for report-model-v3.2 — does not mutate ruleset-v3.1. */
export const RULESET_V32_VERSION = "ruleset-v3.2";
export const RULESET_V32_THRESHOLDS = {
    /** Zone-based agreement; spread still used for adaptive triggers. */
    adaptiveSpreadMin: 50,
    directionLowMax: 40,
    directionHighMin: 60,
    dominantMinScore: 65,
    highScore: 65,
    lowScore: 40,
};
export const RULES_V32 = RULES_V31;
export const CONTRADICTIONS_V32 = CONTRADICTIONS_V31;
