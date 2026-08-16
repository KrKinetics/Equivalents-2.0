import PDFDocument from "pdfkit";
import { asStringArray, buildDirectAnswersForPdf, buildNutritionScoreRows, buildScoreRows, formatPdfDate, formatPdfDateTime, getNonEmptyNotes, } from "./content.mjs";
import { addCardGrid, addCardSection, addDirectAnswer, beginNarrativeBanner, measureDirectAnswerHeight, } from "./components/cards.mjs";
import { addNarrativeParagraph, applyBodyStyle, clearPdfTextTraces, drawBufferedFooters, drawContinuationHeader, drawContinuationReminder, drawFirstPageHeader, drawSectionTitle, } from "./components/header-footer.mjs";
import { clearContentBlockTraces, PdfLayout, resolveFontFile, resolvePdfAsset, safePdfText, } from "./components/layout.mjs";
import { addScoreTable, scoreTableMinStartHeight } from "./components/table.mjs";
import { PDF_BRAND, PDF_COLORS, PDF_FONTS, PDF_PAGE } from "./theme.mjs";
import { isNutritionConfirmationPoint, sportConfirmationPoints } from "../../report/interview-points.mjs";
function pairCards(layout, pairs) {
    for (let i = 0; i < pairs.length; i += 2) {
        const left = pairs[i];
        const right = pairs[i + 1];
        if (right)
            addCardGrid(layout, left, right);
        else
            addCardSection(layout, left);
    }
}
function renderDirectAnswersAnnex(layout, report) {
    const answers = buildDirectAnswersForPdf(report);
    const trainingAnswers = answers.filter((a) => a.domain !== "nutrition");
    const nutritionAnswers = answers.filter((a) => a.domain === "nutrition");
    if (answers.length === 0) {
        drawSectionTitle(layout, "Réponses directes du client");
        layout.addParagraph("Aucune réponse directe disponible.", { color: PDF_COLORS.muted });
        return;
    }
    const firstBatch = trainingAnswers.length > 0 ? trainingAnswers : nutritionAnswers;
    const sample = firstBatch.slice(0, 3);
    let minAnnexHeight = 28 + 20; // main title + subsection
    for (const answer of sample) {
        minAnnexHeight += measureDirectAnswerHeight(layout, answer);
    }
    if (sample.length < 3) {
        minAnnexHeight += 70 * (3 - sample.length);
    }
    if (layout.remainingHeight() < minAnnexHeight) {
        layout.addContinuationPage();
    }
    drawSectionTitle(layout, "Réponses directes du client");
    if (trainingAnswers.length > 0) {
        if (layout.remainingHeight() < 28 + measureDirectAnswerHeight(layout, trainingAnswers[0]) * 2) {
            layout.addContinuationPage();
            drawContinuationReminder(layout, "Réponses sur l'entraînement - suite");
        }
        drawSectionTitle(layout, "Réponses sur l'entraînement");
        for (const answer of trainingAnswers) {
            addDirectAnswer(layout, answer);
        }
    }
    if (nutritionAnswers.length > 0) {
        const firstNut = nutritionAnswers[0];
        const need = 28 +
            measureDirectAnswerHeight(layout, firstNut) +
            (nutritionAnswers[1] ? measureDirectAnswerHeight(layout, nutritionAnswers[1]) : 40);
        if (layout.remainingHeight() < need) {
            layout.addContinuationPage();
            drawContinuationReminder(layout, "Réponses sur l'alimentation - suite");
        }
        drawSectionTitle(layout, "Réponses sur l'alimentation");
        for (const answer of nutritionAnswers) {
            addDirectAnswer(layout, answer);
        }
    }
}
function renderReportBody(layout, input) {
    const report = input.report ?? {};
    addCardSection(layout, {
        title: "Synthèse générale",
        body: report.generalSummary || "Non disponible",
    });
    addCardSection(layout, {
        title: "Objectifs prioritaires",
        bullets: asStringArray(report.priorityGoals),
    });
    pairCards(layout, [
        {
            title: "Principaux moteurs de motivation",
            bullets: asStringArray(report.motivationDrivers),
        },
        {
            title: "Forces favorisant l'adhésion",
            bullets: asStringArray(report.adherenceStrengths),
        },
        {
            title: "Obstacles potentiels",
            bullets: asStringArray(report.potentialObstacles),
        },
        {
            title: "Réaction probable aux écarts",
            body: report.likelyReactionToSetbacks || "Non disponible",
        },
        {
            title: "Perception personnelle du succès",
            body: report.personalSuccessPerception || "Non disponible",
        },
        {
            title: "Style de communication recommandé",
            body: report.recommendedCommunicationStyle || "Non disponible",
        },
        {
            title: "Niveau de structure recommandé",
            body: report.recommendedStructureLevel || "Non disponible",
        },
        {
            title: "Stratégies d'accompagnement suggérées",
            bullets: asStringArray(report.suggestedSupportStrategies),
        },
    ]);
    // Keep page 1 readable: move the score table to page 2 when space is tight.
    const scoreRows = buildScoreRows(report);
    if (scoreRows.length > 0 &&
        layout.remainingHeight() < scoreTableMinStartHeight(scoreRows.length) + 40) {
        layout.addContinuationPage();
    }
    addScoreTable(layout, scoreRows, { title: "Scores calculés" });
    drawSectionTitle(layout, "Interprétations du moteur de règles");
    const interpretations = Array.isArray(report.interpretations) ? report.interpretations : [];
    if (interpretations.length === 0) {
        layout.addParagraph("Aucune règle déclenchée.", { color: PDF_COLORS.muted });
    }
    else {
        for (const insight of interpretations) {
            addCardSection(layout, {
                title: String(insight.title ?? "Interprétation"),
                body: `${safePdfText(insight.message)} Recommandation : ${safePdfText(insight.coachingRecommendation)}`,
            });
        }
    }
    const contradictions = asStringArray(report.contradictionsOrUncertainties);
    addCardSection(layout, {
        title: "Contradictions ou incertitudes",
        body: contradictions.length === 0 ? "Aucune contradiction détectée." : undefined,
        bullets: contradictions.length > 0 ? contradictions : undefined,
    });
    addCardSection(layout, {
        title: "Questions à approfondir en rendez-vous",
        bullets: asStringArray(report.interviewFollowUpQuestions),
    });
    addCardSection(layout, {
        title: "Éléments sportifs à confirmer en entrevue",
        bullets: sportConfirmationPoints(report),
    });
    const narrativeParagraphs = Array.isArray(report.narrative?.paragraphs)
        ? report.narrative.paragraphs
        : [];
    if (report.narrative || narrativeParagraphs.length > 0) {
        const title = report.narrative?.title || "Portrait narratif du client et approche recommandée";
        beginNarrativeBanner(layout, title);
        for (const paragraph of narrativeParagraphs) {
            addNarrativeParagraph(layout, String(paragraph ?? ""), "coach-narrative");
        }
    }
    if (report.nutrition) {
        beginNarrativeBanner(layout, report.nutrition.narrative.title || "Profil alimentaire et approche recommandée");
        addCardSection(layout, {
            title: "Synthèse alimentaire",
            body: report.nutrition.summary,
        });
        addScoreTable(layout, buildNutritionScoreRows(report), {
            title: "Scores alimentaires",
            continuationTitle: "Scores alimentaires - suite",
        });
        for (const paragraph of report.nutrition.narrative.paragraphs) {
            addNarrativeParagraph(layout, paragraph, "nutrition-narrative");
        }
        addCardSection(layout, {
            title: "Repères d'accompagnement alimentaire",
            bullets: asStringArray(report.nutrition.coachingTips),
        });
        addCardSection(layout, {
            title: "Éléments alimentaires à confirmer en entrevue",
            bullets: asStringArray(report.nutrition.interviewPoints).filter((p) => !sportConfirmationPoints(report).includes(p)),
        });
        const goals = asStringArray(report.nutrition.goals);
        if (goals.length > 0) {
            addCardSection(layout, {
                title: "Objectif alimentaire déclaré",
                bullets: goals,
            });
        }
        if (report.nutrition.successDefinition?.trim()) {
            addCardSection(layout, {
                title: "Définition alimentaire du succès",
                body: report.nutrition.successDefinition,
            });
        }
        const obstacles = asStringArray(report.nutrition.obstacles);
        if (obstacles.length > 0) {
            addCardSection(layout, {
                title: "Obstacles alimentaires sélectionnés",
                bullets: obstacles,
            });
        }
        if (report.nutrition.preferredStructure?.trim()) {
            addCardSection(layout, {
                title: "Type d'encadrement préféré",
                body: report.nutrition.preferredStructure,
            });
        }
        if (report.nutrition.contextualConstraints?.trim()) {
            addCardSection(layout, {
                title: "Contraintes ou préférences déclarées",
                body: report.nutrition.contextualConstraints,
            });
        }
    }
    renderDirectAnswersAnnex(layout, report);
    const notes = getNonEmptyNotes(input.notes);
    if (notes.length > 0) {
        drawSectionTitle(layout, "Notes privées du coach");
        for (const note of notes) {
            addCardSection(layout, {
                title: formatPdfDateTime(note.createdAt),
                body: note.body.trim(),
            });
        }
    }
    // Touch helper so tree-shaking keeps the nutrition filter available to tests.
    void isNutritionConfirmationPoint;
}
/**
 * Renders a US-Letter PDF buffer from a stored coach report snapshot.
 * Does not recalculate scoring or narrative.
 */
