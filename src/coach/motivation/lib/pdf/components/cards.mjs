import { safePdfText } from "./layout.mjs";
import { PDF_COLORS, PDF_SPACE, PDF_TYPE } from "../theme.mjs";
function measureCardHeight(layout, block, width) {
    layout.setFont(true, PDF_TYPE.small);
    let h = PDF_SPACE.cardPad * 2 + 11;
    if (block.body?.trim()) {
        layout.setFont(false, PDF_TYPE.body);
        h += layout.heightOf(block.body, width - PDF_SPACE.cardPad * 2) + 3;
    }
    for (const item of block.bullets ?? []) {
        if (!item.trim())
            continue;
        layout.setFont(false, PDF_TYPE.body);
        h += layout.heightOf(`•  ${item}`, width - PDF_SPACE.cardPad * 2) + 1;
    }
    return Math.max(h, 32);
}
function paintCardChrome(layout, x, y, width, height) {
    const doc = layout.doc;
    doc.save();
    // Default cards are deliberately quiet: pale fill and a left-side accent only.
    doc
        .roundedRect(x, y, width, height, PDF_SPACE.cardRadius)
        .fill(PDF_COLORS.paper);
    doc
        .moveTo(x + PDF_SPACE.cardBorder / 2, y + PDF_SPACE.cardRadius)
        .lineTo(x + PDF_SPACE.cardBorder / 2, y + height - PDF_SPACE.cardRadius)
        .strokeColor(PDF_COLORS.accent)
        .lineWidth(PDF_SPACE.accentBar)
        .stroke();
    doc.restore();
}
function fillCardContent(layout, block, x, y, width) {
    const innerX = x + PDF_SPACE.cardPad;
    const innerW = width - PDF_SPACE.cardPad * 2;
    let cy = y + PDF_SPACE.cardPad;
    layout.setFont(true, PDF_TYPE.small);
    layout.doc.fillColor(PDF_COLORS.accent);
    layout.doc.text(safePdfText(block.title), innerX, cy, {
        width: innerW,
        lineBreak: false,
        height: 11,
    });
    cy += 12;
    if (block.body?.trim()) {
        layout.setFont(false, PDF_TYPE.body);
        layout.doc.fillColor(PDF_COLORS.ink);
        layout.doc.text(safePdfText(block.body), innerX, cy, {
            width: innerW,
            lineGap: 1.1,
        });
        cy = layout.doc.y + 1;
    }
    for (const item of block.bullets ?? []) {
        const t = safePdfText(item).trim();
        if (!t)
            continue;
        layout.setFont(false, PDF_TYPE.body);
        layout.doc.fillColor(PDF_COLORS.ink);
        layout.doc.text(`•  ${t}`, innerX, cy, {
            width: innerW,
            lineGap: 1,
        });
        cy = layout.doc.y + 1;
    }
    return cy;
}
export function addCardSection(layout, block) {
    const width = layout.contentWidth;
    const height = measureCardHeight(layout, block, width);
    layout.ensureSpace(height + 6);
    layout.beginBlock(`card:${block.title}`);
    const y = layout.y;
    paintCardChrome(layout, layout.left, y, width, height);
    fillCardContent(layout, block, layout.left, y, width);
    layout.y = y + height + PDF_SPACE.sectionGap;
}
export function addCardGrid(layout, left, right) {
    const gap = PDF_SPACE.gridGap;
    const colW = (layout.contentWidth - gap) / 2;
    const leftH = measureCardHeight(layout, left, colW);
    const rightH = measureCardHeight(layout, right, colW);
    const maxH = Math.max(leftH, rightH);
    if (maxH > 140) {
        addCardSection(layout, left);
        addCardSection(layout, right);
        return;
    }
    layout.ensureSpace(maxH + 6);
    layout.beginBlock(`card-grid:${left.title}`);
    const y = layout.y;
    paintCardChrome(layout, layout.left, y, colW, maxH);
    paintCardChrome(layout, layout.left + colW + gap, y, colW, maxH);
    fillCardContent(layout, left, layout.left, y, colW);
    fillCardContent(layout, right, layout.left + colW + gap, y, colW);
    layout.y = y + maxH + PDF_SPACE.sectionGap;
}
export function beginNarrativeBanner(layout, title) {
    layout.ensureTitleWithBody(32, 36);
    layout.beginBlock(`banner:${title}`);
    const y = layout.y;
    const h = 26;
    layout.doc.save();
    layout.doc.roundedRect(layout.left, y, layout.contentWidth, h, 3).fill(PDF_COLORS.accentSoft);
    layout.doc.restore();
    layout.setFont(true, PDF_TYPE.section);
    layout.doc.fillColor(PDF_COLORS.accentDeep);
    layout.doc.text(safePdfText(title), layout.left + 10, y + 7, {
        width: layout.contentWidth - 20,
        lineBreak: false,
        height: 14,
    });
    layout.y = y + h + 6;
}
function measureAnswerBlock(layout, answer) {
    const question = safePdfText(answer.question);
    const value = safePdfText(answer.displayValue);
    const likertMatch = value.match(/^(\d+)\s*\/\s*(\d+)$/) || value.match(/^(\d+)\s+sur\s+(\d+)$/i);
    const kind = answer.kind === "likert" || likertMatch
        ? "likert"
        : answer.kind === "open"
            ? "open"
            : /^\d+$/.test(value.trim())
                ? "likert"
                : "open";
    layout.setFont(true, PDF_TYPE.answerCode);
    const codeH = 10;
    layout.setFont(false, PDF_TYPE.body);
    const questionH = layout.heightOf(question, layout.contentWidth) + 2;
    let answerH = 12;
    if (kind === "likert") {
        answerH = 12;
    }
    else {
        const boxPad = 6;
        const textW = layout.contentWidth - boxPad * 2;
        answerH = layout.heightOf(value || "—", textW) + boxPad * 2;
    }
    const spacing = kind === "likert" ? PDF_SPACE.likertGap : PDF_SPACE.answerGap;
    return {
        total: codeH + questionH + answerH + spacing + 4,
        codeH,
        questionH,
        answerH,
        kind,
    };
}
/**
 * Question + answer as an atomic block for short answers.
 * Long open answers may split only after code + question + ≥2 answer lines.
 */
