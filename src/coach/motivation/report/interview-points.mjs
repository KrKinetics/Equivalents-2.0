const NUTRITION_HINT = /aliment|nutrition|repas|menu|épicerie|faim|satiété|satiete|alimentaire|nutritionnel/i;
export function isNutritionConfirmationPoint(text) {
    return NUTRITION_HINT.test(text);
}
/**
 * Sport-only confirmation points for the training section.
 * Historical snapshots may still mix nutrition items into itemsToConfirmInInterview;
 * those are filtered out here and kept only under nutrition.interviewPoints.
 */
export function sportConfirmationPoints(report) {
    const raw = Array.isArray(report.itemsToConfirmInInterview)
        ? report.itemsToConfirmInInterview
        : [];
    const sport = raw
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0 && !isNutritionConfirmationPoint(item));
    if (sport.length > 0)
        return [...new Set(sport)];
    // Fallback sport prompts when the snapshot only carried nutrition confirmations.
    return [
        "Confirmer ce qui prouverait en quatre semaines que l'accompagnement fonctionne.",
        "Clarifier le délai réel avant de juger qu'il n'y a pas de résultats.",
        "Vérifier la réaction habituelle après une semaine d'entraînement incomplète.",
        "Préciser le degré de détail attendu dans le plan et la fréquence de suivi.",
    ];
}
