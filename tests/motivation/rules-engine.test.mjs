import { describe, expect, it } from "./expect-shim.mjs";
import { DEFAULT_CONTRADICTIONS, DEFAULT_RULES, DEFAULT_RULESET_VERSION, } from "../../src/coach/motivation/rules/default-ruleset.mjs";
import { evaluateCondition, evaluateRuleset } from "../../src/coach/motivation/rules/engine.mjs";
describe("rules engine", () => {
    it("fires results-over-long-term insight", () => {
        const result = evaluateRuleset({
            rules: DEFAULT_RULES,
            contradictions: [],
            scores: {
                results_driven_motivation: 80,
                long_term_orientation: 30,
            },
            rulesetVersion: DEFAULT_RULESET_VERSION,
        });
        expect(result.insights.some((i) => i.code === "results_over_long_term")).toBe(true);
    });
    it("fires structured collaborative style", () => {
        const result = evaluateRuleset({
            rules: DEFAULT_RULES,
            contradictions: [],
            scores: {
                structure_need: 75,
                autonomy_need: 70,
            },
            rulesetVersion: DEFAULT_RULESET_VERSION,
        });
        expect(result.insights.some((i) => i.code === "structured_collaborative")).toBe(true);
    });
    it("fires all-or-nothing adherence risk", () => {
        const result = evaluateRuleset({
            rules: DEFAULT_RULES,
            contradictions: [],
            scores: {
                rigidity_perfectionism: 70,
                behavioral_consistency: 30,
            },
            rulesetVersion: DEFAULT_RULESET_VERSION,
        });
        expect(result.insights.some((i) => i.code === "all_or_nothing_risk")).toBe(true);
    });
    it("detects autonomy vs structure contradiction without accusatory language", () => {
        const result = evaluateRuleset({
            rules: [],
            contradictions: DEFAULT_CONTRADICTIONS,
            scores: {
                autonomy_need: 80,
                structure_need: 80,
            },
            rulesetVersion: DEFAULT_RULESET_VERSION,
        });
        const flag = result.contradictions.find((c) => c.code === "autonomy_vs_structure");
        expect(flag).toBeTruthy();
        expect(flag?.message.toLowerCase()).toContain("entrevue");
        expect(flag?.message.toLowerCase()).not.toContain("mentir");
    });
    it("evaluateCondition supports between", () => {
        expect(evaluateCondition({
            dimension: "self_efficacy",
            operator: "between",
            value: 40,
            valueTo: 60,
        }, { self_efficacy: 50 })).toBe(true);
    });
});
