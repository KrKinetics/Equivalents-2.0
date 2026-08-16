/** Normalize a Likert mean (default 1–5) to a 0–100 scale. */
export function normalizeLikertMean(meanScore, min = 1, max = 5) {
    if (max <= min) {
        throw new Error("Likert max must be greater than min");
    }
    const clamped = Math.min(max, Math.max(min, meanScore));
    return ((clamped - min) / (max - min)) * 100;
}
export function invertNormalizedScore(score) {
    return 100 - score;
}
export function clampScore(score) {
    return Math.min(100, Math.max(0, score));
}
export function roundScore(score, decimals = 1) {
    const factor = 10 ** decimals;
    return Math.round(score * factor) / factor;
}
