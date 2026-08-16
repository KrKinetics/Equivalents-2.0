import fs from "fs";
import path from "path";
import { CONTINUATION_HEADER, PDF_FONTS, PDF_PAGE, PDF_TYPE, continuationPageLayout, firstPageLayout, } from "../theme.mjs";
export function resolvePdfAsset(relativeCandidates) {
    const root = /* turbopackIgnore: true */ process.cwd();
    for (const rel of relativeCandidates) {
        const absolute = path.isAbsolute(rel) ? rel : path.join(root, rel);
        if (fs.existsSync(absolute))
            return absolute;
    }
    return null;
}
export function resolveFontFile(filename) {
    const root = /* turbopackIgnore: true */ process.cwd();
    const candidates = [
        path.join(root, "src/coach/motivation/lib/pdf/fonts", filename),
        path.join(root, "public/fonts", filename),
        path.join(import.meta.dirname, "../fonts", filename),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    throw new Error(`Police PDF introuvable: ${filename}`);
}
/** Normalize text for PDFKit while preserving French accents. */
export function safePdfText(value) {
    if (value === null || value === undefined)
        return "";
    return String(value)
        .replace(/\r\n/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/\u2022/g, "•")
        .replace(/[—–]/g, "–")
        .replace(/…/g, "...")
        .replace(/\t/g, " ");
}
let contentBlockTraces = [];
export function clearContentBlockTraces() {
    contentBlockTraces = [];
}
export function getContentBlockTraces() {
    return [...contentBlockTraces];
}
export function assertContentBelowHeader(input) {
    contentBlockTraces.push({
        page: input.page,
        blockName: input.blockName,
        blockTop: input.blockTop,
        minimumTop: input.minimumTop,
    });
    if (input.blockTop + 0.5 < input.minimumTop) {
        const message = `PDF layout overlap: "${input.blockName}" starts at y=${input.blockTop.toFixed(1)} but bodyTop=${input.minimumTop} (page ${input.page})`;
        if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
            throw new Error(message);
        }
        console.error(message);
    }
}
/**
 * Layout cursor for US-Letter PDFKit documents.
 * Content never enters the reserved header or footer bands.
 */
