import { isValidPdfBuffer, renderCoachReportPdfV31, } from "./render-v31.mjs";
export { isValidPdfBuffer };
export async function renderCoachReportPdfV41(input) {
    return renderCoachReportPdfV31({
        viewModel: input.viewModel,
        format: input.format,
        includeDirectAnswers: input.includeDirectAnswers,
        generatedAt: input.generatedAt,
    });
}