export async function renderCoachReportPdf(input) {
    const generatedAt = typeof input.generatedAt === "string" ? new Date(input.generatedAt) : input.generatedAt;
    const generatedAtLabel = `Généré le ${formatPdfDateTime(generatedAt)}`;
    const logoPath = resolvePdfAsset(PDF_BRAND.logoRelativePaths);
    const headerMeta = {
        clientName: input.clientName,
        completedAtLabel: formatPdfDate(input.completedAt),
        questionnaireVersion: input.questionnaireVersion,
        rulesetVersion: input.rulesetVersion,
        generatedAtLabel: formatPdfDateTime(generatedAt),
        logoPath,
    };
    return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (error) => {
            if (settled)
                return;
            settled = true;
            reject(error);
        };
        const succeed = (value) => {
            if (settled)
                return;
            settled = true;
            resolve(value);
        };
        try {
            clearPdfTextTraces();
            clearContentBlockTraces();
            const fontRegular = resolveFontFile("Roboto-Regular.ttf");
            const fontBold = resolveFontFile("Roboto-Bold.ttf");
            const doc = new PDFDocument({
                size: PDF_PAGE.size,
                bufferPages: true,
                autoFirstPage: true,
                font: fontRegular,
                margins: {
                    // Large top margin is managed manually via bodyTop; keep PDFKit from
                    // auto-wrapping into the reserved header band.
                    top: CONTINUATION_SAFE_TOP,
                    bottom: PDF_PAGE.footerHeight,
                    left: PDF_PAGE.marginX,
                    right: PDF_PAGE.marginX,
                },
                info: {
                    Title: `Rapport coach - ${safePdfText(input.clientName)}`,
                    Author: PDF_BRAND.name,
                    Subject: "Rapport d'évaluation client (usage coach)",
                    CreationDate: generatedAt,
                },
            });
            doc.registerFont(PDF_FONTS.regular, fontRegular);
            doc.registerFont(PDF_FONTS.bold, fontBold);
            doc.font(PDF_FONTS.regular);
            const layout = new PdfLayout(doc);
            layout.setContinuationDrawer((nextLayout) => {
                drawContinuationHeader(nextLayout, headerMeta);
                applyBodyStyle(nextLayout.doc);
            });
            const chunks = [];
            doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            doc.on("error", fail);
            drawFirstPageHeader(layout, headerMeta);
            renderReportBody(layout, input);
            const pagesBeforeFooter = doc.bufferedPageRange().count;
            layout.setSuppressContinuation(true);
            const pageCount = drawBufferedFooters(doc, {
                generatedAtLabel,
                internalLabel: PDF_BRAND.internalUse,
            });
            layout.setSuppressContinuation(false);
            const pagesAfterFooter = doc.bufferedPageRange().count;
            if (pagesAfterFooter !== pagesBeforeFooter) {
                fail(new Error(`Footer pagination bug: pages before=${pagesBeforeFooter} after=${pagesAfterFooter}`));
                return;
            }
            doc.on("end", () => {
                succeed({
                    buffer: Buffer.concat(chunks),
                    pageCount,
                });
            });
            doc.end();
        }
        catch (error) {
            fail(error);
        }
    });
}
/** PDFKit bottom-safe top margin equal to continuation bodyTop. */
const CONTINUATION_SAFE_TOP = 104;
export function isValidPdfBuffer(buffer) {
    return buffer.length > 100 && buffer.subarray(0, 4).toString("utf8") === "%PDF";
}
export function getCoachReportLogoPath() {
    return resolvePdfAsset(PDF_BRAND.logoRelativePaths);
}
