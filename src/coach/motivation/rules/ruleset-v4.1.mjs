import { CONTRADICTIONS_V4, RULES_V4 } from "./ruleset-v4.mjs";
/** Analysis rules for report-model-v4.1 — does not mutate ruleset-v4 content. */
export const RULESET_V41_VERSION = "ruleset-v4.1";
export const RULESET_V41_THRESHOLDS = {
    adaptiveMax: 4,
    directionLowMax: 25,
    directionHighMin: 75,
    highScore: 65,
    lowScore: 40,
};
export const RULES_V41 = RULES_V4;
export const CONTRADICTIONS_V41 = CONTRADICTIONS_V4;
