import { safePdfText } from "./components/layout.mjs";
import { formatFrenchScore } from "../format-score.mjs";
import { drawSectionTitle } from "./components/header-footer.mjs";
import { shouldRenderBodyHeading } from "./should-render-body-heading.mjs";
import { PDF_COLORS, PDF_FONTS, PDF_TYPE } from "./theme.mjs";
/** Letter page, marginX 44 → content ~524pt. Fixed absolute x within content. */
export const SCORE_TABLE_COLUMNS = [
    { key: "dimension", x: 44, width: 200, align: "left" },
    { key: "score", x: 244, width: 62, align: "right" },
    { key: "items", x: 306, width: 42, align: "center" },
    { key: "agreement", x: 348, width: 130, align: "left" },
    { key: "trend", x: 478, width: 90, align: "left" },
];
const ROW_H = 16;
const HEADER_H = 18;
const TITLE_H = 28;
function drawHeader(layout, y) {
    const doc = layout.doc;
    const width = SCORE_TABLE_COLUMNS.reduce((s, c) => s + c.width, 0);
    doc.save();
    doc.rect(SCORE_TABLE_COLUMNS[0].x, y, width, HEADER_H).fill(PDF_COLORS.tableHeaderBg);
    doc.restore();
    doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.white);
    const labels = ["Dimension", "Score / 100", "Items", "Cohérence", "Tendance"];
    SCORE_TABLE_COLUMNS.forEach((col, i) => {
        doc.text(labels[i], col.x + 3, y + 5, {
            width: col.width - 6,
            align: col.align,
            lineBreak: false,
            height: 11,
        });
    });
    return y + HEADER_H;
}
function drawRow(layout, row, y, alt) {
    const doc = layout.doc;
    const width = SCORE_TABLE_COLUMNS.reduce((s, c) => s + c.width, 0);
    if (alt) {
        doc.save();
        doc.rect(SCORE_TABLE_COLUMNS[0].x, y, width, ROW_H).fill(PDF_COLORS.tableAltRow);
        doc.restore();
    }
    doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.ink);
    const uncertain = row.trendMode === "uncertain";
    const cells = [
        row.label,
        row.score === null ? "—" : formatFrenchScore(row.score),
        String(row.itemCount),
        row.agreementLabel,
    ];
    SCORE_TABLE_COLUMNS.slice(0, 4).forEach((col, i) => {
        doc.text(safePdfText(cells[i]), col.x + 3, y + 4, {
            width: col.width - 6,
            align: col.align,
            lineBreak: false,
            height: 11,
        });
    });
    const trend = SCORE_TABLE_COLUMNS[4];
    const trendText = row.trendLabel ??
        (uncertain ? "Non établie" : null);
    if (trendText) {
        doc
            .font(PDF_FONTS.regular)
            .fontSize(7)
            .fillColor(PDF_COLORS.ink)
            .text(safePdfText(trendText), trend.x + 3, y + 4, {
            width: trend.width - 6,
            align: "left",
            lineBreak: false,
            height: 11,
        });
    }
    else {
        const barW = trend.width - 10;
        const value = row.score === null ? 0 : Math.max(0, Math.min(100, row.score));
        doc.save();
        doc.roundedRect(trend.x + 3, y + 6, barW, 5, 2).fill(PDF_COLORS.line);
        if (value > 0) {
            doc
                .roundedRect(trend.x + 3, y + 6, (barW * value) / 100, 5, 2)
                .fill(PDF_COLORS.accent);
        }
        doc.restore();
    }
    return y + ROW_H;
}
/**
 * Fixed-coordinate score table for pdf-layout-v3.1.
 * Never uses auto-wrapping column flow for cell text.
 * Strongly divergent rows use a readable uncertainty badge — mean is not treated as reliable.
 */
export function addScoreTableV31(params) {
    const { layout, title, scores, pageHeaderLabel } = params;
    if (scores.length === 0)
        return;
    layout.setPageSectionContext(pageHeaderLabel ?? title);
    const minBlock = TITLE_H + HEADER_H + ROW_H * Math.min(4, scores.length);
    if (layout.remainingHeight() < minBlock) {
        layout.addContinuationPage();
    }
    if (shouldRenderBodyHeading({
        pageHeaderLabel: pageHeaderLabel ?? layout.getPageSectionContext(),
        bodyHeading: title,
    })) {
        drawSectionTitle(layout, title);
    }
    layout.beginBlock(`table-v31:${title}`);
    let y = drawHeader(layout, layout.y);
    layout.y = y;
    for (const [index, row] of scores.entries()) {
        if (layout.remainingHeight() < ROW_H + 4) {
            layout.addContinuationPage();
            y = drawHeader(layout, layout.y);
            layout.y = y;
        }
        layout.beginBlock(`table-row-v31:${row.label}`);
        y = drawRow(layout, row, layout.y, index % 2 === 1);
        layout.y = y;
    }
    layout.y += 8;
    layout.doc.font(PDF_FONTS.regular).fontSize(PDF_TYPE.body).fillColor(PDF_COLORS.ink);
}
