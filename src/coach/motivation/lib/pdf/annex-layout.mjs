import { safePdfText } from "./components/layout.mjs";
import { PDF_COLORS, PDF_FONTS, PDF_SPACE, PDF_TYPE } from "./theme.mjs";
function rectanglesOverlap(a, b, pad = 0.5) {
    if (a.page !== b.page)
        return false;
    return !(a.x + a.width <= b.x + pad ||
        b.x + b.width <= a.x + pad ||
        a.y + a.height <= b.y + pad ||
        b.y + b.height <= a.y + pad);
}
export function assertNoLayoutCollisions(rects) {
    for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            if (rectanglesOverlap(a, b)) {
                throw new Error(`PDF layout collision: "${a.id}" overlaps "${b.id}" on page ${a.page}`);
            }
        }
    }
}
export function measureAnswerBlock(layout, answer, width) {
    const question = safePdfText(answer.questionText);
    const value = safePdfText(answer.displayValue);
    const answerType = answer.isOpenAnswer
        ? "open"
        : answer.isShortLikert
            ? "likert"
            : "other";
    layout.doc.font(PDF_FONTS.bold).fontSize(PDF_TYPE.answerCode);
    const codeH = 10;
    layout.doc.font(PDF_FONTS.regular).fontSize(8.5);
    const questionH = layout.doc.heightOfString(question, { width, lineGap: 1 }) + 2;
    let answerH = 12;
    if (answerType === "open" || answerType === "other") {
        const boxPad = 5;
        layout.doc.font(PDF_FONTS.regular).fontSize(PDF_TYPE.body);
        answerH =
            layout.doc.heightOfString(value || "—", {
                width: width - boxPad * 2,
                lineGap: 1,
            }) +
                boxPad * 2;
    }
    const gap = answerType === "likert" ? PDF_SPACE.likertGap : PDF_SPACE.answerGap;
    return { height: codeH + questionH + answerH + gap + 2, answerType };
}
export function drawAnswerBlock(layout, answer, box, answerType) {
    const doc = layout.doc;
    const code = safePdfText(answer.questionCode);
    const question = safePdfText(answer.questionText);
    const value = safePdfText(answer.displayValue);
    let cy = box.y;
    doc.font(PDF_FONTS.bold).fontSize(PDF_TYPE.answerCode).fillColor(PDF_COLORS.accent);
    doc.text(code, box.x, cy, {
        width: box.width,
        lineBreak: false,
        height: 10,
    });
    cy += 10;
    doc.font(PDF_FONTS.regular).fontSize(8.5).fillColor(PDF_COLORS.ink);
    doc.text(question, box.x, cy, { width: box.width, lineGap: 1 });
    cy = doc.y + 2;
    if (answerType === "likert") {
        doc.font(PDF_FONTS.bold).fontSize(8.5).fillColor(PDF_COLORS.inkMid);
        doc.text(`Réponse : ${value}`, box.x, cy, {
            width: box.width,
            lineBreak: false,
            height: 10,
        });
    }
    else {
        const boxPad = 5;
        const textW = box.width - boxPad * 2;
        doc.save();
        doc
            .roundedRect(box.x, cy, box.width, Math.max(16, box.y + box.height - cy - 2), 3)
            .fill(PDF_COLORS.paper);
        doc.restore();
        doc.font(PDF_FONTS.regular).fontSize(PDF_TYPE.body).fillColor(PDF_COLORS.ink);
        doc.text(value || "—", box.x + boxPad, cy + boxPad, {
            width: textW,
            lineGap: 1,
        });
    }
    return {
        id: `answer:${code}`,
        questionCode: answer.questionCode,
        questionText: answer.questionText,
        answerText: answer.displayValue,
        answerType,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        page: layout.currentPageIndex + 1,
    };
}
/**
 * Two columns ONLY as synchronized rows.
 * Plans with optional rebalance (tighter rowGap) before drawing so the last
 * page is not left nearly empty when content can fit earlier.
 */
