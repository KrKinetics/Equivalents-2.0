/** Detect UTF-8 interpreted as Latin-1 / Windows-1252 (mojibake). */
export const MOJIBAKE_PATTERN = /Ã.|Â.|â€|ï¿½/;
export function assertValidUnicode(text, context = "rapport") {
    if (MOJIBAKE_PATTERN.test(text)) {
        throw new Error(`Le ${context} contient du texte corrompu et ne peut pas être exporté.`);
    }
}
export function collectMojibakeSamples(text, limit = 5) {
    const samples = [];
    const re = new RegExp(MOJIBAKE_PATTERN.source, "g");
    let match;
    while ((match = re.exec(text)) !== null && samples.length < limit) {
        const start = Math.max(0, match.index - 12);
        const end = Math.min(text.length, match.index + 24);
        samples.push(text.slice(start, end));
    }
    return samples;
}
/** Canonical phrase used in encoding regression tests. */
export const UNICODE_REGRESSION_PHRASE = "Le profil révèle une préparation élevée, une récupération adéquate et une réaction nuancée aux écarts.";
