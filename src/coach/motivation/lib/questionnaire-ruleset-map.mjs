/**
 * Explicit questionnaire → ruleset pairing.
 * Prevents historical assessments from silently attaching the newest ruleset
 * except for the intentional questionnaire-v3 → ruleset-v3.1 default for new processing.
 */
export const QUESTIONNAIRE_TO_RULESET = {
    "questionnaire-v1": "ruleset-v1",
    "questionnaire-v2": "ruleset-v2",
    /** New questionnaire-v3 completions use analysis ruleset-v3.1 by default. */
    "questionnaire-v3": "ruleset-v3.1",
    "questionnaire-v3.2": "ruleset-v3.2",
    "questionnaire-v3.3": "ruleset-v3.3",
    "questionnaire-v4": "ruleset-v4",
    "questionnaire-v4.1": "ruleset-v4.1",
    "questionnaire-v4.2": "ruleset-v4.2",
};
export const RULESET_DB_IDS = {
    "ruleset-v1": "rset_v1",
    "ruleset-v2": "rset_v2",
    "ruleset-v3": "rset_v3",
    "ruleset-v3.1": "rset_v3_1",
    "ruleset-v3.2": "rset_v3_2",
    "ruleset-v3.3": "rset_v3_3",
    "ruleset-v4": "rset_v4",
    "ruleset-v4.1": "rset_v4_1",
    "ruleset-v4.2": "rset_v4_2",
};
export function rulesetVersionForQuestionnaire(questionnaireVersion) {
    return QUESTIONNAIRE_TO_RULESET[questionnaireVersion] ?? "ruleset-v1";
}
export function isQuestionnaireV3(questionnaireVersion) {
    return questionnaireVersion === "questionnaire-v3";
}
export function isQuestionnaireV32(questionnaireVersion) {
    return questionnaireVersion === "questionnaire-v3.2";
}
export function isQuestionnaireV33(questionnaireVersion) {
    return questionnaireVersion === "questionnaire-v3.3";
}
export function isQuestionnaireV4(questionnaireVersion) {
    return questionnaireVersion === "questionnaire-v4";
}
export function isQuestionnaireV41(questionnaireVersion) {
    return questionnaireVersion === "questionnaire-v4.1";
}
export function isQuestionnaireV42(questionnaireVersion) {
    return questionnaireVersion === "questionnaire-v4.2";
}
export function isReportModelV3Family(reportModelOrSchemaVersion) {
    if (!reportModelOrSchemaVersion)
        return false;
    return (reportModelOrSchemaVersion === "v3" ||
        reportModelOrSchemaVersion === "v3.1" ||
        reportModelOrSchemaVersion === "v3.2" ||
        reportModelOrSchemaVersion === "v3.3" ||
        reportModelOrSchemaVersion === "v4" ||
        reportModelOrSchemaVersion === "v4.1" ||
        reportModelOrSchemaVersion === "report-model-v3" ||
        reportModelOrSchemaVersion === "report-model-v3.1" ||
        reportModelOrSchemaVersion === "report-model-v3.2" ||
        reportModelOrSchemaVersion === "report-model-v3.3" ||
        reportModelOrSchemaVersion === "report-model-v4" ||
        reportModelOrSchemaVersion === "report-model-v4.1");
}
export function isReportModelV31(reportModelOrSchemaVersion) {
    if (!reportModelOrSchemaVersion)
        return false;
    return (reportModelOrSchemaVersion === "v3.1" ||
        reportModelOrSchemaVersion === "report-model-v3.1");
}
export function isReportModelV32(reportModelOrSchemaVersion) {
    return reportModelOrSchemaVersion === "v3.2" ||
        reportModelOrSchemaVersion === "report-model-v3.2";
}
export function isReportModelV33(reportModelOrSchemaVersion) {
    return (reportModelOrSchemaVersion === "v3.3" ||
        reportModelOrSchemaVersion === "report-model-v3.3");
}
export function isReportModelV4(reportModelOrSchemaVersion) {
    return (reportModelOrSchemaVersion === "v4" ||
        reportModelOrSchemaVersion === "report-model-v4");
}
export function isReportModelV41(reportModelOrSchemaVersion) {
    return (reportModelOrSchemaVersion === "v4.1" ||
        reportModelOrSchemaVersion === "report-model-v4.1");
}
export function isReportModelV3Only(reportModelOrSchemaVersion) {
    if (!reportModelOrSchemaVersion)
        return false;
    return (reportModelOrSchemaVersion === "v3" ||
        reportModelOrSchemaVersion === "report-model-v3");
}
