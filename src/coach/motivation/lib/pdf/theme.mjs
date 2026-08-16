/**
 * Shared KR Kinetics PDF theme — aligned with site + equivalents PDFs.
 */
export const PDF_PAGE = {
    size: "LETTER",
    width: 612,
    height: 792,
    marginX: 44,
    marginTop: 36,
    footerHeight: 40,
    headerFirstHeight: 92,
    headerNextHeight: 40,
    /** First-page logo target width (points). */
    logoFirstWidth: 120,
    logoFirstMaxHeight: 105,
    /** Continuation-page logo target width (points). */
    logoNextWidth: 58,
    logoNextMaxHeight: 54,
};
/** Reserved continuation-page header band — content must start at bodyTop (~92). */
export const CONTINUATION_HEADER = {
    logoX: 44,
    logoY: 18,
    logoMaxWidth: 48,
    logoMaxHeight: 42,
    titleX: 102,
    titleY: 28,
    sectionY: 44,
    dividerY: 72,
    bodyTop: 92,
};
export function continuationPageLayout() {
    return {
        pageTop: 0,
        headerTop: CONTINUATION_HEADER.logoY,
        headerBottom: CONTINUATION_HEADER.dividerY,
        bodyTop: CONTINUATION_HEADER.bodyTop,
        bodyBottom: PDF_PAGE.height - PDF_PAGE.footerHeight,
        footerTop: PDF_PAGE.height - PDF_PAGE.footerHeight,
    };
}
export function firstPageLayout(bodyTop) {
    return {
        pageTop: 0,
        headerTop: PDF_PAGE.marginTop,
        headerBottom: Math.max(PDF_PAGE.marginTop, bodyTop - 8),
        bodyTop,
        bodyBottom: PDF_PAGE.height - PDF_PAGE.footerHeight,
        footerTop: PDF_PAGE.height - PDF_PAGE.footerHeight,
    };
}
export const PDF_COLORS = {
    ink: "#1a1a2e",
    inkMid: "#16213e",
    inkDeep: "#0f3460",
    paper: "#f8fafc",
    surface: "#ffffff",
    muted: "#64748b",
    line: "#e2e8f0",
    accent: "#991f2d",
    accentDeep: "#5c1023",
    accentSoft: "#f5e8ea",
    green: "#2d6a4f",
    gold: "#fef3c7",
    white: "#ffffff",
    tableHeaderBg: "#1a1a2e",
    tableAltRow: "#f8fafc",
    text: "#1a1a2e",
};
export const PDF_TYPE = {
    brand: 11,
    title: 17,
    section: 11,
    body: 9.5,
    narrative: 10.5,
    small: 8,
    meta: 8.5,
    table: 8.5,
    footer: 7.5,
    answerCode: 7.5,
};
export const PDF_SPACE = {
    sectionGap: 8,
    cardPad: 8,
    cardRadius: 4,
    cardBorder: 0.75,
    accentBar: 3,
    afterTitle: 5,
    paragraphGap: 4,
    bulletGap: 2,
    gridGap: 8,
    tableRowH: 15,
    tableHeaderH: 17,
    answerGap: 6,
    likertGap: 4,
};
export const PDF_FONTS = {
    regular: "Roboto",
    bold: "Roboto-Bold",
    bodyRegular: "Roboto",
};
export const PDF_BRAND = {
    name: "KR Kinetics",
    reportTitle: "Rapport coach",
    reportTitleShort: "Rapport coach",
    internalUse: "Usage interne coach",
    logoRelativePaths: [
        "public/brand/kr-kinetics-logo.png",
        "public/brand/kr-kinetics-logo-pdf.png",
        "src/coach/motivation/lib/pdf/assets/kr-kinetics-logo.png",
    ],
};
/** Narrative typography — must be reapplied after every page break. */
export const NARRATIVE_FONT = PDF_FONTS.bodyRegular;
export const NARRATIVE_FONT_SIZE = 10.5;
export const NARRATIVE_LINE_GAP = 3;
export const NARRATIVE_COLOR = PDF_COLORS.text;
/** Aggregated theme object for callers that prefer PDF_THEME.*. */
export const PDF_THEME = {
    page: PDF_PAGE,
    colors: PDF_COLORS,
    type: PDF_TYPE,
    space: PDF_SPACE,
    fonts: PDF_FONTS,
    brand: PDF_BRAND,
};
export const NARRATIVE_STYLE = {
    font: PDF_THEME.fonts.bodyRegular,
    fontSize: 10.5,
    color: PDF_THEME.colors.text,
    lineGap: 3,
    paragraphGap: 8,
};
