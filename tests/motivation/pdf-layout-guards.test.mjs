import { describe, expect, it } from "./expect-shim.mjs";
import { NUTRITION_DIMENSIONS, PROFILE_DIMENSIONS } from "../../src/coach/motivation/domain/dimensions.mjs";
import { clearPdfTextTraces, getPdfTextTraces, lastContinuationDividerY, lastContinuationLogoBottom, } from "../../src/coach/motivation/lib/pdf/components/header-footer.mjs";
import { clearContentBlockTraces, getContentBlockTraces, } from "../../src/coach/motivation/lib/pdf/components/layout.mjs";
import { extractPdfPagesText, isEffectivelyBlankPage } from "../../src/coach/motivation/lib/pdf/pdf-text.mjs";
import { renderCoachReportPdf } from "../../src/coach/motivation/lib/pdf/render.mjs";
import { CONTINUATION_HEADER, NARRATIVE_STYLE } from "../../src/coach/motivation/lib/pdf/theme.mjs";
import { sportConfirmationPoints } from "../../src/coach/motivation/report/interview-points.mjs";
function score(dimension, value) {
    return {
        dimension,
        rawMean: 3,
        normalizedScore: value,
        contributingQuestionCount: 2,
        missingQuestionCount: 0,
        confidence: 80,
    };
}
function nutScore(dimension, value) {
    return {
        dimension,
        rawMean: 3,
        normalizedScore: value,
        contributingQuestionCount: 2,
        missingQuestionCount: 0,
        confidence: 75,
    };
}
function sampleReport() {
    return {
        generalSummary: "Synthèse générale du portrait sportif avec assez de texte pour remplir.",
        priorityGoals: ["Objectif sport"],
        motivationDrivers: ["Moteur"],
        adherenceStrengths: ["Force"],
        potentialObstacles: ["Obstacle sport"],
        likelyReactionToSetbacks: "Réaction.",
        personalSuccessPerception: "Succès sport.",
        recommendedCommunicationStyle: "Direct.",
        recommendedStructureLevel: "Élevée.",
        suggestedSupportStrategies: ["Suivi"],
        contradictionsOrUncertainties: [],
        interviewFollowUpQuestions: ["Question?"],
        interpretationLimits: [],
        directClientAnswers: [
            ...Array.from({ length: 8 }).map((_, i) => ({
                questionCode: `Q_${i + 1}`,
                questionText: `Question entraînement numéro ${i + 1}?`,
                displayValue: `${(i % 5) + 1} / 5`,
                domain: "training",
            })),
            ...Array.from({ length: 6 }).map((_, i) => ({
                questionCode: `NUT_${i + 1}`,
                questionText: `Question alimentaire numéro ${i + 1}?`,
                displayValue: i === 0 ? "Non répondu" : `${(i % 5) + 1} / 5`,
                domain: "nutrition",
            })),
        ],
        calculatedScores: PROFILE_DIMENSIONS.map((d) => score(d, 55)),
        interpretations: [],
        recommendations: [],
        itemsToConfirmInInterview: [
            "Confirmer le délai avant de juger les résultats.",
            "Confirmer la définition concrète d'une semaine alimentaire réussie.",
            "Vérifier la réaction après une semaine incomplète.",
        ],
        narrative: {
            title: "Portrait narratif du client et approche recommandée",
            paragraphs: [
                "Paragraphe un du portrait narratif sportif. ".repeat(20),
                "Paragraphe deux du portrait narratif sportif pour forcer plusieurs pages. ".repeat(24),
                "Paragraphe trois court.",
            ],
            preparationLevel: "developing",
            primaryProfile: "results_driven",
        },
        nutrition: {
            summary: "Synthèse alimentaire.",
            scores: NUTRITION_DIMENSIONS.map((d, i) => nutScore(d, 40 + i * 5)),
            narrative: {
                title: "Profil alimentaire et approche recommandée",
                paragraphs: [
                    "Récit alimentaire un.",
                    "Récit alimentaire deux.",
                    "Récit alimentaire trois.",
                ],
            },
            coachingTips: ["Conseil A", "Conseil B"],
            interviewPoints: [
                "Confirmer la définition concrète d'une semaine alimentaire réussie.",
                "Clarifier le niveau de précision vraiment utile (menu vs principes).",
            ],
            goals: ["Mieux manger"],
            obstacles: ["Temps"],
        },
    };
}
describe("PDF layout header band", () => {
    it("keeps every content block below bodyTop and logo below the divider", async () => {
        clearContentBlockTraces();
        clearPdfTextTraces();
        process.env.PDF_TEXT_TRACE = "1";
        const { buffer, pageCount } = await renderCoachReportPdf({
            clientName: "Client Layout",
            completedAt: "2026-07-23T20:00:00.000Z",
            questionnaireVersion: "questionnaire-v2",
            rulesetVersion: "ruleset-v2",
            report: sampleReport(),
            notes: [],
            generatedAt: "2026-07-24T12:00:00.000Z",
        });
        expect(pageCount).toBeGreaterThan(3);
        expect(lastContinuationLogoBottom).toBeLessThanOrEqual(lastContinuationDividerY + 0.5);
        expect(lastContinuationDividerY).toBeLessThanOrEqual(CONTINUATION_HEADER.bodyTop);
        const blocks = getContentBlockTraces();
        expect(blocks.length).toBeGreaterThan(10);
        for (const block of blocks) {
            if (block.page === 1)
                continue;
            expect(block.blockTop + 0.01).toBeGreaterThanOrEqual(block.minimumTop);
            expect(block.minimumTop).toBeGreaterThanOrEqual(CONTINUATION_HEADER.bodyTop - 20);
        }
        const narrative = getPdfTextTraces().filter((t) => t.section === "coach-narrative");
        expect(narrative.length).toBeGreaterThan(5);
        for (const trace of narrative) {
            expect(trace.font).toBe(NARRATIVE_STYLE.font);
            expect(trace.fontSize).toBe(NARRATIVE_STYLE.fontSize);
            expect(trace.lineGap).toBe(NARRATIVE_STYLE.lineGap);
        }
        const pages = await extractPdfPagesText(buffer);
        expect(pages.length).toBe(pageCount);
        for (const page of pages) {
            expect(isEffectivelyBlankPage(page.text)).toBe(false);
        }
        const all = pages.map((p) => p.text).join(" ");
        expect(all).toContain("Score / 100");
        expect(all).toContain("Couverture");
        expect(all).toContain("Tendance");
        expect(all).toContain("Éléments sportifs à confirmer en entrevue");
        expect(all).toContain("Éléments alimentaires à confirmer en entrevue");
    });
    it("removes nutrition duplicates from sport confirmation points", () => {
        const sport = sportConfirmationPoints(sampleReport());
        expect(sport.some((p) => /alimentaire/i.test(p))).toBe(false);
        expect(sport.some((p) => /résultats|incomplète|délai/i.test(p))).toBe(true);
    });
});
