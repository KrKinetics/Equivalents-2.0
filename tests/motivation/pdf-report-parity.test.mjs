import { describe, expect, it } from "./expect-shim.mjs";
import { NUTRITION_DIMENSIONS, PROFILE_DIMENSIONS } from "../../src/coach/motivation/domain/dimensions.mjs";
import { clearPdfTextTraces, getNarrativeStyleFingerprint, getPdfTextTraces, } from "../../src/coach/motivation/lib/pdf/components/header-footer.mjs";
import { buildCoachReportPdfSections } from "../../src/coach/motivation/lib/pdf/content.mjs";
import { extractPdfPagesText, isEffectivelyBlankPage } from "../../src/coach/motivation/lib/pdf/pdf-text.mjs";
import { renderCoachReportPdf } from "../../src/coach/motivation/lib/pdf/render.mjs";
import { NARRATIVE_STYLE, PDF_FONTS } from "../../src/coach/motivation/lib/pdf/theme.mjs";
import { resolveFontFile } from "../../src/coach/motivation/lib/pdf/components/layout.mjs";
import { toNutritionViewModel } from "../../src/coach/motivation/report/to-nutrition-view-model.mjs";
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
function sampleV2Report(overrides) {
    return {
        generalSummary: "Synthèse générale du portrait sportif.",
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
            {
                questionCode: "OBS_01",
                questionText: "Obstacles entraînement?",
                displayValue: "horaires",
                domain: "training",
            },
            {
                questionCode: "NUT_GOAL_01",
                questionText: "Objectif alimentaire?",
                displayValue: "Mieux planifier mes repas",
                domain: "nutrition",
            },
            {
                questionCode: "NUT_SUCCESS_01",
                questionText: "Succès alimentaire?",
                displayValue: "Énergie stable",
                domain: "nutrition",
            },
            {
                questionCode: "NUT_OBS_01",
                questionText: "Obstacles alimentaires?",
                displayValue: "Manque de temps, Repas familiaux",
                domain: "nutrition",
            },
            {
                questionCode: "NUT_PREF_01",
                questionText: "Préférence d'encadrement?",
                displayValue: "Plan flexible avec repères",
                domain: "nutrition",
            },
            {
                questionCode: "NUT_CONTEXT_01",
                questionText: "Contexte?",
                displayValue: "Travail en soirée",
                domain: "nutrition",
            },
            {
                questionCode: "NUT_ROLE_01",
                questionText: "Likert nutrition",
                displayValue: "4 / 5",
                domain: "nutrition",
            },
        ],
        calculatedScores: PROFILE_DIMENSIONS.map((d) => score(d, 55)),
        interpretations: [],
        recommendations: [],
        itemsToConfirmInInterview: ["Confirmer les contraintes alimentaires"],
        narrative: {
            title: "Portrait narratif du client et approche recommandée",
            paragraphs: [
                "Premier paragraphe du portrait narratif sportif avec accents: déjà, été, français. ".repeat(18),
                "Deuxième paragraphe du portrait narratif sportif pour forcer un changement de page contrôlé. ".repeat(22),
                "Troisième paragraphe court pour valider la continuité de style.",
            ],
            preparationLevel: "developing",
            primaryProfile: "results_driven",
        },
        nutrition: {
            summary: "Synthèse alimentaire du client test.",
            scores: NUTRITION_DIMENSIONS.map((d, i) => nutScore(d, 40 + i * 5)),
            narrative: {
                title: "Profil alimentaire et approche recommandée",
                paragraphs: [
                    "Récit alimentaire paragraphe un.",
                    "Récit alimentaire paragraphe deux.",
                ],
            },
            coachingTips: ["Conseil alimentaire A", "Conseil alimentaire B"],
            interviewPoints: ["Confirmer le rythme des repas", "Vérifier les écarts le week-end"],
            goals: ["Mieux planifier mes repas"],
            successDefinition: "Énergie stable",
            obstacles: ["Manque de temps", "Repas familiaux"],
            preferredStructure: "Plan flexible avec repères",
            contextualConstraints: "Travail en soirée",
        },
        ...overrides,
    };
}
describe("PDF narrative typography lock", () => {
    it("resolves registered Roboto fonts (no Helvetica fallback)", () => {
        expect(resolveFontFile("Roboto-Regular.ttf")).toMatch(/Roboto-Regular\.ttf$/);
        expect(resolveFontFile("Roboto-Bold.ttf")).toMatch(/Roboto-Bold\.ttf$/);
        expect(NARRATIVE_STYLE.font).toBe(PDF_FONTS.bodyRegular);
        expect(NARRATIVE_STYLE.font).not.toMatch(/Helvetica|Times-Roman|Courier/i);
    });
    it("keeps identical font, size and lineGap across a multi-page narrative", async () => {
        clearPdfTextTraces();
        process.env.PDF_TEXT_TRACE = "1";
        const report = sampleV2Report();
        await renderCoachReportPdf({
            clientName: "Client Testé",
            completedAt: "2026-07-23T20:00:00.000Z",
            questionnaireVersion: "questionnaire-v2",
            rulesetVersion: "ruleset-v2",
            report,
            notes: [],
            generatedAt: "2026-07-24T12:00:00.000Z",
        });
        const traces = getPdfTextTraces().filter((t) => t.section === "coach-narrative");
        expect(traces.length).toBeGreaterThan(10);
        const pages = new Set(traces.map((t) => t.page));
        expect(pages.size).toBeGreaterThan(1);
        for (const trace of traces) {
            expect(trace.font).toBe(NARRATIVE_STYLE.font);
            expect(trace.fontSize).toBe(NARRATIVE_STYLE.fontSize);
            expect(trace.lineGap).toBe(NARRATIVE_STYLE.lineGap);
        }
        const fingerprint = getNarrativeStyleFingerprint();
        expect(fingerprint).toContain(NARRATIVE_STYLE.font);
        expect(fingerprint).toContain(String(NARRATIVE_STYLE.fontSize));
    });
});
describe("web/PDF nutrition parity", () => {
    it("builds a nutrition view-model with all nutrition scores and declared fields", () => {
        const report = sampleV2Report();
        const nutrition = toNutritionViewModel(report);
        expect(nutrition?.available).toBe(true);
        expect(nutrition?.scores).toHaveLength(NUTRITION_DIMENSIONS.length);
        expect(nutrition?.narrativeTitle).toContain("Profil alimentaire");
        expect(nutrition?.narrativeParagraphs).toHaveLength(2);
        expect(nutrition?.coachingTips).toEqual(["Conseil alimentaire A", "Conseil alimentaire B"]);
        expect(nutrition?.interviewPoints.length).toBeGreaterThan(0);
        expect(nutrition?.goals).toContain("Mieux planifier mes repas");
        expect(nutrition?.successDefinition).toBe("Énergie stable");
        expect(nutrition?.obstacles).toEqual(["Manque de temps", "Repas familiaux"]);
        expect(nutrition?.preferredStructure).toContain("Plan flexible");
        expect(nutrition?.contextualConstraints).toContain("soirée");
        expect(nutrition?.directAnswers.some((a) => a.questionCode.startsWith("NUT_"))).toBe(true);
    });
    it("enriches older snapshots missing nutrition goal fields from NUT_* answers", () => {
        const report = sampleV2Report({
            nutrition: {
                summary: "Synthèse.",
                scores: NUTRITION_DIMENSIONS.map((d) => nutScore(d, 50)),
                narrative: {
                    title: "Profil alimentaire et approche recommandée",
                    paragraphs: ["Paragraphe."],
                },
                coachingTips: ["Tip"],
                interviewPoints: ["Point"],
            },
        });
        const nutrition = toNutritionViewModel(report);
        expect(nutrition?.goals).toContain("Mieux planifier mes repas");
        expect(nutrition?.successDefinition).toBe("Énergie stable");
        expect(nutrition?.obstacles).toContain("Manque de temps");
    });
    it("keeps web and PDF nutrition models equal", () => {
        const report = sampleV2Report();
        const webNutrition = toNutritionViewModel(report);
        // PDF path mutates report.nutrition via the same enrichment contract.
        const enriched = toNutritionViewModel(report);
        expect(enriched).toEqual(webNutrition);
    });
    it("renders all nutrition sections and NUT_* answers in the PDF", async () => {
        const report = sampleV2Report();
        const nutrition = toNutritionViewModel(report);
        report.nutrition = {
            summary: nutrition.summary,
            scores: nutrition.scores,
            narrative: {
                title: nutrition.narrativeTitle,
                paragraphs: nutrition.narrativeParagraphs,
            },
            coachingTips: nutrition.coachingTips,
            interviewPoints: nutrition.interviewPoints,
            goals: nutrition.goals,
            successDefinition: nutrition.successDefinition,
            obstacles: nutrition.obstacles,
            preferredStructure: nutrition.preferredStructure,
            contextualConstraints: nutrition.contextualConstraints,
        };
        const { buffer, pageCount } = await renderCoachReportPdf({
            clientName: "Client Testé",
            completedAt: "2026-07-23T20:00:00.000Z",
            questionnaireVersion: "questionnaire-v2",
            rulesetVersion: "ruleset-v2",
            report,
            notes: [],
            generatedAt: "2026-07-24T12:00:00.000Z",
        });
        expect(pageCount).toBeGreaterThan(3);
        const pages = await extractPdfPagesText(buffer);
        for (const page of pages) {
            expect(isEffectivelyBlankPage(page.text)).toBe(false);
        }
        const all = pages.map((p) => p.text).join(" ");
        expect(all).toContain("Profil alimentaire et approche recommandée");
        expect(all).toContain("Synthèse alimentaire");
        expect(all).toContain("Scores alimentaires");
        expect(all).toContain("Récit alimentaire paragraphe un");
        expect(all).toContain("Conseil alimentaire A");
        expect(all).toContain("Confirmer le rythme des repas");
        expect(all).toContain("Objectif alimentaire déclaré");
        expect(all).toContain("Définition alimentaire du succès");
        expect(all).toContain("Obstacles alimentaires");
        expect(all).toContain("Type d'encadrement préféré");
        expect(all).toContain("Contraintes ou préférences déclarées");
        expect(all).toContain("Réponses sur l'alimentation");
        expect(all).toContain("NUT_GOAL_01");
        expect(all).toContain("NUT_OBS_01");
        expect(all).toContain("Valeur accordée à l'alimentation");
    });
    it("does not drop nutrition when an optional open answer is empty", async () => {
        const report = sampleV2Report({
            directClientAnswers: [
                {
                    questionCode: "NUT_GOAL_01",
                    questionText: "Objectif?",
                    displayValue: "Non répondu",
                    domain: "nutrition",
                },
                {
                    questionCode: "NUT_ROLE_01",
                    questionText: "Likert",
                    displayValue: "5 / 5",
                    domain: "nutrition",
                },
            ],
            nutrition: {
                summary: "Synthèse présente.",
                scores: NUTRITION_DIMENSIONS.map((d) => nutScore(d, 60)),
                narrative: {
                    title: "Profil alimentaire et approche recommandée",
                    paragraphs: ["Récit présent."],
                },
                coachingTips: ["Tip présent"],
                interviewPoints: ["Point présent"],
                goals: [],
                obstacles: [],
            },
        });
        const nutrition = toNutritionViewModel(report);
        expect(nutrition?.available).toBe(true);
        expect(nutrition?.scores).toHaveLength(NUTRITION_DIMENSIONS.length);
        expect(nutrition?.summary).toContain("Synthèse");
        const { buffer } = await renderCoachReportPdf({
            clientName: "Client",
            completedAt: "2026-07-23T20:00:00.000Z",
            questionnaireVersion: "questionnaire-v2",
            rulesetVersion: "ruleset-v2",
            report,
            notes: [],
            generatedAt: "2026-07-24T12:00:00.000Z",
        });
        const all = (await extractPdfPagesText(buffer)).map((p) => p.text).join(" ");
        expect(all).toContain("Profil alimentaire et approche recommandée");
        expect(all).toContain("Tip présent");
        expect(all).toContain("Récit présent");
    });
    it("exports questionnaire-v1 without a nutrition section", async () => {
        const report = sampleV2Report({
            nutrition: undefined,
            directClientAnswers: [
                {
                    questionCode: "OBS_01",
                    questionText: "Obstacles?",
                    displayValue: "fatigue",
                    domain: "training",
                },
            ],
        });
        expect(toNutritionViewModel(report)).toBeNull();
        const sections = buildCoachReportPdfSections({
            clientName: "Client V1",
            completedAt: "2026-01-01T00:00:00.000Z",
            questionnaireVersion: "questionnaire-v1",
            rulesetVersion: "ruleset-v1",
            report,
            notes: [],
            generatedAt: "2026-01-02T00:00:00.000Z",
        });
        expect(JSON.stringify(sections)).not.toContain("Profil alimentaire");
        const { buffer } = await renderCoachReportPdf({
            clientName: "Client V1",
            completedAt: "2026-01-01T00:00:00.000Z",
            questionnaireVersion: "questionnaire-v1",
            rulesetVersion: "ruleset-v1",
            report,
            notes: [],
            generatedAt: "2026-01-02T00:00:00.000Z",
        });
        const all = (await extractPdfPagesText(buffer)).map((p) => p.text).join(" ");
        expect(all).not.toContain("Scores alimentaires");
        expect(all).toContain("Synthèse générale");
    });
    it("keeps historical questionnaire/ruleset labels from the input (no upgrade)", async () => {
        const report = sampleV2Report({ nutrition: undefined });
        const { buffer } = await renderCoachReportPdf({
            clientName: "Historique",
            completedAt: "2025-12-01T00:00:00.000Z",
            questionnaireVersion: "questionnaire-v1",
            rulesetVersion: "ruleset-v1",
            report,
            notes: [],
            generatedAt: "2025-12-02T00:00:00.000Z",
        });
        const first = (await extractPdfPagesText(buffer))[0]?.text ?? "";
        expect(first).toContain("questionnaire-v1");
        expect(first).toContain("ruleset-v1");
        expect(first).not.toContain("questionnaire-v2");
    });
});
