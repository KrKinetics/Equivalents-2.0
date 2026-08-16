import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
let pdfjsPromise = null;
async function loadPdfjs() {
    if (!pdfjsPromise) {
        pdfjsPromise = (async () => {
            try {
                const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
                return mod;
            }
            catch {
                const require = createRequire(__filename);
                // Fallback for CJS environments
                return require("pdfjs-dist/legacy/build/pdf.js");
            }
        })();
    }
    return pdfjsPromise;
}
/**
 * Extract plain text per page using pdfjs-dist (Node).
 */
export async function extractPdfPagesText(buffer) {
    const pdfjs = await loadPdfjs();
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
            .map((item) => item.str ?? "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        pages.push({ pageNumber: i, text });
    }
    return pages;
}
/** True when a page only has footer/header chrome, with no real body content. */
export function isEffectivelyBlankPage(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized)
        return true;
    const withoutChrome = normalized
        .replace(/Généré le[^P]*/gi, " ")
        .replace(/Usage interne coach/gi, " ")
        .replace(/Confidentiel — usage Coach KR Kinetics/gi, " ")
        .replace(/Page\s+\d+\s*\/\s*\d+/gi, " ")
        .replace(/Rapport coach/gi, " ")
        .replace(/Profil motivationnel/gi, " ")
        .replace(/KR Kinetics/gi, " ")
        .replace(/·/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return withoutChrome.length < 24;
}