export function addDirectAnswer(layout, answer) {
    const code = safePdfText(answer.code);
    const question = safePdfText(answer.question);
    let value = safePdfText(answer.displayValue);
    const measured = measureAnswerBlock(layout, answer);
    if (measured.kind === "likert" && /^\d+$/.test(value.trim())) {
        value = `${value.trim()} / 5`;
    }
    // Keep short blocks together (question must not orphan from its answer).
    if (measured.kind === "likert" || measured.total < 120) {
        layout.ensureSpace(measured.total);
    }
    else {
        // Long open: keep code + question + at least 2 lines of answer together.
        layout.setFont(false, PDF_TYPE.body);
        const twoLines = layout.doc.currentLineHeight(true) * 2 + 16;
        layout.ensureSpace(measured.codeH + measured.questionH + twoLines);
    }
    layout.beginBlock(`answer:${code}`);
    layout.setFont(true, PDF_TYPE.answerCode);
    layout.doc.fillColor(PDF_COLORS.accent);
    layout.doc.text(code, layout.left, layout.y, {
        width: layout.contentWidth,
        lineBreak: false,
        height: 10,
    });
    layout.y += 10;
    layout.setFont(false, PDF_TYPE.body);
    layout.doc.fillColor(PDF_COLORS.ink);
    layout.doc.text(question, layout.left, layout.y, {
        width: layout.contentWidth,
        lineGap: 1,
    });
    layout.y += 1;
    if (measured.kind === "likert") {
        const likertMatch = value.match(/^(\d+)\s*\/\s*(\d+)$/) || value.match(/^(\d+)\s+sur\s+(\d+)$/i);
        const label = likertMatch
            ? `Réponse : ${likertMatch[1]} / ${likertMatch[2]}`
            : `Réponse : ${value}`;
        layout.setFont(true, PDF_TYPE.body);
        layout.doc.fillColor(PDF_COLORS.inkMid);
        layout.doc.text(label, layout.left, layout.y, {
            width: layout.contentWidth,
            lineBreak: false,
            height: 11,
        });
        layout.y += 11;
        layout.doc
            .moveTo(layout.left, layout.y)
            .lineTo(layout.right, layout.y)
            .strokeColor(PDF_COLORS.line)
            .lineWidth(0.4)
            .stroke();
        layout.y += PDF_SPACE.likertGap;
    }
    else {
        const boxPad = 6;
        const textW = layout.contentWidth - boxPad * 2;
        layout.setFont(false, PDF_TYPE.body);
        const textH = layout.heightOf(value || "—", textW);
        const boxH = textH + boxPad * 2;
        // If remaining space is tiny, move before drawing the box.
        if (layout.remainingHeight() < Math.min(boxH, 40)) {
            layout.addContinuationPage();
        }
        const y = layout.y;
        const drawH = Math.min(boxH, layout.remainingHeight() - 4);
        layout.doc.save();
        layout.doc.roundedRect(layout.left, y, layout.contentWidth, Math.max(drawH, boxH), 3).fill(PDF_COLORS.paper);
        layout.doc.restore();
        layout.doc.fillColor(PDF_COLORS.ink);
        layout.doc.text(value || "—", layout.left + boxPad, y + boxPad, {
            width: textW,
            lineGap: 1.1,
        });
        layout.y = Math.max(layout.doc.y, y + boxH) + PDF_SPACE.answerGap;
    }
}
export function measureDirectAnswerHeight(layout, answer) {
    return measureAnswerBlock(layout, answer).total;
}
