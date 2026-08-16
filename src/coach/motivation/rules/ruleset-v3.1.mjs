import { CONTRADICTIONS_V3, RULES_V3 } from "./ruleset-v3.mjs";
/** Analysis rules for report-model-v3.1 — does not mutate ruleset-v3 content. */
export const RULESET_V31_VERSION = "ruleset-v3.1";
export const RULESET_V31_THRESHOLDS = {
    spreadTwoItemMixed: 25,
    spreadTwoItemDivergent: 50,
    directionLowMax: 37.5,
    directionHighMin: 62.5,
    dominantMinScore: 65,
    dominantMinDifference: 15,
    highScore: 65,
    lowScore: 40,
};
/** Same cross-dimension rule definitions as v3; interpretation layer is v3.1-specific. */
export const RULES_V31 = RULES_V3;
export const CONTRADICTIONS_V31 = CONTRADICTIONS_V3;
