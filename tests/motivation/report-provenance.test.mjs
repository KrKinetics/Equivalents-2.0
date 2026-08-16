import { describe, expect, it } from "./expect-shim.mjs";
import { assertEvidenceBelongsToAssessment, attachPriorityEvidence } from "../../src/coach/motivation/report/v42/provenance.mjs";
describe("report v4.2 provenance", () => {
    it("attaches assessment-scoped evidence", () => {
        const item = attachPriorityEvidence("assessment_a", { label: "Priority" }, [
            { sourceType: "answer", sourceId: "answer_1", questionCode: "GOAL_01" },
        ]);
        expect(item.evidence[0]?.assessmentId).toBe("assessment_a");
    });
    it("rejects evidence from another assessment", () => {
        expect(() => assertEvidenceBelongsToAssessment("assessment_a", [
            { assessmentId: "assessment_b", sourceType: "answer", sourceId: "answer_1" },
        ])).toThrow("REPORT_EVIDENCE_ASSESSMENT_MISMATCH");
    });
});
