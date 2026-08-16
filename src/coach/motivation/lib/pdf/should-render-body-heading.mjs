/**
 * Avoid repeating the same heading immediately after the compact page header.
 */
export function shouldRenderBodyHeading(params) {
    const normalize = (s) => s
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    return normalize(params.pageHeaderLabel) !== normalize(params.bodyHeading);
}
