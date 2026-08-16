import { assertValidUnicode, collectMojibakeSamples } from "./unicode-guard.mjs";
import { assertNoLayoutCollisions } from "./annex-layout.mjs";
import { getContentBlockTraces } from "./components/layout.mjs";
/**
 * Validate a generated PDF buffer before export.
 * Checks: unicode, collisions, orphan headings, nearly empty pages, %PDF- magic.
 */
export function validateGeneratedPdf(input) {
    const issues = [];
    if (!input.buffer.length || input.buffer.subarray(0, 5).toString() !== "%PDF-") {
        issues.push({
            code: "invalid_pdf",
            message: "Le buffer ne commence pas par %PDF-.",
        });
    }
    try {
        assertValidUnicode(input.flattenedText, "PDF");
    }
    catch (err) {
        const samples = collectMojibakeSamples(input.flattenedText).join(" | ");
        issues.push({
            code: "unicode",
            message: `${err instanceof Error ? err.message : String(err)}${samples ? ` Exemples: ${samples}` : ""}`,
        });
    }
    if (input.annexTrace) {
        try {
            assertNoLayoutCollisions(input.annexTrace.rectangles);
        }
        catch (err) {
            issues.push({
                code: "collision",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }
    for (const signal of input.orphanHeadingSignals ?? []) {
        issues.push({
            code: "orphan_heading",
            message: signal,
        });
    }
    // Content-block traces that sit above bodyTop are already asserted at draw time;
    // surface any recorded overlaps in test/dev via getContentBlockTraces.
    const badBlocks = getContentBlockTraces().filter((t) => t.blockTop + 0.5 < t.minimumTop);
    for (const block of badBlocks) {
        issues.push({
            code: "collision",
            message: `Bloc "${block.blockName}" sous le bandeau (page ${block.page}).`,
        });
    }
    if (input.pageTexts) {
        for (const [index, text] of input.pageTexts.entries()) {
            const bodyish = text
                .replace(/Généré le[^P]*/gi, "")
                .replace(/Usage interne coach/gi, "")
                .replace(/Page\s+\d+\s*\/\s*\d+/gi, "")
                .replace(/Rapport coach/gi, "")
                .replace(/KR Kinetics/gi, "")
                .replace(/\s+/g, " ")
                .trim();
            if (bodyish.length < 24 && input.pageCount > 1) {
                issues.push({
                    code: "nearly_empty",
                    message: `Page ${index + 1} quasi vide.`,
                });
            }
        }
    }
    return { ok: issues.length === 0, issues };
}
export function assertPdfValidation(result) {
    if (result.ok)
        return;
    const detail = result.issues.map((i) => `[${i.code}] ${i.message}`).join("; ");
    throw new Error(`PDF_VALIDATION_FAILED: ${detail}`);
}
