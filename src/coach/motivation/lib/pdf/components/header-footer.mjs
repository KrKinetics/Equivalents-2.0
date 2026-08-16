import { safePdfText } from "./layout.mjs";
import { CONTINUATION_HEADER, NARRATIVE_COLOR, NARRATIVE_FONT, NARRATIVE_FONT_SIZE, NARRATIVE_LINE_GAP, NARRATIVE_STYLE, PDF_BRAND, PDF_COLORS, PDF_FONTS, PDF_PAGE, PDF_SPACE, PDF_TYPE, } from "../theme.mjs";
let pdfTextTraces = [];
export function clearPdfTextTraces() {
    pdfTextTraces = [];
}
export function getPdfTextTraces() {
    return [...pdfTextTraces];
}
function shouldTracePdfText() {
    return (process.env.PDF_TEXT_TRACE === "1" ||
        process.env.NODE_ENV === "development" ||
        process.env.NODE_ENV === "test");
}
function pushPdfTextTrace(trace) {
    if (!shouldTracePdfText())
        return;
    pdfTextTraces.push(trace);
}
/** Last drawn first-page logo width (for tests). */
export let lastFirstPageLogoWidth = 0;
/** Last drawn continuation logo width (for tests). */
export let lastContinuationLogoWidth = 0;
/** Last continuation divider Y (for tests). */
export let lastContinuationDividerY = 0;
/** Last continuation logo bottom Y (for tests). */
export let lastContinuationLogoBottom = 0;
function drawAccentRule(layout, y, width = 48) {
    layout.doc
        .moveTo(layout.left, y)
        .lineTo(layout.left + width, y)
        .strokeColor(PDF_COLORS.accent)
        .lineWidth(2)
        .stroke();
}
function drawLogo(layout, logoPath, x, y, targetWidth, maxHeight) {
    const doc = layout.doc;
    const aspect = 1200 / 1044;
    let width = targetWidth;
    let height = width / aspect;
    if (height > maxHeight) {
        height = maxHeight;
        width = height * aspect;
    }
    doc.image(logoPath, x, y, { width, height });
    return { width, height };
}
export function applyNarrativeStyle(doc) {
    doc
        .font(NARRATIVE_STYLE.font)
        .fontSize(NARRATIVE_STYLE.fontSize)
        .fillColor(NARRATIVE_STYLE.color);
}
export function applyBodyStyle(doc) {
    doc.font(PDF_FONTS.regular).fontSize(PDF_TYPE.body).fillColor(PDF_COLORS.ink);
}
function wrapNarrativeLines(doc, text, width) {
    applyNarrativeStyle(doc);
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    const pushHardBroken = (word) => {
        let rest = word;
        while (rest.length > 0) {
            let cut = rest.length;
            while (cut > 1 && doc.widthOfString(rest.slice(0, cut)) > width) {
                cut -= 1;
            }
            lines.push(rest.slice(0, cut));
            rest = rest.slice(cut);
        }
    };
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (doc.widthOfString(candidate) <= width) {
            current = candidate;
            continue;
        }
        if (current)
            lines.push(current);
        if (doc.widthOfString(word) > width) {
            pushHardBroken(word);
            current = "";
        }
        else {
            current = word;
        }
    }
    if (current)
        lines.push(current);
    return lines;
}
export function drawFirstPageHeader(layout, meta) {
    const doc = layout.doc;
    let y = PDF_PAGE.marginTop;
    if (meta.logoPath) {
        try {
            const size = drawLogo(layout, meta.logoPath, layout.left, y, PDF_PAGE.logoFirstWidth, PDF_PAGE.logoFirstMaxHeight);
            lastFirstPageLogoWidth = size.width;
            y += size.height + 14;
        }
        catch {
            lastFirstPageLogoWidth = 0;
            doc.fontSize(PDF_TYPE.brand).fillColor(PDF_COLORS.accent).text(PDF_BRAND.name, layout.left, y);
            y += 16;
        }
    }
    else {
        lastFirstPageLogoWidth = 0;
        doc.fontSize(PDF_TYPE.brand).fillColor(PDF_COLORS.accent).text(PDF_BRAND.name, layout.left, y, {
            width: layout.contentWidth,
            lineBreak: false,
        });
        y += 16;
    }
    doc
        .font(PDF_FONTS.bold)
        .fontSize(PDF_TYPE.title)
        .fillColor(PDF_COLORS.ink)
        .text(PDF_BRAND.reportTitle, layout.left, y, {
        width: layout.contentWidth,
        lineBreak: false,
    });
    y += 24;
    drawAccentRule(layout, y);
    y += 12;
    const metaLines = [
        `Client : ${safePdfText(meta.clientName)}`,
        `Complété le : ${safePdfText(meta.completedAtLabel)}`,
        `Questionnaire : ${safePdfText(meta.questionnaireVersion)}  ·  Règles : ${safePdfText(meta.rulesetVersion)}`,
        `Généré le : ${safePdfText(meta.generatedAtLabel)}`,
    ];
    doc.font(PDF_FONTS.regular).fontSize(PDF_TYPE.meta).fillColor(PDF_COLORS.muted);
    for (const line of metaLines) {
        doc.text(line, layout.left, y, {
            width: layout.contentWidth,
            lineBreak: false,
            height: 11,
        });
        y += 11;
    }
    y += 6;
    doc
        .moveTo(layout.left, y)
        .lineTo(layout.right, y)
        .strokeColor(PDF_COLORS.line)
        .lineWidth(0.75)
        .stroke();
    y += 14;
    layout.applyFirstPageBodyTop(y);
    applyBodyStyle(doc);
    return y;
}
/**
 * Draws the reserved continuation header and parks the cursor at bodyTop (~92).
 * Compact header with optional section name; logo bottom stays above the divider.
 */