export function drawSynchronizedAnswerRows(layout, answers, options = {}) {
    const gap = options.gap ?? 12;
    const baseRowGap = options.rowGap ?? 6;
    const colW = (layout.contentWidth - gap) / 2;
    const bodyTop = layout.currentPageLayout.bodyTop;
    const bodyBottom = layout.currentPageLayout.bodyBottom;
    const usableHeight = bodyBottom - bodyTop;
    const planned = [];
    for (let i = 0; i < answers.length; i += 2) {
        const left = answers[i];
        const right = answers[i + 1];
        const leftM = measureAnswerBlock(layout, left, colW);
        const rightM = right
            ? measureAnswerBlock(layout, right, colW)
            : { height: 0, answerType: "likert" };
        planned.push({
            left,
            right,
            leftType: leftM.answerType,
            rightType: rightM.answerType,
            rowHeight: Math.max(leftM.height, rightM.height, 28),
        });
    }
    const simulate = (rowGap) => {
        let page = layout.currentPageIndex + 1;
        let y = layout.y;
        const pageUsed = new Map();
        for (const row of planned) {
            const need = row.rowHeight + rowGap;
            if (y + need > bodyBottom) {
                page += 1;
                y = bodyTop;
            }
            pageUsed.set(page, Math.max(pageUsed.get(page) ?? 0, y + row.rowHeight - bodyTop));
            y += need;
        }
        const pages = [...pageUsed.keys()].sort((a, b) => a - b);
        const lastPage = pages[pages.length - 1] ?? page;
        const used = pageUsed.get(lastPage) ?? 0;
        return {
            pageCount: pages.length,
            lastFill: used / usableHeight,
            lastPage,
        };
    };
    let rowGap = baseRowGap;
    let rebalanced = false;
    let sim = simulate(rowGap);
    // Prefer fewer annex pages when tightening gaps is enough (avoids a sparse last page).
    if (sim.pageCount > 1 && planned.length >= 4) {
        for (const candidate of [5, 4, 3, 2, 1]) {
            if (candidate >= rowGap)
                continue;
            const next = simulate(candidate);
            if (next.pageCount < sim.pageCount || (sim.lastFill < 0.25 && next.lastFill >= 0.25)) {
                rowGap = candidate;
                sim = next;
                rebalanced = true;
                if (next.pageCount === 1)
                    break;
            }
        }
    }
    const blocks = [];
    const rectangles = [];
    const rowSyncEvents = [];
    const pageContentHeight = new Map();
    const recordFill = (page, yEnd) => {
        const used = Math.max(0, yEnd - layout.currentPageLayout.bodyTop);
        const usable = layout.currentPageLayout.bodyBottom - layout.currentPageLayout.bodyTop;
        pageContentHeight.set(page, Math.max(pageContentHeight.get(page) ?? 0, used / usable));
    };
    for (const row of planned) {
        layout.ensureSpace(row.rowHeight + rowGap);
        layout.beginBlock(`annex-row:${row.left.questionCode}`);
        const rowY = layout.y;
        const page = layout.currentPageIndex + 1;
        const leftBlock = drawAnswerBlock(layout, row.left, { x: layout.left, y: rowY, width: colW, height: row.rowHeight }, row.leftType);
        blocks.push(leftBlock);
        rectangles.push({
            id: leftBlock.id,
            page,
            x: leftBlock.x,
            y: leftBlock.y,
            width: leftBlock.width,
            height: leftBlock.height,
        });
        if (row.right) {
            const rightBlock = drawAnswerBlock(layout, row.right, {
                x: layout.left + colW + gap,
                y: rowY,
                width: colW,
                height: row.rowHeight,
            }, row.rightType ?? "likert");
            blocks.push(rightBlock);
            rectangles.push({
                id: rightBlock.id,
                page,
                x: rightBlock.x,
                y: rightBlock.y,
                width: rightBlock.width,
                height: rightBlock.height,
            });
        }
        rowSyncEvents.push({
            leftCode: row.left.questionCode,
            rightCode: row.right?.questionCode,
            rowHeight: row.rowHeight,
            y: rowY,
            page,
        });
        layout.y = rowY + row.rowHeight + rowGap;
        recordFill(page, layout.y);
    }
    const pageFillRatios = {};
    const pageFillMetrics = [];
    for (const [page, ratio] of pageContentHeight) {
        pageFillRatios[page] = ratio;
        pageFillMetrics.push({
            page,
            contentTop: bodyTop,
            contentBottom: bodyBottom,
            usableHeight,
            usedHeight: ratio * usableHeight,
            fillRatio: ratio,
        });
    }
    assertNoLayoutCollisions(rectangles);
    return {
        blocks,
        rectangles,
        pageFillRatios,
        pageFillMetrics,
        rebalanced,
        rowSyncEvents,
    };
}
export function drawFullWidthAnswerBlocks(layout, answers) {
    const blocks = [];
    const rectangles = [];
    const pageFillRatios = {};
    const pageFillMetrics = [];
    const rowSyncEvents = [];
    for (const answer of answers) {
        const measured = measureAnswerBlock(layout, answer, layout.contentWidth);
        // Keep code + question + ≥2 answer lines together when possible.
        const keepTogether = Math.min(measured.height, 72);
        if (layout.remainingHeight() < keepTogether) {
            layout.addContinuationPage();
        }
        layout.beginBlock(`annex-open:${answer.questionCode}`);
        const y = layout.y;
        const page = layout.currentPageIndex + 1;
        const height = measured.height;
        const block = drawAnswerBlock(layout, answer, { x: layout.left, y, width: layout.contentWidth, height }, measured.answerType);
        blocks.push(block);
        rectangles.push({
            id: block.id,
            page,
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
        });
        layout.y = y + height;
        const usable = layout.currentPageLayout.bodyBottom - layout.currentPageLayout.bodyTop;
        const used = Math.max(0, layout.y - layout.currentPageLayout.bodyTop);
        pageFillRatios[page] = Math.max(pageFillRatios[page] ?? 0, used / usable);
    }
    for (const [page, ratio] of Object.entries(pageFillRatios)) {
        const p = Number(page);
        const usable = layout.currentPageLayout.bodyBottom - layout.currentPageLayout.bodyTop;
        pageFillMetrics.push({
            page: p,
            contentTop: layout.currentPageLayout.bodyTop,
            contentBottom: layout.currentPageLayout.bodyBottom,
            usableHeight: usable,
            usedHeight: ratio * usable,
            fillRatio: ratio,
        });
    }
    assertNoLayoutCollisions(rectangles);
    return {
        blocks,
        rectangles,
        pageFillRatios,
        pageFillMetrics,
        rebalanced: false,
        rowSyncEvents,
    };
}
export function mergeAnnexTraces(...traces) {
    const merged = {
        blocks: [],
        rectangles: [],
        pageFillRatios: {},
        pageFillMetrics: [],
        rebalanced: false,
        rowSyncEvents: [],
    };
    for (const t of traces) {
        merged.blocks.push(...t.blocks);
        merged.rectangles.push(...t.rectangles);
        merged.rowSyncEvents.push(...t.rowSyncEvents);
        merged.pageFillMetrics.push(...(t.pageFillMetrics ?? []));
        merged.rebalanced = merged.rebalanced || t.rebalanced;
        for (const [page, ratio] of Object.entries(t.pageFillRatios)) {
            const p = Number(page);
            merged.pageFillRatios[p] = Math.max(merged.pageFillRatios[p] ?? 0, ratio);
        }
    }
    assertNoLayoutCollisions(merged.rectangles);
    return merged;
}
export { rectanglesOverlap };
