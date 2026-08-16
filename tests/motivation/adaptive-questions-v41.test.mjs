import { describe, expect, it } from "./expect-shim.mjs";
import { TESTO1005_EXPECTED_ADAPTIVE_MAX, TESTO1005_LIKERT, TESTO1005_PREFERRED_ADAPTIVE, } from "../../src/coach/motivation/fixtures/testo10-05.mjs";
import { assertAdaptiveSelectionValid, evaluateAdaptiveCandidates, MAX_ADAPTIVE_QUESTIONS, selectAdaptiveQuestionsV41, } from "../../src/coach/motivation/lib/adaptive-questions-v41.mjs";
import { V41_ADAPTIVE_BANK_CODES } from "../../src/coach/motivation/questionnaire/adaptive-bank-v41.mjs";
import { interpretDomain, V41_DOMAIN_DEFINITIONS, } from "../../src/coach/motivation/scoring/domain-interpretation-v41.mjs";
function makeQuestions() {
    const codes = [
        ...Object.keys(TESTO1005_LIKERT),
        ...V41_ADAPTIVE_BANK_CODES,
    ];
    return codes.map((code, i) => {
        const adaptive = V41_ADAPTIVE_BANK_CODES.includes(code);
        return {
            id: `q_${code}`,
            code,
            text: code,
            type: "likert",
            required: !adaptive,
            active: true,
            order: i + 1,
            section: adaptive ? "Quelques précisions rapides" : "t",
            likertMin: 1,
            likertMax: 5,
            scoringDirection: code === "EFFORT_02" ? "negative" : "positive",
            interpretationTags: adaptive ? ["adaptive_bank"] : [],
            primaryDimension: "self_efficacy",
        };
    });
}
function baseAnswers(questions) {
    return questions
        .filter((q) => !q.interpretationTags?.includes("adaptive_bank"))
        .map((q) => ({
        questionId: q.id,
        numericValue: TESTO1005_LIKERT[q.code] ?? 3,
    }));
}
describe("adaptive engine v4.1", () => {
    it("never selects more than 4 questions", () => {
        const questions = makeQuestions();
        const answers = baseAnswers(questions);
        const selected = selectAdaptiveQuestionsV41({ questions, answers });
        expect(selected.length).toBeLessThanOrEqual(MAX_ADAPTIVE_QUESTIONS);
        expect(selected.length).toBeLessThanOrEqual(TESTO1005_EXPECTED_ADAPTIVE_MAX);
        assertAdaptiveSelectionValid(selected.map((q) => q.code));
    });
    it("never selects the full 19-question bank for testo10-05", () => {
        const questions = makeQuestions();
        const answers = baseAnswers(questions);
        const selected = selectAdaptiveQuestionsV41({ questions, answers });
        expect(selected.length).toBeLessThan(19);
        expect(selected.length).toBeLessThanOrEqual(4);
    });
    it("is deterministic", () => {
        const questions = makeQuestions();
        const answers = baseAnswers(questions);
        const a = selectAdaptiveQuestionsV41({ questions, answers }).map((q) => q.code);
        const b = selectAdaptiveQuestionsV41({ questions, answers }).map((q) => q.code);
        expect(a).toEqual(b);
    });
    it("selects at most one question per domain family", () => {
        const questions = makeQuestions();
        const answers = baseAnswers(questions);
        const selected = selectAdaptiveQuestionsV41({ questions, answers });
        const domains = selected.map((q) => {
            const c = evaluateAdaptiveCandidates({ questions, answers }).find((e) => e.questionCode === q.code);
            return c?.domainId.startsWith("adherence") ? "adherence_family" : c?.domainId;
        });
        expect(new Set(domains).size).toBe(domains.length);
    });
    it("rejects candidates without decision impact", () => {
        const questions = makeQuestions();
        const answers = baseAnswers(questions);
        const evaluations = evaluateAdaptiveCandidates({ questions, answers });
        for (const e of evaluations.filter((x) => x.decisionImpact === "none")) {
            expect(e.selected).toBe(false);
            expect(e.rejectionReason).toBeTruthy();
        }
        const impactful = evaluations.filter((e) => e.decisionImpact !== "none");
        expect(impactful.length).toBeGreaterThan(0);
        expect(impactful.length).toBeLessThan(evaluations.length);
    });
    it("prefers high-impact codes comparable to expected set", () => {
        const questions = makeQuestions();
        const answers = baseAnswers(questions);
        const selected = selectAdaptiveQuestionsV41({ questions, answers }).map((q) => q.code);
        expect(selected.length).toBeGreaterThan(0);
        expect(selected.length).toBeLessThanOrEqual(4);
        expect(selected).toContain("RIG_02");
        const preferredHit = selected.filter((c) => TESTO1005_PREFERRED_ADAPTIVE.includes(c));
        expect(preferredHit.length).toBeGreaterThanOrEqual(1);
    });
    it("server assert rejects a fifth adaptive code", () => {
        expect(() => assertAdaptiveSelectionValid(["RIG_02", "EFF_03", "NUT_PLAN_01", "CHOICE_02", "LT_01"])).toThrow(/Too many adaptive/);
    });
});
describe("CHOICE_03 overload risk", () => {
    it("CHOICE_03 = 4 → high overload risk", () => {
        const def = V41_DOMAIN_DEFINITIONS.find((d) => d.domainId === "option_overload");
        const q = {
            id: "q_choice03",
            code: "CHOICE_03",
            text: "overload",
            type: "likert",
            required: true,
            active: true,
            order: 1,
            section: "t",
            likertMin: 1,
            likertMax: 5,
            scoringDirection: "negative", // historical seed direction — domain uses raw
            interpretationTags: [],
            primaryDimension: "choice_need",
        };
        const domain = interpretDomain({
            definition: def,
            questions: [q],
            answers: [{ questionId: q.id, numericValue: 4 }],
        });
        expect(domain.level).toBe("high");
        expect(domain.trendDisplay).toBe("high");
        expect(domain.evidenceStrength).toBe("limited");
    });
});
describe("long-term projection LT_03=2 LT_01=2", () => {
    it("is low and consistent", () => {
        const def = V41_DOMAIN_DEFINITIONS.find((d) => d.domainId === "long_term_projection");
        const qs = [
            {
                id: "q_lt03",
                code: "LT_03",
                text: "lt3",
                type: "likert",
                required: true,
                active: true,
                order: 1,
                section: "t",
                likertMin: 1,
                likertMax: 5,
                scoringDirection: "positive",
                interpretationTags: [],
                primaryDimension: "long_term_orientation",
            },
            {
                id: "q_lt01",
                code: "LT_01",
                text: "lt1",
                type: "likert",
                required: false,
                active: true,
                order: 2,
                section: "t",
                likertMin: 1,
                likertMax: 5,
                scoringDirection: "positive",
                interpretationTags: ["adaptive_bank"],
                primaryDimension: "long_term_orientation",
            },
        ];
        const domain = interpretDomain({
            definition: def,
            questions: qs,
            answers: [
                { questionId: "q_lt03", numericValue: 2 },
                { questionId: "q_lt01", numericValue: 2 },
            ],
        });
        expect(domain.level).toBe("low");
        expect(domain.agreement).toBe("consistent");
        expect(domain.trendDisplay).toBe("low");
        expect(["moderate", "reinforced"]).toContain(domain.evidenceStrength);
    });
});