export function drawContinuationHeader(layout, meta, sectionName) {
    const doc = layout.doc;
    const cfg = CONTINUATION_HEADER;
    let logoBottom = cfg.logoY;
    if (meta.logoPath) {
        try {
            const size = drawLogo(layout, meta.logoPath, cfg.logoX, cfg.logoY, cfg.logoMaxWidth, cfg.logoMaxHeight);
            lastContinuationLogoWidth = size.width;
            logoBottom = cfg.logoY + size.height;
        }
        catch {
            lastContinuationLogoWidth = 0;
        }
    }
    else {
        lastContinuationLogoWidth = 0;
    }
    lastContinuationLogoBottom = logoBottom;
    doc
        .font(PDF_FONTS.regular)
        .fontSize(PDF_TYPE.small)
        .fillColor(PDF_COLORS.ink)
        .text(`${PDF_BRAND.reportTitleShort}  ·  ${safePdfText(meta.clientName)}`, cfg.titleX, cfg.titleY, {
        width: layout.right - cfg.titleX,
        lineBreak: false,
        height: 12,
        ellipsis: true,
    });
    if (sectionName) {
        doc
            .font(PDF_FONTS.bold)
            .fontSize(PDF_TYPE.small)
            .fillColor(PDF_COLORS.muted)
            .text(safePdfText(sectionName), cfg.titleX, cfg.sectionY, {
            width: layout.right - cfg.titleX,
            lineBreak: false,
            height: 11,
            ellipsis: true,
        });
    }
    const dividerY = Math.max(cfg.dividerY, logoBottom + 6);
    lastContinuationDividerY = dividerY;
    doc
        .moveTo(layout.left, dividerY)
        .lineTo(layout.right, dividerY)
        .strokeColor(PDF_COLORS.accent)
        .lineWidth(1.25)
        .stroke();
    const bodyTop = Math.max(cfg.bodyTop, dividerY + 10);
    layout.raiseBodyTop(bodyTop);
    applyBodyStyle(doc);
    applyNarrativeStyle(doc);
    return bodyTop;
}
/**
 * Unique entry point for content-driven page breaks.
 * Adds the page, draws the continuation header, resets body style, returns at bodyTop.
 */
