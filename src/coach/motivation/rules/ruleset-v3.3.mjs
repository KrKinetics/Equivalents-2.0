import { CONTRADICTIONS_V32, RULES_V32 } from "./ruleset-v3.2.mjs";
/** Analysis rules for report-model-v3.3 — does not mutate ruleset-v3.2. */
export const RULESET_V33_VERSION = "ruleset-v3.3";
export const RULESET_V33_THRESHOLDS = {
    adaptiveSpreadMin: 50,
    directionLowMax: 25,
    directionHighMin: 75,
    dominantMinScore: 65,
    highScore: 65,
    lowScore: 40,
};
export const RULES_V33 = RULES_V32;
export const CONTRADICTIONS_V33 = CONTRADICTIONS_V32;
