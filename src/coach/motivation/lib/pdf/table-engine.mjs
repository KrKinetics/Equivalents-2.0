import { safePdfText } from "./components/layout.mjs";
import { drawSectionTitle } from "./components/header-footer.mjs";
import { PDF_COLORS, PDF_FONTS } from "./theme.mjs";
/**
 * Continuation headings must only render when at least one real block of the
 * section is present on the page — never a lone orphan title.
 */
export function shouldRenderContinuationHeading(params) {
    return params.blocksOnPage.some((block) => block.sectionId === params.sectionId ||
        block.sectionKey === params.sectionId ||
        (block.kind !== "heading" &&
            block.kind !== "title" &&
            (block.title === params.sectionId ||
                block.sectionKey?.includes(params.sectionId))));
}
/** Resolve the page header from the first real content block on that page. */
export function resolvePageHeaderLabel(firstBlockOnPage) {
    const key = `${firstBlockOnPage.sectionKey ?? ""} ${firstBlockOnPage.sectionId ?? ""} ${firstBlockOnPage.title ?? ""} ${firstBlockOnPage.kind}`.toLowerCase();
    if (key.includes("entrevue") || key.includes("constat") || key.includes("checklist")) {
        return "Questions d'entrevue et constats";
    }
    if (key.includes("aliment") || key.includes("nutrition")) {
        return "Analyse alimentaire";
    }
    if (key.includes("objectif") || key.includes("obstacle")) {
        return "Objectifs et obstacles";
    }
    if (key.includes("plan") || key.includes("semaine")) {
        return "Plan d'accompagnement — 4 semaines";
    }
    if (key.includes("annexe") || key.includes("réponse") || key.includes("reponse")) {
        return "Réponses directes du client";
    }
    return (firstBlockOnPage.title?.replace(/\s*-\s*alimentation$/i, "").trim() ||
        "Rapport coach");
}
export function measurePdfTableRow(params) {
    const { layout, row, columns, fontSize } = params;
    layout.doc.font(PDF_FONTS.regular).fontSize(fontSize);
    const heights = columns.map((col) => layout.doc.heightOfString(safePdfText(row.cells[col.key] ?? ""), {
        width: col.width - 6,
        lineGap: 1,
    }));
    return Math.max(...heights, 14) + 6;
}
export function drawPdfTableHeader(params) {
    const { layout, columns, y, height } = params;
    const left = columns[0].x;
    const width = columns.reduce((sum, c) => sum + c.width, 0);
    layout.doc.save();
    layout.doc.rect(left, y, width, height).fill(PDF_COLORS.tableHeaderBg);
    layout.doc.restore();
    layout.doc.font(PDF_FONTS.bold).fontSize(7).fillColor(PDF_COLORS.white);
    for (const col of columns) {
        const textH = layout.doc.heightOfString(col.label, {
            width: col.width - 6,
            lineGap: 0,
        });
        const textY = y + Math.max(2, (height - Math.min(textH, height - 4)) / 2);
        // Absolute Y — never inherit advanced doc.y from previous cell.
        layout.doc.text(col.label, col.x + 3, textY, {
            width: col.width - 6,
            align: col.align,
            lineBreak: false,
            height: height - 4,
        });
    }
}
export function drawPdfTableRow(params) {
    const { layout, row, columns, y, height, fontSize = 7.5 } = params;
    layout.doc.font(PDF_FONTS.regular).fontSize(fontSize).fillColor(PDF_COLORS.ink);
    for (const col of columns) {
        layout.doc.text(safePdfText(row.cells[col.key] ?? ""), col.x + 3, y + 2, {
            width: col.width - 6,
            align: col.align,
            lineGap: 1,
            height: height - 3,
        });
    }
}
/**
 * Draw a titled table. Moves title+header+first row together when needed.
 */
export function drawPdfTable(params) {
    const { layout, title, columns, rows, headerHeight = 22, sectionTitleHeight = 28, } = params;
    if (rows.length === 0)
        return;
    const firstRowH = measurePdfTableRow({
        layout,
        row: rows[0],
        columns,
        fontSize: 7.5,
    });
    const blockMin = sectionTitleHeight + headerHeight + firstRowH + 8;
    // Never draw a section title alone: move title+header+first row together.
    if (layout.remainingHeight() < blockMin) {
        layout.addContinuationPage();
    }
    if (layout.remainingHeight() < blockMin) {
        // Still insufficient after break — skip orphan title entirely.
        return;
    }
    if (!shouldRenderContinuationHeading({
        sectionId: title,
        blocksOnPage: [
            { kind: "table-row", sectionId: title, title },
            { kind: "table-header", sectionId: title, title },
        ],
    })) {
        return;
    }
    layout.setPageSectionContext(resolvePageHeaderLabel({ kind: "table", sectionId: title, title }));
    drawSectionTitle(layout, title);
    const drawHeader = () => {
        const y = layout.y;
        drawPdfTableHeader({ layout, columns, y, height: headerHeight });
        layout.y = y + headerHeight;
    };
    drawHeader();
    for (const row of rows) {
        const rowH = measurePdfTableRow({ layout, row, columns, fontSize: 7.5 });
        if (layout.remainingHeight() < rowH + 2) {
            layout.addContinuationPage();
            drawHeader();
        }
        layout.beginBlock(`table-row:${row.id}`);
        const y = layout.y;
        drawPdfTableRow({ layout, row, columns, y, height: rowH });
        layout.y = y + rowH;
    }
    layout.y += 4;
}
