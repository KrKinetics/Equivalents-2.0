export function detectCrossSourceConflictsV42(input) {
    const planning = input.domains.find((domain) => domain.domainId === "nutrition_planning");
    const declaredPlanning = input.obstacles.some((obstacle) => obstacle.canonicalId === "food_planning");
    const planningFavorable = Boolean(planning) &&
        (["high", "moderate"].includes(planning.level) ||
            ((planning.technicalScore ?? 0) >= 70 && planning.level !== "low"));
    if (!declaredPlanning || !planningFavorable)
        return [];
    return [{
            id: "nutrition_planning_declared_gap",
            directSourceCodes: ["NUT_OBS_01"],
            calculatedDomainIds: ["nutrition_planning"],
            message: "Les réponses fermées suggèrent une capacité de planification relativement favorable, mais le client identifie lui-même le manque de planification comme obstacle. Il faut préciser si la difficulté concerne la préparation, l'organisation de la semaine, l'application constante ou certaines périodes particulières.",
            validationQuestion: "Lorsque vous parlez d'un manque de planification, la difficulté concerne-t-elle surtout la préparation des repas, l'organisation de la semaine, l'exécution du plan ou la reprise après une journée moins structurée?",
            priority: planning?.level === "high" ? "high" : "moderate",
        }];
}
