import PDFDocument from "pdfkit";
import { DECISION_PREFERENCE_LABELS, EVIDENCE_STRENGTH_LABELS, FINDING_TYPE_LABELS, FOLLOW_UP_LABELS, FORBIDDEN_TECHNICAL_TOKENS, IMPORTANCE_LABELS, OPEN_ANSWER_QUALITY_LABELS, PREPARATION_LABELS, STRUCTURE_LABELS, } from "../../report/v31/labels.mjs";
import { selectActionableFindingsForSummary } from "../../report/v31/findings.mjs";
import { formatPdfDate, formatPdfDateTime } from "./content.mjs";
import { addCardSection } from "./components/cards.mjs";
import { addNarrativeParagraph, applyBodyStyle, clearPdfTextTraces, drawBufferedFooters, drawContinuationHeader, drawContinuationReminder, drawFirstPageHeader, drawSectionTitle, } from "./components/header-footer.mjs";
import { clearContentBlockTraces, PdfLayout, resolveFontFile, resolvePdfAsset, safePdfText, } from "./components/layout.mjs";
import { drawFullWidthAnswerBlocks, mergeAnnexTraces, } from "./annex-layout.mjs";
import { createPdfMetricsTimer, finishPdfMetrics } from "./metrics.mjs";
import { addScoreTableV31 } from "./table-v31.mjs";
import { drawPdfTable } from "./table-engine.mjs";
import { PDF_BRAND, PDF_COLORS, PDF_FONTS, PDF_PAGE, PDF_TYPE } from "./theme.mjs";
import { shouldRenderBodyHeading } from "./should-render-body-heading.mjs";
import { assertValidUnicode } from "./unicode-guard.mjs";
import { assertPdfValidation, validateGeneratedPdf } from "./validate-pdf.mjs";
/** Avoid "Label : Label : value" when value already contains the label. */
function formatLabeled(label, value) {
    const v = (value ?? "").trim();
    if (!v)
        return `${label} : à préciser`;
    const lower = v.toLowerCase();
    const labelLower = label.toLowerCase();
    if (lower.startsWith(labelLower))
        return v;
    // Strip a redundant leading "Structure :" etc.
    const stripped = v.replace(/^(structure recommandée|structure|approche des choix|préparation comportementale)\s*:\s*/i, "");
    return `${label} : ${stripped}`;
}
const ALLOWED_VISIBLE_LABELS = new Set([
    ...Object.values(PREPARATION_LABELS),
    ...Object.values(STRUCTURE_LABELS),
    ...Object.values(FOLLOW_UP_LABELS),
    ...Object.values(IMPORTANCE_LABELS),
    ...Object.values(EVIDENCE_STRENGTH_LABELS),
    ...Object.values(FINDING_TYPE_LABELS),
    ...Object.values(DECISION_PREFERENCE_LABELS),
    ...Object.values(OPEN_ANSWER_QUALITY_LABELS),
]);
function assertNoForbiddenTokens(text, context) {
    const lower = text.toLowerCase();
    for (const token of FORBIDDEN_TECHNICAL_TOKENS) {
        if (ALLOWED_VISIBLE_LABELS.has(token))
            continue;
        const pattern = new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`, "i");
        if (pattern.test(lower)) {
            throw new Error(`FORBIDDEN_TECHNICAL_TOKEN:${token}:${context}`);
        }
    }
}
/** Flatten all visible strings from the view model for unicode gating. */
export function flattenViewModelVisibleText(viewModel) {
    const plan = viewModel.initialPlan;
    const readiness = viewModel.behavioralReadiness;
    const chunks = [
        plan.profileSummary,
        plan.preparationLabel,
        plan.structureLabel,
        plan.followUpLabel,
        plan.communicationStyle,
        plan.choiceApproachLabel,
        ...plan.initialPriorities,
        ...plan.mainStrengths,
        ...plan.mainRisks,
        ...plan.clarifications,
        plan.missedSessionProtocol,
        plan.nutritionApproach ?? "",
        ...plan.firstFourWeeksActions,
        ...plan.priorityInterviewQuestions,
        readiness.overallLabel,
        readiness.explanation ?? "",
        readiness.consistencyLabel,
        readiness.selfEfficacyLabel,
        readiness.structureFitLabel,
        readiness.choiceApproachLabel,
        ...readiness.conditions,
        viewModel.reportUsability.summary,
        viewModel.reportUsability.message ?? "",
        viewModel.reportUsability.levelLabel,
        ...viewModel.reportUsability.limitingFactors,
        ...viewModel.initialApproachWarnings.map((w) => w.message),
        ...viewModel.fourWeekPlan.weeks.flatMap((w) => [
            w.title,
            w.focus,
            w.objective ?? "",
            ...(w.coachActions?.length ? w.coachActions : w.actions),
        ]),
        ...viewModel.interviewChecklist.map((i) => i.label),
        ...viewModel.declaredObstacles.flatMap((o) => [
            o.rawLabel,
            o.planQuestion,
            o.practicalAction,
        ]),
        ...viewModel.openAnswerAssessments.flatMap((o) => [
            o.originalAnswer,
            o.statusLabel,
            o.proposedInterviewQuestion,
        ]),
        ...viewModel.findings.flatMap((f) => [
            f.title,
            f.observation,
            f.interpretation,
            f.possibleConsequence,
            f.recommendedAction,
            f.validationQuestion,
            f.toConfirm,
            IMPORTANCE_LABELS[f.importance],
            EVIDENCE_STRENGTH_LABELS[f.evidenceStrength],
            FINDING_TYPE_LABELS[f.type],
        ]),
        ...viewModel.sport.narrativeSections.flatMap((s) => [s.title, ...s.paragraphs]),
        ...(viewModel.nutrition?.narrativeSections ?? []).flatMap((s) => [
            s.title,
            ...s.paragraphs,
        ]),
        ...viewModel.sport.groupedUncertainties.flatMap((u) => [
            u.title,
            u.pdfSummary ?? u.summary,
        ]),
        ...(viewModel.nutrition?.groupedUncertainties ?? []).flatMap((u) => [
            u.title,
            u.pdfSummary ?? u.summary,
        ]),
        ...viewModel.directAnswers.flatMap((a) => [
            a.questionCode,
            a.questionText,
            a.displayValue,
        ]),
        DECISION_PREFERENCE_LABELS[plan.decisionPreference],
    ];
    return chunks.join("\n");
}
function scanViewModelText(viewModel) {
    const flattened = flattenViewModelVisibleText(viewModel);
    assertValidUnicode(flattened, "rapport");
    for (const chunk of flattened.split("\n")) {
        assertNoForbiddenTokens(chunk, "view-model");
    }
}
function drawFinding(layout, finding, opts) {
    const compact = opts?.compact === true;
    layout.ensureSpace(compact ? 52 : 90);
    layout.beginBlock(`finding:${finding.id}`);
    layout.doc
        .font(PDF_FONTS.bold)
        .fontSize(compact ? 8.5 : 9)
        .fillColor(PDF_COLORS.accent)
        .text(safePdfText(`${FINDING_TYPE_LABELS[finding.type]} · ${IMPORTANCE_LABELS[finding.importance]} · ${EVIDENCE_STRENGTH_LABELS[finding.evidenceStrength]}`), layout.left, layout.y, { width: layout.contentWidth });
    layout.y = layout.doc.y + (compact ? 1 : 2);
    layout.doc
        .font(PDF_FONTS.bold)
        .fontSize(compact ? 10 : PDF_TYPE.section)
        .fillColor(PDF_COLORS.ink)
        .text(safePdfText(finding.title), layout.left, layout.y, {
        width: layout.contentWidth,
    });
    layout.y = layout.doc.y + (compact ? 1 : 2);
    applyBodyStyle(layout.doc);
    const lines = compact
        ? [
            `Action : ${finding.recommendedAction}`,
            `À confirmer : ${finding.validationQuestion}`,
        ]
        : [
            `Constat : ${finding.observation}`,
            `Interprétation : ${finding.interpretation}`,
            `Conséquence : ${finding.possibleConsequence}`,
            `Action : ${finding.recommendedAction}`,
            `Question de validation : ${finding.validationQuestion}`,
        ];
    for (const line of lines) {
        layout.doc
            .fontSize(compact ? 9 : 9.5)
            .fillColor(PDF_COLORS.ink)
            .text(safePdfText(line), {
            width: layout.contentWidth,
            lineGap: compact ? 1 : 1.5,
        });
        layout.y = layout.doc.y + (compact ? 0.5 : 1);
    }
    layout.y += compact ? 3 : 6;
}
function drawGroupedUncertainties(layout, title, groups) {
    if (groups.length === 0)
        return;
    drawSectionTitle(layout, title);
    for (const group of groups) {
        // PDF: natural prose only — no parenthetical dimension list repeat.
        const paragraph = `${group.title} — ${group.pdfSummary ?? group.summary}`;
        layout.setFont(false, PDF_TYPE.body);
        const height = layout.heightOf(paragraph) + 4;
        if (height <= 120)
            layout.ensureSpace(height);
        layout.addParagraph(paragraph, {
            color: PDF_COLORS.ink,
        });
    }
}
function drawNarrativeSections(layout, title, sections) {
    drawSectionTitle(layout, title);
    for (const section of sections) {
        layout.addSectionWithFirstBlock(18, 28);
        layout.doc
            .font(PDF_FONTS.bold)
            .fontSize(PDF_TYPE.section)
            .fillColor(PDF_COLORS.ink)
            .text(safePdfText(section.title), layout.left, layout.y, {
            width: layout.contentWidth,
        });
        layout.y = layout.doc.y + 4;
        for (const paragraph of section.paragraphs) {
            addNarrativeParagraph(layout, paragraph);
        }
    }
}
function isCompactLikert(answer) {
    if (!answer.isShortLikert || answer.isOpenAnswer)
        return false;
    // Keep short Likert answers in synchronized two-column rows even when
    // the question stem is moderately long — prevents sparse last pages.
    return answer.displayValue.length < 24 && answer.questionText.length < 170;
}
function sourceLabelForObjective(code) {
    if (code === "GOAL_01")
        return "Objectif d'entraînement";
    if (code === "GOAL_02")
        return "Définition de la réussite";
    if (code === "OBS_01")
        return "Obstacle déclaré";
    if (code === "NUT_GOAL_01")
        return "Objectif alimentaire";
    if (code === "NUT_SUCCESS_01")
        return "Indicateur alimentaire";
    if (code === "NUT_OBS_01")
        return "Obstacle déclaré";
    if (code === "NUT_CONTEXT_01")
        return "Contrainte alimentaire";
    if (/^NUT_/i.test(code))
        return "Objectif alimentaire";
    if (/SUCCESS|RÉUSSITE|REUSSITE/i.test(code))
        return "Définition de la réussite";
    if (/GOAL|OBJECTIF/i.test(code))
        return "Objectif d'entraînement";
    return "Objectif déclaré";
}
function drawObjectivesTable(layout, rows) {
    if (rows.length === 0)
        return;
    const left = layout.left;
    const w = layout.contentWidth;
    const columns = [
        { key: "source", label: "Source", x: left, width: w * 0.17, align: "left" },
        { key: "answer", label: "Réponse", x: left + w * 0.17, width: w * 0.25, align: "left" },
        { key: "eval", label: "Évaluation", x: left + w * 0.42, width: w * 0.19, align: "left" },
        {
            key: "question",
            label: "Question d'entrevue",
            x: left + w * 0.61,
            width: w * 0.39,
            align: "left",
        },
    ];
    const tableRows = rows.map((row) => ({
        id: row.questionCode,
        cells: {
            source: sourceLabelForObjective(row.questionCode),
            answer: row.originalAnswer,
            eval: row.statusLabel,
            question: row.proposedInterviewQuestion,
        },
    }));
    drawPdfTable({
        layout,
        title: "Objectifs déclarés",
        columns,
        rows: tableRows,
        headerHeight: 22,
    });
}
function drawObstaclesTable(layout, obstacles) {
    if (obstacles.length === 0)
        return;
    const left = layout.left;
    const w = layout.contentWidth;
    const columns = [
        { key: "obstacle", label: "Obstacle", x: left, width: w * 0.17, align: "left" },
        {
            key: "question",
            label: "Question de validation",
            x: left + w * 0.17,
            width: w * 0.33,
            align: "left",
        },
        {
            key: "consequence",
            label: "Conséquence possible",
            x: left + w * 0.5,
            width: w * 0.2,
            align: "left",
        },
        {
            key: "action",
            label: "Action pratique",
            x: left + w * 0.7,
            width: w * 0.3,
            align: "left",
        },
    ];
    const tableRows = obstacles.map((obstacle, index) => ({
        id: obstacle.id ?? `obs_${index}`,
        cells: {
            obstacle: obstacle.rawLabel,
            question: obstacle.planQuestion,
            consequence: "Peut compromettre l'exécution régulière du plan initial.",
            action: obstacle.practicalAction,
        },
    }));
    drawPdfTable({
        layout,
        title: "Obstacles prioritaires à explorer",
        columns,
        rows: tableRows,
        headerHeight: 24,
    });
}
function drawChecklist(layout, items, opts) {
    if (items.length === 0)
        return;
    const limited = opts?.maxItems !== undefined ? items.slice(0, opts.maxItems) : items;
    layout.setFont(false, PDF_TYPE.body);
    const firstLabel = limited[0]?.label ?? "";
    const firstTextH = layout.heightOf(firstLabel, layout.contentWidth - 15);
    const firstItemH = Math.max(9, firstTextH) + (opts?.compact ? 2 : 4);
    // Keep section title with the first checkbox+label as one indivisible block.
    layout.ensureSpace(28 + firstItemH);
    layout.setPageSectionContext("Liste de vérification — entrevue");
    drawSectionTitle(layout, "Liste de vérification — entrevue");
    for (const item of limited) {
        layout.setFont(false, PDF_TYPE.body);
        const textHeight = layout.heightOf(item.label, layout.contentWidth - 15);
        const height = Math.max(9, textHeight) + (opts?.compact ? 2 : 4);
        if (layout.remainingHeight() < height) {
            layout.setPageSectionContext("Liste de vérification — entrevue");
            layout.addContinuationPage();
        }
        layout.beginBlock(`checklist:${item.id}`);
        const y = layout.y;
        layout.doc
            .rect(layout.left, y + 1, 9, 9)
            .strokeColor(PDF_COLORS.ink)
            .lineWidth(0.7)
            .stroke();
        if (item.checked) {
            layout.doc
                .moveTo(layout.left + 2, y + 5)
                .lineTo(layout.left + 4, y + 8)
                .lineTo(layout.left + 8, y + 2)
                .strokeColor(PDF_COLORS.accent)
                .lineWidth(1.1)
                .stroke();
        }
        layout.doc.font(PDF_FONTS.regular).fontSize(PDF_TYPE.body).fillColor(PDF_COLORS.ink);
        layout.doc.text(safePdfText(item.label), layout.left + 14, y, {
            width: layout.contentWidth - 14,
            lineGap: 1.5,
        });
        layout.y = y + height;
    }
}
function drawDirectAnswersAnnex(layout, answers) {
    // PDF annex keeps original open/MC answers (provenance). Likert items already
    // appear in score tables — omitting them avoids a near-empty trailing page.
    const coreAnswers = answers.filter((a) => a.section !== "Précision adaptative" &&
        !a.questionText.startsWith("[Précision adaptative]") &&
        !isCompactLikert(a));
    const training = coreAnswers.filter((a) => a.domain === "training");
    const nutrition = coreAnswers.filter((a) => a.domain === "nutrition");
    const traces = [];
    const renderDomain = (title, rows) => {
        if (rows.length === 0)
            return;
        if (layout.remainingHeight() < 80)
            layout.addContinuationPage();
        drawContinuationReminder(layout, title);
        traces.push(drawFullWidthAnswerBlocks(layout, rows));
    };
    layout.setPageSectionContext("Réponses directes du client");
    if (layout.remainingHeight() < 120)
        layout.addContinuationPage();
    // Page header already shows this label — avoid an immediate body duplicate.
    if (shouldRenderBodyHeading({
        pageHeaderLabel: layout.getPageSectionContext(),
        bodyHeading: "Réponses directes du client",
    })) {
        drawSectionTitle(layout, "Réponses directes du client");
    }
    renderDomain("Réponses sur l'entraînement", training);
    renderDomain("Réponses sur l'alimentation", nutrition);
    return traces.length
        ? mergeAnnexTraces(...traces)
        : {
            blocks: [],
            rectangles: [],
            pageFillRatios: {},
            pageFillMetrics: [],
            rebalanced: false,
            rowSyncEvents: [],
        };
}
/**
 * Renders coach summary (2–3 pages) or full report for report-model-v3.1.
 * Summary never includes direct answers or full score tables.
 */
export async function renderCoachReportPdfV31(input) {
    const timer = createPdfMetricsTimer();
    const { viewModel, format } = input;
    const includeDirectAnswers = format === "full" && (input.includeDirectAnswers ?? true);
    const generatedAt = input.generatedAt ?? new Date();
    scanViewModelText(viewModel);
    clearPdfTextTraces();
    clearContentBlockTraces();
    const doc = new PDFDocument({
        size: PDF_PAGE.size,
        margins: {
            top: 104,
            bottom: PDF_PAGE.footerHeight + 8,
            left: PDF_PAGE.marginX,
            right: PDF_PAGE.marginX,
        },
        bufferPages: true,
        autoFirstPage: true,
    });
    doc.info.Title = `Rapport coach — ${viewModel.metadata.clientName}`;
    doc.info.Author = "KR Kinetics";
    doc.info.Subject = "Rapport interne d’évaluation motivationnelle et comportementale";
    doc.info.Keywords = "KR Kinetics, coaching, entraînement, alimentation, évaluation";
    doc.info.Creator = "Outils d’évaluation client KR Kinetics";
    doc.registerFont(PDF_FONTS.regular, resolveFontFile("Roboto-Regular.ttf"));
    doc.registerFont(PDF_FONTS.bold, resolveFontFile("Roboto-Bold.ttf"));
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });
    const layout = new PdfLayout(doc);
    const logoPath = resolvePdfAsset(PDF_BRAND.logoRelativePaths);
    const generatedAtLabel = formatPdfDateTime(generatedAt);
    const footerGeneratedLabel = `Généré le ${generatedAtLabel}`;
    const meta = {
        clientName: viewModel.metadata.clientName,
        completedAtLabel: formatPdfDate(viewModel.metadata.completedAt),
        questionnaireVersion: viewModel.metadata.questionnaireVersion,
        rulesetVersion: viewModel.metadata.rulesetVersion,
        generatedAtLabel,
        logoPath,
    };
    layout.setContinuationDrawer((l) => {
        drawContinuationHeader(l, meta, l.getPageSectionContext());
    });
    let annexTrace;
    drawFirstPageHeader(layout, meta);
    applyBodyStyle(doc);
    const summaryGap = format === "summary" ? 2 : 4;
    const isSummary = format === "summary";
    drawSectionTitle(layout, "Plan d'approche initial recommandé");
    layout.addParagraph(viewModel.initialPlan.profileSummary, {
        gapAfter: summaryGap,
    });
    const declaredGoals = (viewModel.openAnswerAssessments ?? [])
        .filter((a) => a.questionCode === "GOAL_01" ||
        a.questionCode === "GOAL_02" ||
        a.questionCode === "NUT_GOAL_01")
        .map((a) => {
        if (a.questionCode === "GOAL_01") {
            return `Objectif déclaré : ${a.originalAnswer}`;
        }
        if (a.questionCode === "GOAL_02") {
            const visualOnly = a.statusLabel.toLowerCase().includes("visuel") &&
                /\b(mirroir|miroir|reflet)\b/i.test(a.originalAnswer);
            return `Indicateur de réussite : ${visualOnly ? "miroir, à préciser" : a.originalAnswer}`;
        }
        if (a.questionCode === "NUT_GOAL_01") {
            return `Objectif alimentaire : ${/qualit/i.test(a.originalAnswer) ? "qualité, à définir" : a.originalAnswer}`;
        }
        return null;
    })
        .filter((v) => Boolean(v));
    addCardSection(layout, {
        title: "Décisions principales",
        bullets: [
            formatLabeled("Préparation comportementale", viewModel.initialPlan.preparationLabel),
            formatLabeled("Structure recommandée", viewModel.initialPlan.structureLabel),
            formatLabeled("Suivi initial", viewModel.initialPlan.followUpLabel),
            formatLabeled("Approche des choix", viewModel.initialPlan.choiceApproachLabel),
            formatLabeled("Communication", viewModel.initialPlan.communicationStyle),
            viewModel.behavioralReadiness.explanation,
        ],
    });
    if (isSummary) {
        if (declaredGoals.length > 0) {
            layout.setPageSectionContext("Objectifs déclarés");
            addCardSection(layout, {
                title: "Objectifs déclarés",
                bullets: declaredGoals,
            });
        }
        layout.setPageSectionContext("À éviter au départ");
        addCardSection(layout, {
            title: "À éviter au départ",
            bullets: viewModel.initialApproachWarnings.slice(0, 5).map((w) => w.message),
        });
        layout.addParagraph(`Exploitabilité actuelle : ${viewModel.reportUsability.levelLabel.toLowerCase()}.`, { gapAfter: summaryGap });
        layout.setPageSectionContext("Plan d'accompagnement — 4 semaines");
        drawSectionTitle(layout, "Plan d'accompagnement — 4 semaines");
        for (const week of viewModel.fourWeekPlan.weeks) {
            const firstAction = week.coachActions?.[0] ?? week.actions[0] ?? week.focus;
            layout.addParagraph(`${week.title} — ${firstAction}`, {
                gapAfter: summaryGap,
            });
        }
        // Header must reflect the first real block on the next page — not the prior section.
        layout.setPageSectionContext("Questions d'entrevue et constats");
        if (layout.remainingHeight() < 140) {
            layout.addContinuationPage();
        }
        addCardSection(layout, {
            title: "Questions prioritaires d'entrevue",
            bullets: viewModel.initialPlan.priorityInterviewQuestions,
        });
        layout.setPageSectionContext("Questions d'entrevue et constats");
        drawSectionTitle(layout, "Constats opérationnels");
        const findingsForSummary = selectActionableFindingsForSummary(viewModel.findings, 4);
        for (const finding of findingsForSummary) {
            drawFinding(layout, finding, { compact: true });
        }
        drawChecklist(layout, viewModel.interviewChecklist, {
            maxItems: 4,
            compact: true,
        });
    }
    else {
        addCardSection(layout, {
            title: "Priorités initiales",
            bullets: viewModel.initialPlan.initialPriorities
                .map((p) => /^(Priorité|Clarifier|Définir|Préciser|Tester)/i.test(p) ? p : `Priorité — ${p}`)
                .slice(0, 5),
        });
        const leverTitles = ("probableLevers" in viewModel && Array.isArray(viewModel.probableLevers)
            ? viewModel.probableLevers.map((l) => typeof l === "string" ? l : (l.title ?? ""))
            : []).filter(Boolean);
        addCardSection(layout, {
            title: "Forces probables et leviers",
            bullets: [...viewModel.initialPlan.mainStrengths, ...leverTitles]
                .map((p) => (/^(Force|Levier|Aucune force)/i.test(p) ? p : `Force — ${p}`))
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .slice(0, 6),
        });
        addCardSection(layout, {
            title: "Risques et points à clarifier",
            bullets: viewModel.initialPlan.mainRisks
                .map((p) => /^(Risque|Point de vigilance)/i.test(p) ? p : `Risque — ${p}`)
                .slice(0, 5),
        });
        layout.addParagraph(`Procédure après une séance manquée : ${viewModel.initialPlan.missedSessionProtocol}`);
        if (viewModel.initialPlan.nutritionApproach) {
            layout.addParagraph(`Approche alimentaire initiale : ${viewModel.initialPlan.nutritionApproach}`);
        }
        if (viewModel.initialApproachWarnings.length > 0) {
            addCardSection(layout, {
                title: "À éviter au départ",
                bullets: viewModel.initialApproachWarnings.map((w) => w.message),
            });
        }
        addCardSection(layout, {
            title: `Exploitabilité actuelle : ${viewModel.reportUsability.levelLabel}`,
            body: viewModel.reportUsability.message || viewModel.reportUsability.summary,
            bullets: viewModel.reportUsability.limitingFactors,
        });
        drawSectionTitle(layout, "Plan d'accompagnement — 4 semaines");
        for (const week of viewModel.fourWeekPlan.weeks) {
            const focus = week.focus &&
                week.focus.trim().toLowerCase() !== week.title.trim().toLowerCase()
                ? week.focus
                : undefined;
            addCardSection(layout, {
                title: week.title,
                body: focus,
                bullets: week.coachActions?.length ? week.coachActions : week.actions,
            });
        }
        addCardSection(layout, {
            title: "Questions prioritaires d'entrevue",
            bullets: viewModel.initialPlan.priorityInterviewQuestions,
        });
        drawSectionTitle(layout, "Constats opérationnels");
        const findingsFull = selectActionableFindingsForSummary(viewModel.findings, 5);
        for (const finding of findingsFull) {
            drawFinding(layout, finding, { compact: true });
        }
        drawObjectivesTable(layout, viewModel.openAnswerAssessments);
        drawObstaclesTable(layout, viewModel.declaredObstacles);
        drawChecklist(layout, viewModel.interviewChecklist, {
            maxItems: 8,
            compact: true,
        });
        layout.setPageSectionContext("Analyse de l'entraînement");
        addScoreTableV31({
            layout,
            title: "Scores calculés",
            scores: viewModel.sport.scores,
            pageHeaderLabel: "Analyse de l'entraînement",
        });
        drawGroupedUncertainties(layout, "Incertitudes regroupées — entraînement", viewModel.sport.groupedUncertainties);
        drawNarrativeSections(layout, "Lecture narrative — entraînement", viewModel.sport.narrativeSections);
        if (viewModel.nutrition) {
            layout.setPageSectionContext("Analyse alimentaire");
            addScoreTableV31({
                layout,
                title: "Scores alimentaires",
                scores: viewModel.nutrition.scores,
                pageHeaderLabel: "Analyse alimentaire",
            });
            drawGroupedUncertainties(layout, "Incertitudes regroupées — alimentation", viewModel.nutrition.groupedUncertainties);
            drawNarrativeSections(layout, "Lecture narrative — alimentation", viewModel.nutrition.narrativeSections);
        }
        if (viewModel.coachValidations.length > 0) {
            drawSectionTitle(layout, "Validation du coach après l'entrevue");
            for (const v of viewModel.coachValidations) {
                const finding = viewModel.findings.find((f) => f.id === v.insightId);
                layout.addParagraph(`${finding?.title ?? v.insightId} — ${v.status}${v.coachNote ? ` (${v.coachNote})` : ""}`);
            }
        }
        if (viewModel.fourWeekFollowUp) {
            drawSectionTitle(layout, "Suivi d'adhésion — semaine 4");
            const rate = viewModel.fourWeekFollowUp.sessionCompletionRate;
            layout.addParagraph(`Séances : ${viewModel.fourWeekFollowUp.completedSessions}/${viewModel.fourWeekFollowUp.plannedSessions}` +
                (rate !== null ? ` · complétion ${Math.round(rate * 100)} %` : ""));
        }
        if (includeDirectAnswers) {
            annexTrace = drawDirectAnswersAnnex(layout, viewModel.directAnswers);
        }
        if (viewModel.notes.length > 0) {
            drawSectionTitle(layout, "Notes du coach");
            for (const note of viewModel.notes) {
                layout.addParagraph(note.body);
            }
        }
    }
    // Unicode gate before finalize.
    const flattened = flattenViewModelVisibleText(viewModel);
    assertValidUnicode(flattened, "PDF");
    const pageCount = drawBufferedFooters(doc, {
        generatedAtLabel: footerGeneratedLabel,
        internalLabel: PDF_BRAND.internalUse,
    });
    doc.end();
    const buffer = await done;
    const validation = validateGeneratedPdf({
        buffer,
        flattenedText: flattened,
        pageCount,
        annexTrace,
    });
    assertPdfValidation(validation);
    const metrics = finishPdfMetrics({
        start: timer.start,
        format,
        pageCount,
        bufferBytes: buffer.length,
    });
    return { buffer, pageCount, metrics, layoutTrace: annexTrace };
}
export function isValidPdfBuffer(buffer) {
    return buffer.length > 100 && buffer.subarray(0, 5).toString() === "%PDF-";
}
/** Test helper: extract printable text approximation from a rendered view model path. */
export function collectSummaryPdfText(viewModel) {
    const parts = [
        viewModel.initialPlan.profileSummary,
        ...viewModel.findings.map((f) => f.observation),
        ...viewModel.initialPlan.firstFourWeeksActions,
    ];
    return parts.join("\n");
}
export function summaryIncludesDirectAnswers(viewModel, summaryText) {
    return viewModel.directAnswers.some((a) => a.displayValue.length > 8 &&
        summaryText.includes(a.displayValue) &&
        summaryText.includes(a.questionCode));
}