export class PdfLayout {
    constructor(doc) {
        this.pageIndex = 0;
        this.continuationDrawer = null;
        this.suppressContinuation = false;
        this.pageSectionContext = "";
        this.doc = doc;
        this.left = PDF_PAGE.marginX;
        this.right = PDF_PAGE.width - PDF_PAGE.marginX;
        this.contentWidth = this.right - this.left;
        this.contentBottom = PDF_PAGE.height - PDF_PAGE.footerHeight;
        this.pageLayout = firstPageLayout(PDF_PAGE.marginTop);
    }
    get y() {
        return this.doc.y;
    }
    set y(value) {
        this.doc.y = Math.max(value, this.pageLayout.bodyTop);
    }
    get bodyTop() {
        return this.pageLayout.bodyTop;
    }
    get currentPageLayout() {
        return this.pageLayout;
    }
    get currentPageIndex() {
        return this.pageIndex;
    }
    setContinuationDrawer(drawer) {
        this.continuationDrawer = drawer;
    }
    /** Section used by continuation headers for the next content block. */
    setPageSectionContext(section) {
        this.pageSectionContext = section;
    }
    getPageSectionContext() {
        return this.pageSectionContext;
    }
    setSuppressContinuation(value) {
        this.suppressContinuation = value;
    }
    remainingHeight() {
        return this.contentBottom - this.doc.y;
    }
    /** Clamp cursor into the safe body band. */
    ensureBodyTop() {
        if (this.doc.y < this.pageLayout.bodyTop) {
            this.doc.y = this.pageLayout.bodyTop;
        }
    }
    /** Mark the start of a content block for overlap assertions. */
    beginBlock(blockName) {
        this.ensureBodyTop();
        assertContentBelowHeader({
            page: this.pageIndex + 1,
            blockName,
            blockTop: this.doc.y,
            minimumTop: this.pageLayout.bodyTop,
        });
    }
    applyFirstPageBodyTop(bodyTop) {
        this.pageLayout = firstPageLayout(bodyTop);
        this.doc.y = bodyTop;
    }
    /** Raise bodyTop on the current continuation page if the header grew. */
    raiseBodyTop(bodyTop) {
        if (bodyTop <= this.pageLayout.bodyTop) {
            this.doc.y = Math.max(this.doc.y, this.pageLayout.bodyTop);
            return;
        }
        this.pageLayout = {
            ...this.pageLayout,
            bodyTop,
            headerBottom: Math.min(this.pageLayout.headerBottom, bodyTop - 8),
        };
        this.doc.y = bodyTop;
    }
    /** Sync when a continuation page was added (via addContinuationPage). */
    noteContinuationPage() {
        this.pageIndex += 1;
        this.pageLayout = continuationPageLayout();
    }
    /**
     * Create a continuation page with reserved header band.
     * Prefer this over raw doc.addPage() from content helpers.
     */
    addContinuationPage() {
        this.doc.addPage();
        this.noteContinuationPage();
        if (!this.suppressContinuation && this.continuationDrawer) {
            this.continuationDrawer(this);
        }
        else {
            this.doc.y = CONTINUATION_HEADER.bodyTop;
        }
    }
    /** @deprecated Use addContinuationPage — kept as alias for call sites. */
    addPage() {
        this.addContinuationPage();
    }
    /**
     * Ensure at least `needed` points remain above the footer.
     * Creates a continuation page when the next block cannot fit.
     */
    ensureSpace(needed) {
        this.ensureBodyTop();
        const usable = this.contentBottom - this.pageLayout.bodyTop;
        const minNeeded = Math.min(needed, usable - 8);
        if (this.doc.y + minNeeded > this.contentBottom) {
            this.addContinuationPage();
        }
    }
    /** Keep a title with at least `minBody` of following content. */
    ensureTitleWithBody(titleHeight, minBody) {
        this.ensureSpace(titleHeight + minBody);
    }
    /**
     * Ensure title never sits alone at the bottom of a page:
     * reserve titleHeight + firstBlockHeight before drawing.
     */
    addSectionWithFirstBlock(titleHeight, firstBlockHeight) {
        this.ensureSpace(titleHeight + firstBlockHeight);
    }
    moveDown(points) {
        this.doc.y += points;
    }
    setFont(bold = false, size = PDF_TYPE.body) {
        this.doc.font(bold ? PDF_FONTS.bold : PDF_FONTS.regular).fontSize(size);
    }
    heightOf(text, width = this.contentWidth, options) {
        return this.doc.heightOfString(safePdfText(text), { width, ...options });
    }
    text(value, x, y, options = {}) {
        const { bold = false, size = PDF_TYPE.body, color, ...rest } = options;
        this.setFont(bold, size);
        if (color)
            this.doc.fillColor(color);
        const text = safePdfText(value);
        this.doc.text(text, x, y, {
            width: rest.width ?? this.contentWidth,
            lineGap: rest.lineGap ?? 1.5,
            ...rest,
        });
        return this.doc.y;
    }
    addParagraph(value, options = {}) {
        const text = safePdfText(value).trim();
        if (!text)
            return;
        const width = options.width ?? this.contentWidth;
        const x = options.x ?? this.left;
        const size = options.size ?? PDF_TYPE.body;
        const color = options.color;
        const gapAfter = options.gapAfter ?? 4;
        this.beginBlock("paragraph");
        this.setFont(options.bold, size);
        if (color)
            this.doc.fillColor(color);
        // Write line-by-line to avoid PDFKit auto page-break stealing fonts.
        const words = text.split(/\s+/).filter(Boolean);
        let current = "";
        const lines = [];
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (this.doc.widthOfString(candidate) <= width)
                current = candidate;
            else {
                if (current)
                    lines.push(current);
                current = word;
            }
        }
        if (current)
            lines.push(current);
        const step = this.doc.currentLineHeight(true) + 1.5;
        const paragraphHeight = lines.length * step + gapAfter;
        // Short/medium paragraphs (< 8 lines) must stay whole — never split mid-sentence.
        if (lines.length > 0 && lines.length < 8) {
            this.ensureSpace(paragraphHeight);
        }
        else {
            this.ensureSpace(step * 2);
        }
        let wroteContinuation = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            this.setFont(options.bold, size);
            if (color)
                this.doc.fillColor(color);
            if (this.remainingHeight() < step) {
                // Never leave < 25% of a sentence alone on the previous page.
                const fractionLeft = i / lines.length;
                if (fractionLeft > 0 && fractionLeft < 0.25) {
                    this.addContinuationPage();
                }
                else {
                    this.addContinuationPage();
                }
                if (!wroteContinuation && lines.length >= 8) {
                    wroteContinuation = true;
                }
            }
            this.beginBlock("paragraph-line");
            const y = this.y;
            this.doc.text(line, x, y, { width, lineBreak: false, height: step });
            this.y = y + step;
        }
        this.moveDown(gapAfter);
    }
    addBulletList(items, options = {}) {
        const width = options.width ?? this.contentWidth;
        const x = options.x ?? this.left;
        for (const raw of items) {
            const item = safePdfText(raw).trim();
            if (!item)
                continue;
            const bullet = `•  ${item}`;
            this.beginBlock("bullet");
            this.setFont(false, options.size ?? PDF_TYPE.body);
            if (options.color)
                this.doc.fillColor(options.color);
            const h = Math.min(this.heightOf(bullet, width - 4), 80);
            this.ensureSpace(h + 4);
            this.doc.text(bullet, x, this.doc.y, {
                width,
                lineGap: 1.2,
            });
            this.moveDown(2);
        }
    }
}
