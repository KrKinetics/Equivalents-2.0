import { describe, expect, it } from "./expect-shim.mjs";
import { calculateDimensionScores } from "../../src/coach/motivation/scoring/engine.mjs";
import { normalizeLikertMean } from "../../src/coach/motivation/scoring/normalize.mjs";
function q(partial) {
    return {
        code: partial.id,
        text: partial.id,
        type: "likert",
        required: true,
        order: 1,
        section: "test",
        scoringDirection: "positive",
        weight: 1,
        active: true,
        likertMin: 1,
        likertMax: 5,
        ...partial,
    };
}
describe("normalizeLikertMean", () => {
    it("maps 1→0, 3→50, 5→100", () => {
        expect(normalizeLikertMean(1)).toBe(0);
        expect(normalizeLikertMean(3)).toBe(50);
        expect(normalizeLikertMean(5)).toBe(100);
    });
});
describe("calculateDimensionScores", () => {
    it("aggregates weighted likert answers deterministically", () => {
        const questions = [
            q({ id: "a", primaryDimension: "self_efficacy", weight: 1 }),
            q({ id: "b", primaryDimension: "self_efficacy", weight: 1 }),
        ];
        const answers = [
            { questionId: "a", numericValue: 5 },
            { questionId: "b", numericValue: 1 },
        ];
        const result = calculateDimensionScores(questions, answers);
        const dim = result.dimensions.find((d) => d.dimension === "self_efficacy");
        expect(dim?.normalizedScore).toBe(50);
        expect(dim?.contributingQuestionCount).toBe(2);
    });
    it("inverts negative scoring direction", () => {
        const questions = [
            q({
                id: "n",
                primaryDimension: "effort_tolerance",
                scoringDirection: "negative",
            }),
        ];
        const answers = [{ questionId: "n", numericValue: 5 }];
        const result = calculateDimensionScores(questions, answers);
        const dim = result.dimensions.find((d) => d.dimension === "effort_tolerance");
        expect(dim?.normalizedScore).toBe(0);
    });
    it("detects missing required answers", () => {
        const questions = [
            q({ id: "a", primaryDimension: "structure_need" }),
            q({ id: "b", primaryDimension: "structure_need" }),
        ];
        const answers = [{ questionId: "a", numericValue: 4 }];
        const result = calculateDimensionScores(questions, answers);
        expect(result.missingRequiredQuestionIds).toContain("b");
        const dim = result.dimensions.find((d) => d.dimension === "structure_need");
        expect(dim?.missingQuestionCount).toBe(1);
    });
    it("does not let a single answer alone define all dimensions", () => {
        const questions = [
            q({ id: "only", primaryDimension: "autonomous_motivation" }),
        ];
        const answers = [{ questionId: "only", numericValue: 5 }];
        const result = calculateDimensionScores(questions, answers);
        const others = result.dimensions.filter((d) => d.dimension !== "autonomous_motivation");
        expect(others.every((d) => d.normalizedScore === null)).toBe(true);
    });
});
