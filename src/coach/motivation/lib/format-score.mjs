export function formatFrenchScore(value) {
    return new Intl.NumberFormat("fr-CA", {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
        maximumFractionDigits: 1,
    }).format(value);
}
