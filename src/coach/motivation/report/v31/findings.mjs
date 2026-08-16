function scoreOf(scoring, dimension) {
    return (scoring.dimensions.find((d) => d.dimension === dimension)?.normalizedScore ??
        null);
}
function strengthFromItems(itemCount, classification) {
    if (classification === "strongly_divergent")
        return "contradictory";
    if (itemCount < 3)
        return "limited";
    if (classification.startsWith("coherent") && itemCount >= 3)
        return "reinforced";
    if (classification.startsWith("mixed"))
        return "moderate";
    return "limited";
}
/**
 * Strength criteria: score >= 65 && dominant high && consistent
 * (or mixed with majority >= 2 && evidence not limited).
 */
export function qualifiesAsStrength(input) {
    if (input.score === null || input.score < 65)
        return false;
    const ag = input.agreement;
    if (!ag)
        return false;
    if (ag.dominantDirection !== "high")
        return false;
    if (ag.classification.startsWith("coherent"))
        return true;
    if (ag.classification.startsWith("mixed") &&
        ag.majorityCount >= 2 &&
        strengthFromItems(ag.itemCount, ag.classification) !== "limited") {
        return true;
    }
    return false;
}
function makeFinding(partial) {
    return {
        ...partial,
        toConfirm: partial.validationQuestion,
    };
}
export function detectDecisionPreference(input) {
    const c1 = input.choice01;
    const c2 = input.choice02Inverted;
    const c3 = input.choice03Agreement;
    if (c1 !== null &&
        c1 !== undefined &&
        c1 >= 62.5 &&
        c2 !== null &&
        c2 !== undefined &&
        c2 >= 62.5 &&
        c3 !== null &&
        c3 !== undefined &&
        c3 >= 62.5) {
        return "guided_choice";
    }
    if ((input.choiceMean ?? 50) <= 37.5 && (input.explanationMean ?? 50) <= 40) {
        return "coach_directed";
    }
    if ((input.choiceMean ?? 0) >= 65 && (input.explanationMean ?? 0) >= 65) {
        return "collaborative";
    }
    if ((input.choiceMean ?? 0) >= 75)
        return "high_autonomy";
    return "uncertain";
}
export function guidedChoiceCopy() {
    return {
        observation: "Le client semble apprécier de pouvoir choisir parmi quelques options et ne souhaite probablement pas que toutes les décisions soient prises sans lui. Un trop grand nombre d'options pourrait toutefois le faire hésiter.",
        interpretation: "Une approche de choix encadrés (deux ou trois options équivalentes) devrait mieux convenir qu'une liberté totale ou qu'un plan entièrement imposé.",
        consequence: "Une liberté complète ou un plan entièrement imposé risque de moins bien convenir qu'un cadre avec des options limitées.",
        action: "Offrir deux ou trois options clairement équivalentes, expliquer les différences, puis aider le client à choisir rapidement.",
        toConfirm: "Vérifier en entrevue combien d'options simultanées restent confortables.",
    };
}
export function buildOperationalFindings(input) {
    const findings = [];
    const auto = scoreOf(input.scoring, "autonomous_motivation");
    const results = scoreOf(input.scoring, "results_driven_motivation");
    const lt = scoreOf(input.scoring, "long_term_orientation");
    const effort = scoreOf(input.scoring, "effort_tolerance");
    const rigidity = scoreOf(input.scoring, "rigidity_perfectionism");
    const consistency = scoreOf(input.scoring, "behavioral_consistency");
    const structure = scoreOf(input.scoring, "structure_need");
    const explanation = scoreOf(input.scoring, "explanation_need");
    const receptivity = scoreOf(input.scoring, "coaching_receptivity");
    const consistencyAg = input.agreements.get("behavioral_consistency");
    const structureAg = input.agreements.get("structure_need");
    const receptivityAg = input.agreements.get("coaching_receptivity");
    const mixedMotivation = auto !== null &&
        results !== null &&
        Math.abs(auto - results) < 15;
    if (mixedMotivation) {
        findings.push(makeFinding({
            id: "finding_motivation_mixed",
            type: "clarification",
            title: "Aucun moteur motivationnel clairement dominant",
            observation: "Les scores de motivation autonome et de motivation orientée résultats sont proches. Aucun moteur n'est clairement dominant.",
            interpretation: "Le plan doit rester provisoire jusqu'à ce que le levier motivationnel principal soit confirmé en entrevue.",
            possibleConsequence: "Sans clarification, le plan risque d'être calibré sur une hypothèse motivationnelle trop étroite.",
            recommendedAction: "Explorer en entrevue ce qui soutient réellement l'engagement au-delà des résultats visibles.",
            validationQuestion: "Quel levier motivationnel semble le plus fiable pour les quatre premières semaines?",
            importance: "moderate",
            evidenceStrength: "limited",
            requiresInterviewConfirmation: true,
            contributingDimensions: [
                "autonomous_motivation",
                "results_driven_motivation",
            ],
        }));
    }
    if ((lt !== null && lt <= 35) || (effort !== null && effort <= 40)) {
        findings.push(makeFinding({
            id: "finding_premature_judgment",
            type: "risk",
            title: "Jugement prématuré de l'efficacité du plan lorsque les résultats tardent",
            observation: "L'orientation à long terme est faible et certaines réponses indiquent une attente rapide envers les résultats.",
            interpretation: "Le client pourrait juger trop tôt que la méthode ne fonctionne pas si les indicateurs visibles tardent.",
            possibleConsequence: "Le client pourrait juger le plan inefficace avant que les adaptations attendues aient eu le temps d'apparaître.",
            recommendedAction: "Définir dès le départ plusieurs indicateurs hebdomadaires de progression hors miroir et balance.",
            validationQuestion: "Après combien de temps le client considère-t-il qu'une méthode ne fonctionne pas?",
            importance: "high",
            evidenceStrength: strengthFromItems(input.agreements.get("long_term_orientation")?.itemCount ?? 2, input.agreements.get("long_term_orientation")?.classification ??
                "mixed_moderate"),
            requiresInterviewConfirmation: true,
            contributingDimensions: [
                "long_term_orientation",
                "effort_tolerance",
                "results_driven_motivation",
            ],
        }));
    }
    if (rigidity !== null && rigidity >= 65) {
        findings.push(makeFinding({
            id: "finding_all_or_nothing",
            type: "risk",
            title: "Réaction tout-ou-rien après un écart",
            observation: "Les réponses indiquent qu'une séance manquée ou une semaine incomplète pourrait être vécue de façon disproportionnée.",
            interpretation: "Sans procédure de reprise, un écart ponctuel peut se transformer en abandon en cascade.",
            possibleConsequence: "Un écart ponctuel peut entraîner un abandon en cascade si aucune procédure de reprise n'est définie.",
            recommendedAction: "Créer une version minimale de chaque séance et une reprise dans les 48 heures, sans rattrapage punitif.",
            validationQuestion: "Quelle est la réaction habituelle du client après une séance manquée?",
            importance: "high",
            evidenceStrength: strengthFromItems(input.agreements.get("rigidity_perfectionism")?.itemCount ?? 2, input.agreements.get("rigidity_perfectionism")?.classification ??
                "coherent_high"),
            requiresInterviewConfirmation: true,
            contributingDimensions: [
                "rigidity_perfectionism",
                "behavioral_consistency",
            ],
        }));
    }
    if (input.decisionPreference === "guided_choice") {
        const copy = guidedChoiceCopy();
        findings.push(makeFinding({
            id: "finding_guided_choice",
            type: "priority",
            title: "Préférence pour des choix encadrés",
            observation: copy.observation,
            interpretation: copy.interpretation,
            possibleConsequence: copy.consequence,
            recommendedAction: copy.action,
            validationQuestion: copy.toConfirm,
            importance: "high",
            evidenceStrength: strengthFromItems(input.agreements.get("choice_need")?.itemCount ?? 3, input.agreements.get("choice_need")?.classification ?? "mixed_moderate"),
            requiresInterviewConfirmation: false,
            contributingDimensions: ["choice_need", "explanation_need"],
        }));
    }
    else if (explanation !== null &&
        explanation >= 65 &&
        (scoreOf(input.scoring, "choice_need") ?? 50) <= 40) {
        findings.push(makeFinding({
            id: "finding_explain_directed",
            type: "priority",
            title: "Cadre dirigé, mais expliqué",
            observation: "Le client semble vouloir comprendre les décisions du programme sans nécessairement multiplier les options.",
            interpretation: "Un cadre dirigé avec des explications courtes devrait mieux convenir qu'un menu d'options.",
            possibleConsequence: "Trop d'options ou trop peu d'explications peut réduire l'adhésion.",
            recommendedAction: "Expliquer les décisions, conserver un cadre dirigé et limiter le nombre d'options.",
            validationQuestion: "Quel niveau d'explication est réellement utile en séance?",
            importance: "high",
            evidenceStrength: "moderate",
            requiresInterviewConfirmation: true,
            contributingDimensions: ["explanation_need", "choice_need"],
        }));
    }
    // Prefer behavioral_consistency as strength when score high + coherent.
    if (qualifiesAsStrength({
        score: consistency,
        agreement: consistencyAg,
    })) {
        findings.push(makeFinding({
            id: "finding_consistency_strength",
            type: "strength",
            title: "Historique de constance favorable",
            observation: "Le client rapporte plusieurs comportements compatibles avec une capacité à maintenir une routine. Les conditions favorisant cette constance doivent néanmoins être précisées.",
            interpretation: "On peut s'appuyer sur des routines réalistes plutôt que sur une motivation ponctuelle, tout en validant les contextes qui soutiennent réellement cette constance.",
            possibleConsequence: "Sous-estimer cette constance pourrait mener à un plan trop prudent; la surestimer sans conditions pourrait créer une charge trop ambitieuse.",
            recommendedAction: "Ancrer les quatre premières semaines sur des routines répétables et mesurer les conditions qui favorisent le maintien.",
            validationQuestion: "Quelles routines passées le client a-t-il réellement maintenues plusieurs semaines, et dans quelles conditions?",
            importance: "moderate",
            evidenceStrength: strengthFromItems(consistencyAg?.itemCount ?? 2, consistencyAg?.classification ?? "coherent_high"),
            requiresInterviewConfirmation: false,
            contributingDimensions: ["behavioral_consistency"],
        }));
    }
    else if (consistency !== null && consistency < 45) {
        findings.push(makeFinding({
            id: "finding_consistency",
            type: "clarification",
            title: "Constance à tester en conditions réelles",
            observation: "L'historique de constance paraît variable; la capacité de maintien doit être observée sur les premières semaines.",
            interpretation: "La charge initiale doit rester minimaliste jusqu'à preuve de maintien.",
            possibleConsequence: "Une charge trop ambitieuse au départ pourrait fragiliser l'adhésion.",
            recommendedAction: "Démarrer avec une routine minimale et mesurer les séances réellement complétées.",
            validationQuestion: "Qu'est-ce qui a freiné les reprises après interruption dans le passé?",
            importance: "moderate",
            evidenceStrength: "limited",
            requiresInterviewConfirmation: true,
            contributingDimensions: ["behavioral_consistency", "self_efficacy"],
        }));
    }
    if (qualifiesAsStrength({
        score: structure,
        agreement: structureAg,
    })) {
        findings.push(makeFinding({
            id: "finding_structure_strength",
            type: "strength",
            title: "Répond bien à un cadre précis",
            observation: "Le besoin de structure apparaît élevé et cohérent; un plan clair devrait faciliter la constance.",
            interpretation: "Un cadre précis avec peu de priorités simultanées devrait soutenir l'exécution.",
            possibleConsequence: "Un cadre trop vague pourrait freiner la mise en action.",
            recommendedAction: "Fournir un plan précis avec peu de priorités simultanées et des jalons courts.",
            validationQuestion: "Quel niveau de détail est réellement utile sans surcharge?",
            importance: "moderate",
            evidenceStrength: strengthFromItems(structureAg?.itemCount ?? 2, structureAg?.classification ?? "coherent_high"),
            requiresInterviewConfirmation: false,
            contributingDimensions: ["structure_need"],
        }));
    }
    // Do NOT classify "à préciser" receptivity as strength — clarification instead.
    if (receptivity !== null &&
        receptivity >= 55 &&
        receptivityAg &&
        (receptivityAg.classification.startsWith("mixed") ||
            receptivityAg.classification === "strongly_divergent" ||
            receptivityAg.classification === "insufficient")) {
        findings.push(makeFinding({
            id: "finding_feedback_format",
            type: "clarification",
            title: "Format de rétroaction préférable",
            observation: "La réceptivité au coaching apparaît présente, mais le format de rétroaction réellement utile reste à préciser.",
            interpretation: "Il ne s'agit pas encore d'une force confirmée; le dosage et le format du feedback doivent être testés.",
            possibleConsequence: "Un feedback trop fréquent, trop technique ou trop vague pourrait réduire l'utilité perçue.",
            recommendedAction: "Proposer des rétroactions courtes et concrètes, puis ajuster le format après une ou deux séances.",
            validationQuestion: "Quel format de rétroaction le client trouve-t-il le plus utile (écrit court, oral en séance, points d'action)?",
            importance: "moderate",
            evidenceStrength: "limited",
            requiresInterviewConfirmation: true,
            contributingDimensions: ["coaching_receptivity"],
        }));
    }
    if (input.nutrition?.preferredFlexible &&
        (input.nutrition.structureNeed ?? 0) >= 55) {
        findings.push(makeFinding({
            id: "finding_nut_flexible_structure",
            type: "priority",
            title: "Structure alimentaire flexible",
            observation: "Le client semble avoir besoin de repères clairs tout en souhaitant conserver une certaine liberté.",
            interpretation: "Des modèles de repas avec choix interchangeables devraient mieux convenir qu'un menu unique.",
            possibleConsequence: "Un menu unique ou des conseils trop généraux risquent de moins bien convenir.",
            recommendedAction: "Utiliser des modèles de repas, des portions de départ, des choix interchangeables et quelques solutions prédéfinies.",
            validationQuestion: "Quel format de repères est le plus simple à appliquer les jours chargés?",
            importance: "high",
            evidenceStrength: "moderate",
            requiresInterviewConfirmation: false,
            contributingDimensions: ["nutrition_structure_need"],
        }));
    }
    if ((input.nutrition?.flexibility ?? 0) >= 65 &&
        (input.nutrition?.compensation ?? 0) >= 65) {
        findings.push(makeFinding({
            id: "finding_nut_compensation",
            type: "clarification",
            title: "Flexibilité déclarée et réaction compensatoire",
            observation: "Le client semble pouvoir reprendre certaines habitudes après un repas imprévu, mais une situation particulière peut encore déclencher une impression de perte de contrôle.",
            interpretation: "Il faut distinguer une flexibilité générale d'une réaction compensatoire contextuelle.",
            possibleConsequence: "Généraliser trop vite une tendance compensatoire pourrait mener à une structure inutilement restrictive.",
            recommendedAction: "Identifier précisément les contextes concernés avant de conclure à une tendance générale.",
            validationQuestion: "Dans quelles situations exactes apparaît le besoin de compenser?",
            importance: "high",
            evidenceStrength: "moderate",
            requiresInterviewConfirmation: true,
            contributingDimensions: [
                "food_flexibility",
                "compensatory_food_response",
            ],
        }));
    }
    return findings.map((f) => {
        if (f.importance === "high" && f.evidenceStrength === "limited") {
            return {
                ...f,
                requiresInterviewConfirmation: true,
                recommendedAction: `${f.recommendedAction} Confirmer pendant l'entrevue avant de modifier fortement l'approche.`,
            };
        }
        return f;
    });
}
export function sortFindings(findings) {
    const typeOrder = {
        risk: 0,
        priority: 1,
        clarification: 2,
        strength: 3,
    };
    const imp = {
        high: 0,
        moderate: 1,
        low: 2,
    };
    return [...findings].sort((a, b) => {
        const i = imp[a.importance] - imp[b.importance];
        if (i !== 0)
            return i;
        return typeOrder[a.type] - typeOrder[b.type];
    });
}
/** Cap actionable findings shown in the coach summary (max 4–5). */
export function selectActionableFindingsForSummary(findings, max = 4) {
    const ranked = sortFindings(findings).filter((f) => f.importance !== "low");
    return ranked.slice(0, max);
}
