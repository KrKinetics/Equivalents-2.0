/**
 * Choice approach from current assessment answers only — no universal default
 * that injects collaboration guidée for every profile.
 */
export function buildChoiceApproach(params) {
    const likes = params.interestInOptions;
    const coach = params.preferenceForCoachDirection;
    const overload = params.optionOverloadRisk;
    const structureHigh = params.structureNeedLevel === "high";
    if (likes < 50 && overload >= 75) {
        return {
            preference: "collaborative_guided",
            label: "collaboration guidée",
            summary: "Une collaboration guidée paraît appropriée : présenter une recommandation principale, expliquer brièvement sa logique et offrir une seule alternative lorsqu'elle est utile.",
            validationQuestion: "Préférez-vous que le coach vous présente une recommandation claire à valider ensemble, ou souhaitez-vous participer davantage au choix des exercices?",
        };
    }
    if (coach != null && coach >= 65 && likes < 50) {
        return {
            preference: "coach_directed",
            label: "cadre dirigé par le coach",
            summary: "Le client semble préférer que le coach prenne l'essentiel des décisions, avec des explications courtes si nécessaire.",
            validationQuestion: "Souhaitez-vous que le coach décide la plupart des exercices, avec des explications lorsque c'est utile?",
        };
    }
    if (likes >= 65 && overload < 50) {
        if (structureHigh) {
            return {
                preference: "structured_autonomy",
                label: "autonomie encadrée",
                summary: "Le client semble apprécier les options et rapporte peu de surcharge lorsqu'il doit choisir. Proposer plusieurs choix équivalents dans les éléments secondaires tout en conservant une progression générale claire et structurée.",
                validationQuestion: "Souhaitez-vous conserver une progression structurée tout en choisissant parmi des options équivalentes pour certains exercices secondaires?",
            };
        }
        return {
            preference: "high_autonomy",
            label: "autonomie dans les choix",
            summary: "Conserver un cadre clair tout en permettant des choix limités équivalents.",
            validationQuestion: "Souhaitez-vous participer davantage au choix des exercices lorsque plusieurs options équivalentes sont possibles?",
        };
    }
    // Neutral fallback — never invent collaboration guidée without evidence.
    return {
        preference: "guided_choice",
        label: "choix guidés à préciser",
        summary: "Le niveau de participation aux choix d'exercices reste à confirmer en entrevue.",
        validationQuestion: "Préférez-vous une recommandation principale à valider, ou plusieurs options équivalentes?",
    };
}
export function buildCommunicationApproach(params) {
    const expl = params.explanationNeedLevel;
    const receptivity = params.coachReceptivityLevel;
    if (expl === "high" && (receptivity === "low" || receptivity === "uncertain")) {
        return {
            label: "communication expliquée et non confrontante",
            summary: "Expliquer clairement la logique des décisions. Avant une correction directe, demander la permission ou vérifier comment le client préfère recevoir les commentaires. Utiliser des observations factuelles et une ou deux priorités à la fois.",
        };
    }
    if (expl === "high") {
        return {
            label: "retours expliqués et structurés",
            summary: "Prendre le temps d'expliquer le pourquoi des choix et des corrections, tout en restant concret.",
        };
    }
    if (receptivity === "high") {
        return {
            label: "retours courts, concrets et expliqués brièvement",
            summary: "Privilégier des retours courts et concrets, avec une brève explication lorsque c'est utile.",
        };
    }
    return {
        label: "communication à calibrer en entrevue",
        summary: "Calibrer le niveau d'explication et le format des corrections selon la réaction observée.",
    };
}
export function choiceApproachChecklistLabel(approach) {
    if (approach.preference === "structured_autonomy" ||
        approach.preference === "high_autonomy") {
        return "Valider l'approche d'autonomie encadrée.";
    }
    if (approach.preference === "collaborative_guided") {
        return "Valider l'approche de collaboration guidée pour les choix.";
    }
    if (approach.preference === "coach_directed") {
        return "Valider le cadre dirigé par le coach.";
    }
    return "Valider le niveau de participation aux choix d'exercices.";
}
