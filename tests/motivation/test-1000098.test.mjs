import { describe, expect, it } from "./expect-shim.mjs";
import { TEST1000098_TEXT, TEST1000098_MULTI } from "../../src/coach/motivation/fixtures/test-1000098.mjs";
import { assessOpenAnswerStatus, normalizeDisplayValue, normalizeOpenAnswerText, } from "../../src/coach/motivation/report/v42/open-answers.mjs";
import { mergeNormalizedObstacles } from "../../src/coach/motivation/report/v42/obstacles.mjs";
describe("TEST1000098 golden semantics", () => {
    it("preserves wellbeing, consistency and meal-plan meanings", () => {
        expect(assessOpenAnswerStatus(TEST1000098_TEXT.GOAL_01)).toBe("wellbeing_goal_needs_definition");
        expect(assessOpenAnswerStatus(TEST1000098_TEXT.GOAL_02)).toBe("wellbeing_success_indicator_needs_definition");
        expect(assessOpenAnswerStatus(TEST1000098_TEXT.NUT_GOAL_01)).toBe("consistency_behavior_goal_needs_definition");
        expect(normalizeOpenAnswerText(TEST1000098_TEXT.OBS_01).semanticCategory).toBe("meal_plan");
        expect(normalizeDisplayValue("LE BIEN ETRE").displayValue).toBe("Le bien-être");
        expect(normalizeDisplayValue("MEAL PLAN").displayValue).toBe("Plan alimentaire");
    });
    it("does not infer an unselected variable schedule", () => {
        const obstacles = mergeNormalizedObstacles(TEST1000098_MULTI.NUT_OBS_01.map((raw) => ({
            raw,
            normalized: normalizeOpenAnswerText(raw),
        })));
        expect(obstacles.map((item) => item.canonicalId)).toEqual([
            "food_planning", "cravings", "consistency",
        ]);
        expect(JSON.stringify(obstacles)).not.toMatch(/horaire variable/i);
    });
});
