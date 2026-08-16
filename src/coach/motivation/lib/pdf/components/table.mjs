import { safePdfText } from "./layout.mjs";
import { drawSectionTitle } from "./header-footer.mjs";
import { PDF_COLORS, PDF_SPACE, PDF_TYPE } from "../theme.mjs";
const COLS = [
    { key: "dimension", width: 190, align: "left" },
    { key: "score", width: 68, align: "right" },
    { key: "items", width: 48, align: "right" },
    { key: "confidence", width: 72, align: "right" },
    { key: "bar", width: 96, align: "left" },
];
function drawTableHeader(layout, y) {
    const doc = layout.doc;
    const h = PDF_SPACE.tableHeaderH;
    doc.save();
    doc.rect(layout.left, y, layout.contentWidth, h).fill(PDF_COLORS.tableHeaderBg);
    doc.restore();
    layout.setFont(true, PDF_TYPE.table);
    doc.fillColor(PDF_COLORS.white);
    let x = layout.left + 6;
    const labels = ["Dimension", "Score / 100", "Items", "Couverture", "Tendance"];
    COLS.forEach((col, i) => {
        doc.text(labels[i], x, y + 4, {
            width: col.width - 8,
            align: col.align,
            lineBreak: false,
            height: 11,
        });
        x += col.width;
    });
    return y + h;
}
function drawScoreBar(layout, x, y, width, value) {
    if (value === null || Number.isNaN(value))
        return;
    const clamped = Math.max(0, Math.min(100, value));
    const barH = 5;
    const barY = y + 5;
    layout.doc.save();
    layout.doc.roundedRect(x, barY, width, barH, 2).fill(PDF_COLORS.line);
    if (clamped > 0) {
        layout.doc.roundedRect(x, barY, (width * clamped) / 100, barH, 2).fill(PDF_COLORS.accent);
    }
    layout.doc.restore();
}
function drawRow(layout, row, y, alt) {
    const h = PDF_SPACE.tableRowH;
    const doc = layout.doc;
    if (alt) {
        doc.save();
        doc.rect(layout.left, y, layout.contentWidth, h).fill(PDF_COLORS.tableAltRow);
        doc.restore();
    }
    layout.setFont(false, PDF_TYPE.table);
    doc.fillColor(PDF_COLORS.ink);
    let x = layout.left + 6;
    const cells = [row.dimension, row.score, row.items, row.confidence];
    COLS.slice(0, 4).forEach((col, i) => {
        doc.text(safePdfText(cells[i]), x, y + 3, {
            width: col.width - 8,
            align: col.align,
            lineBreak: false,
            height: 11,
        });
        x += col.width;
    });
    drawScoreBar(layout, x, y, COLS[4].width - 10, row.scoreValue);
    return y + h;
}
/**
 * Score table that refuses to start with only header+1 row of space,
 * repeats headers on continuation, and never splits a row.
 */
export function addScoreTable(layout, rows, options) {
    if (rows.length === 0)
        return;
    const title = options?.title ?? "Scores calculés";
    const continuationTitle = options?.continuationTitle ?? `${title} - suite`;
    const minRows = Math.min(3, rows.length);
    const titleBlock = 22;
    const neededToStart = titleBlock + PDF_SPACE.tableHeaderH + PDF_SPACE.tableRowH * minRows + 8;
    layout.beginBlock(`table:${title}`);
    if (layout.remainingHeight() < neededToStart) {
        layout.addContinuationPage();
    }
    drawSectionTitle(layout, title);
    layout.beginBlock(`table-header:${title}`);
    layout.y = drawTableHeader(layout, layout.y);
    rows.forEach((row, index) => {
        if (layout.y + PDF_SPACE.tableRowH > layout.contentBottom) {
            layout.addContinuationPage();
            drawContinuationReminderSafe(layout, continuationTitle);
            layout.beginBlock(`table-header:${continuationTitle}`);
            layout.y = drawTableHeader(layout, layout.y);
        }
        layout.beginBlock(`table-row:${title}`);
        layout.y = drawRow(layout, row, layout.y, index % 2 === 1);
    });
    layout.doc
        .moveTo(layout.left, layout.y)
        .lineTo(layout.right, layout.y)
        .strokeColor(PDF_COLORS.line)
        .lineWidth(0.6)
        .stroke();
    layout.y += PDF_SPACE.sectionGap;
}
function drawContinuationReminderSafe(layout, label) {
    layout.beginBlock(`reminder:${label}`);
    layout.setFont(false, PDF_TYPE.small);
    layout.doc.fillColor(PDF_COLORS.muted);
    layout.doc.text(label, layout.left, layout.y, {
        width: layout.contentWidth,
        lineBreak: false,
        height: 11,
    });
    layout.y += 14;
}
/** Minimum vertical space required before starting a score table (for tests). */
export function scoreTableMinStartHeight(rowCount) {
    const minRows = Math.min(3, Math.max(1, rowCount));
    return 22 + PDF_SPACE.tableHeaderH + PDF_SPACE.tableRowH * minRows + 8;
}
