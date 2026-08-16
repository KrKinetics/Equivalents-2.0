export function assertEvidenceBelongsToAssessment(assessmentId, evidence) {
    if (evidence.some((reference) => reference.assessmentId !== assessmentId)) {
        throw new Error("REPORT_EVIDENCE_ASSESSMENT_MISMATCH");
    }
}
export function attachEvidence(assessmentId, item, evidence) {
    const references = evidence.map((reference) => ({ ...reference, assessmentId }));
    assertEvidenceBelongsToAssessment(assessmentId, references);
    return { ...item, evidence: references };
}
export const attachPriorityEvidence = attachEvidence;
export const attachObstacleEvidence = attachEvidence;
export const attachQuestionEvidence = attachEvidence;
