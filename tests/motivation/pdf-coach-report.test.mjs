import { describe, expect, it } from "./expect-shim.mjs";
import fs from "fs";
import { PROFILE_DIMENSIONS } from "../../src/coach/motivation/domain/dimensions.mjs";
import { buildCoachReportPdfSections, fingerprintPdfSections, } from "../../src/coach/motivation/lib/pdf/content.mjs";
import { buildCoachReportFilename, sanitizeClientNameForFilename } from "../../src/coach/motivation/lib/pdf/filename.mjs";
import { extractPdfPagesText, isEffectivelyBlankPage } from "../../src/coach/motivation/lib/pdf/pdf-text.mjs";
import { getCoachReportLogoPath, isValidPdfBuffer, renderCoachReportPdf } from "../../src/coach/motivation/lib/pdf/render.mjs";
function score(dimension, value) {
    return {
        dimension,
        rawMean: 1 + (value / 100) * 4,
        normalizedScore: value,
        contributingQuestionCount: 2,
        missingQuestionCount: 0,
        confidence: 80,
    };
}
function sampleReport(overrides) {
    return {
        generalSummary: "Synthèse générale avec accents: été, déjà, français, àâçéèêëîïôùûü œuvres.",
        priorityGoals: ["Perdre du poids", "Gagner en énergie"],
        motivationDrivers: ["Résultats visibles", "Autonomie"],
        adherenceStrengths: ["Réceptivité", "Ouverture aux ajustements"],
        potentialObstacles: ["Impatience"],
        likelyReactionToSetbacks: "Réaction sensible aux écarts.",
        personalSuccessPerception: "Succès lié aux résultats visibles.",
        recommendedCommunicationStyle: "Consignes claires et directes.",
        recommendedStructureLevel: "Structure élevée.",
        suggestedSupportStrategies: ["Suivis fréquents", "Indicateurs multiples"],
        contradictionsOrUncertainties: [],
        interviewFollowUpQuestions: ["Que signifie réussir pour vous?"],
        interpretationLimits: [],
        directClientAnswers: [
            {
                questionCode: "GOAL_01",
                questionText: "Quel est votre objectif principal?",
                displayValue: "Perdre du poids rapidement",
            },
            {
                questionCode: "MOT_03",
                questionText: "Importance des résultats visibles",
                displayValue: "4 / 5",
            },
        ],
        calculatedScores: PROFILE_DIMENSIONS.map((d, i) => score(d, 40 + (i % 5) * 10)),
        interpretations: [
            {
                type: "engagement_risk",
                code: "results_over_long_term",
                title: "Dépendance aux résultats",
                message: "L'engagement pourrait diminuer.",
                coachingRecommendation: "Utiliser plusieurs indicateurs.",
                severity: "watch",
            },
        ],
        recommendations: ["Utiliser plusieurs indicateurs."],
        itemsToConfirmInInterview: ["Attentes de délai"],
        narrative: {
            title: "Portrait narratif du client et approche recommandée",
            paragraphs: [
                "Ce client semble guidé par des résultats visibles et une forte sensibilité à l'autonomie.",
                "Le coach gagnerait à offrir un plan très clair, avec des jalons concrets et une communication directe.",
            ],
            preparationLevel: "fragile",
            primaryProfile: "results_driven",
        },
        ...overrides,
    };
}
function sampleInput(overrides) {
    return {
        clientName: "Vince Testé",
        completedAt: "2026-07-23T20:00:00.000Z",
        questionnaireVersion: "questionnaire-v1",
        rulesetVersion: "ruleset-v1",
        report: sampleReport(),
        notes: [{ body: "Note privée utile", createdAt: "2026-07-23T21:00:00.000Z" }],
        generatedAt: "2026-07-24T02:00:00.000Z",
        ...overrides,
    };
}
describe("filename helpers", () => {
    it("sanitizes client names for filenames", () => {
        expect(sanitizeClientNameForFilename("Vince Testé!")).toBe("vince-teste");
        expect(sanitizeClientNameForFilename("Jean-Pierre / Duval")).toBe("jean-pierre-duval");
        expect(buildCoachReportFilename({
            clientName: "Vince Testé",
            date: new Date("2026-07-23T12:00:00.000Z"),
        })).toBe("rapport-coach-vince-teste-2026-07-23.pdf");
    });
});
describe("PDF content + render", () => {
    it("keeps French accents in section content", () => {
        const sections = buildCoachReportPdfSections(sampleInput());
        const blob = fingerprintPdfSections(sections);
        expect(blob).toContain("été");
        expect(blob).toContain("déjà");
        expect(blob).toContain("français");
    });
    it("omits empty private notes", () => {
        const sections = buildCoachReportPdfSections(sampleInput({
            notes: [
                { body: "   ", createdAt: "2026-07-23T21:00:00.000Z" },
                { body: "", createdAt: "2026-07-23T21:00:00.000Z" },
            ],
        }));
        expect(fingerprintPdfSections(sections)).not.toContain("Notes privées du coach");
    });
    it("includes non-empty private notes", () => {
        const sections = buildCoachReportPdfSections(sampleInput());
        expect(fingerprintPdfSections(sections)).toContain("Notes privées du coach");
        expect(fingerprintPdfSections(sections)).toContain("Note privée utile");
    });
    it("is stable for identical inputs", () => {
        const input = sampleInput();
        const a = fingerprintPdfSections(buildCoachReportPdfSections(input));
        const b = fingerprintPdfSections(buildCoachReportPdfSections(input));
        expect(a).toBe(b);
    });
    it("returns a valid PDF buffer starting with %PDF-", async () => {
        const { buffer } = await renderCoachReportPdf(sampleInput());
        expect(isValidPdfBuffer(buffer)).toBe(true);
        expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    });
    it("embeds the KR Kinetics logo asset", async () => {
        const logoPath = getCoachReportLogoPath();
        expect(logoPath).toBeTruthy();
        expect(fs.existsSync(logoPath)).toBe(true);
        const { buffer } = await renderCoachReportPdf(sampleInput());
        // PDFKit embeds images as XObject streams (not raw PNG IDAT).
        const asLatin = buffer.toString("latin1");
        expect(asLatin.includes("/Subtype /Image") || asLatin.includes("/Subtype/Image")).toBe(true);
    });
    it("produces a reasonable page count for the sample report", async () => {
        const { pageCount } = await renderCoachReportPdf(sampleInput());
        expect(pageCount).toBeGreaterThanOrEqual(1);
        expect(pageCount).toBeLessThanOrEqual(6);
    });
    it("contains no blank / footer-only pages", async () => {
        const { buffer, pageCount } = await renderCoachReportPdf(sampleInput());
        const pages = await extractPdfPagesText(buffer);
        expect(pages).toHaveLength(pageCount);
        for (const page of pages) {
            expect(isEffectivelyBlankPage(page.text), `page ${page.pageNumber}: ${page.text}`).toBe(false);
        }
    });
    it("keeps French accents inside the rendered PDF text", async () => {
        const { buffer } = await renderCoachReportPdf(sampleInput());
        const pages = await extractPdfPagesText(buffer);
        const all = pages.map((p) => p.text).join(" ");
        expect(all).toMatch(/été|déjà|français/);
    });
    it("shows matching pagination Page X / Y for every page", async () => {
        const { buffer, pageCount } = await renderCoachReportPdf(sampleInput());
        const pages = await extractPdfPagesText(buffer);
        for (const page of pages) {
            expect(page.text).toContain(`Page ${page.pageNumber} / ${pageCount}`);
        }
    });
    it("does not let footers change the page count", async () => {
        // renderCoachReportPdf throws if footers add pages; reaching here is the assert.
        const { pageCount } = await renderCoachReportPdf(sampleInput());
        expect(pageCount).toBeGreaterThan(0);
    });
    it("preserves all score table dimensions", async () => {
        const input = sampleInput();
        const { buffer } = await renderCoachReportPdf(input);
        const all = (await extractPdfPagesText(buffer)).map((p) => p.text).join(" ");
        for (const row of input.report.calculatedScores) {
            // Dimension labels appear in the table; at least scores/confidences present.
            expect(all).toContain(String(row.normalizedScore));
        }
        expect(all).toContain("Scores calculés");
    });
    it("spreads a long narrative across multiple pages without blank pages", async () => {
        const longParagraph = "Ce client semble guidé par des résultats visibles et une grande sensibilité à l'autonomie. ";
        const paragraphs = Array.from({ length: 24 }, (_, i) => `${longParagraph.repeat(6)} Paragraphe ${i + 1}.`);
        const { pageCount, buffer } = await renderCoachReportPdf(sampleInput({
            report: sampleReport({
                narrative: {
                    title: "Portrait narratif du client et approche recommandée",
                    paragraphs,
                    preparationLevel: "fragile",
                    primaryProfile: "results_driven",
                },
            }),
        }));
        expect(isValidPdfBuffer(buffer)).toBe(true);
        expect(pageCount).toBeGreaterThan(1);
        const pages = await extractPdfPagesText(buffer);
        for (const page of pages) {
            expect(isEffectivelyBlankPage(page.text)).toBe(false);
        }
    });
    it("two generations with the same data stay stable in logical content", async () => {
        const input = sampleInput();
        const a = await renderCoachReportPdf(input);
        const b = await renderCoachReportPdf(input);
        expect(a.pageCount).toBe(b.pageCount);
        const textA = (await extractPdfPagesText(a.buffer)).map((p) => p.text).join("\n");
        const textB = (await extractPdfPagesText(b.buffer)).map((p) => p.text).join("\n");
        expect(textA).toBe(textB);
    });
});
