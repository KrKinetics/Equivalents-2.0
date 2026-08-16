import { CONTRADICTIONS_V33, RULES_V33 } from "./ruleset-v3.3.mjs";
/** Analysis rules for report-model-v4 — does not mutate historical rulesets. */
export const RULESET_V4_VERSION = "ruleset-v4";
export const RULESET_V4_THRESHOLDS = {
    adaptiveMax: 4,
    directionLowMax: 25,
    directionHighMin: 75,
    highScore: 65,
    lowScore: 40,
};
export const RULES_V4 = RULES_V33;
export const CONTRADICTIONS_V4 = CONTRADICTIONS_V33;