export function addContinuationPage(layout, meta) {
    layout.addContinuationPage();
    // Drawer registered on layout already calls drawContinuationHeader; if not, draw here.
    if (layout.y < CONTINUATION_HEADER.bodyTop - 1) {
        drawContinuationHeader(layout, meta);
    }
    applyBodyStyle(layout.doc);
}
export function drawBufferedFooters(doc, opts) {
    const range = doc.bufferedPageRange();
    const total = Math.max(1, range.count);
    const footerY = PDF_PAGE.height - 24;
    const left = PDF_PAGE.marginX;
    const usable = PDF_PAGE.width - PDF_PAGE.marginX * 2;
    const col = usable / 3;
    const generated = safePdfText(opts.generatedAtLabel);
    const internal = opts.internalLabel ?? PDF_BRAND.internalUse;
    for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        const savedMargins = {
            top: doc.page.margins.top,
            bottom: doc.page.margins.bottom,
            left: doc.page.margins.left,
            right: doc.page.margins.right,
        };
        doc.page.margins = { top: 0, left: 0, bottom: 0, right: 0 };
        doc.save();
        doc
            .moveTo(left, footerY - 8)
            .lineTo(PDF_PAGE.width - PDF_PAGE.marginX, footerY - 8)
            .strokeColor(PDF_COLORS.line)
            .lineWidth(0.6)
            .stroke();
        doc.font(PDF_FONTS.regular).fontSize(PDF_TYPE.footer).fillColor(PDF_COLORS.muted);
        doc.text(generated, left, footerY, {
            width: col,
            align: "left",
            lineBreak: false,
            height: 10,
        });
        doc.text(internal, left + col, footerY, {
            width: col,
            align: "center",
            lineBreak: false,
            height: 10,
        });
        doc.text(`Page ${i + 1} / ${total}`, left + col * 2, footerY, {
            width: col,
            align: "right",
            lineBreak: false,
            height: 10,
        });
        doc.restore();
        doc.page.margins = savedMargins;
    }
    applyBodyStyle(doc);
    return total;
}
export function drawSectionTitle(layout, title) {
    const text = safePdfText(title);
    // Set context before ensureSpace: a page break here must name this title,
    // because it will be the first content block on the continuation page.
    layout.setPageSectionContext(text);
    layout.addSectionWithFirstBlock(20, 26);
    layout.beginBlock(`section:${text}`);
    layout.setFont(true, PDF_TYPE.section);
    layout.doc.fillColor(PDF_COLORS.ink);
    layout.doc.text(text, layout.left, layout.y, {
        width: layout.contentWidth,
        lineBreak: false,
        height: 14,
    });
    layout.y += 13;
    layout.doc
        .moveTo(layout.left, layout.y)
        .lineTo(layout.left + 36, layout.y)
        .strokeColor(PDF_COLORS.accent)
        .lineWidth(1.5)
        .stroke();
    layout.y += PDF_SPACE.afterTitle;
    applyBodyStyle(layout.doc);
}
/** Discrete continuation reminder under the header band. */
export function drawContinuationReminder(layout, label) {
    layout.beginBlock(`reminder:${label}`);
    layout.setFont(false, PDF_TYPE.small);
    layout.doc.fillColor(PDF_COLORS.muted);
    layout.doc.text(safePdfText(label), layout.left, layout.y, {
        width: layout.contentWidth,
        lineBreak: false,
        height: 11,
    });
    layout.y += 14;
    applyBodyStyle(layout.doc);
}
/**
 * Controlled narrative paragraph: never lets PDFKit auto-continue text onto a
 * new page (headers would steal the active font).
 */
export function addNarrativeParagraph(layout, text, section = "coach-narrative") {
    const value = safePdfText(text).trim();
    if (!value)
        return;
    applyNarrativeStyle(layout.doc);
    const lines = wrapNarrativeLines(layout.doc, value, layout.contentWidth);
    if (lines.length === 0)
        return;
    applyNarrativeStyle(layout.doc);
    const lineStep = layout.doc.currentLineHeight(true) + NARRATIVE_STYLE.lineGap;
    const paragraphHeight = lines.length * lineStep + NARRATIVE_STYLE.paragraphGap;
    // A short uncertainty/narrative paragraph is easier to scan when whole.
    if (paragraphHeight <= 120)
        layout.ensureSpace(paragraphHeight);
    else
        layout.ensureSpace(lineStep);
    layout.beginBlock(`narrative:${section}`);
    applyNarrativeStyle(layout.doc);
    let wroteContinuationReminder = false;
    for (const line of lines) {
        applyNarrativeStyle(layout.doc);
        if (layout.remainingHeight() < lineStep) {
            layout.addContinuationPage();
            applyNarrativeStyle(layout.doc);
            if (!wroteContinuationReminder && section === "coach-narrative") {
                drawContinuationReminder(layout, "Portrait narratif - suite");
                wroteContinuationReminder = true;
                applyNarrativeStyle(layout.doc);
            }
            else if (!wroteContinuationReminder && section === "nutrition-narrative") {
                drawContinuationReminder(layout, "Portrait alimentaire - suite");
                wroteContinuationReminder = true;
                applyNarrativeStyle(layout.doc);
            }
        }
        layout.beginBlock(`narrative-line:${section}`);
        const y = layout.y;
        layout.doc.text(line, layout.left, y, {
            width: layout.contentWidth,
            align: "left",
            lineBreak: false,
            height: lineStep,
        });
        pushPdfTextTrace({
            section,
            page: layout.currentPageIndex + 1,
            font: NARRATIVE_STYLE.font,
            fontSize: NARRATIVE_STYLE.fontSize,
            lineGap: NARRATIVE_STYLE.lineGap,
        });
        layout.y = y + lineStep;
    }
    layout.moveDown(NARRATIVE_STYLE.paragraphGap);
    applyNarrativeStyle(layout.doc);
}
/** Tracked style fingerprint for tests. */
export function getNarrativeStyleFingerprint() {
    return JSON.stringify({
        font: NARRATIVE_FONT,
        size: NARRATIVE_FONT_SIZE,
        lineGap: NARRATIVE_LINE_GAP,
        color: NARRATIVE_COLOR,
        style: NARRATIVE_STYLE,
    });
}
