import { agreementLabelFr } from "../../scoring/dimension-agreement-v31.mjs";
import { guidedChoiceCopy } from "./findings.mjs";
function scoreOf(scoring, dimension) {
    return (scoring.dimensions.find((d) => d.dimension === dimension)?.normalizedScore ??
        null);
}
function words(sections) {
    return sections
        .flatMap((s) => s.paragraphs)
        .join(" ")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
}
function trimToWordBudget(sections, max) {
    const total = words(sections);
    if (total <= max)
        return sections;
    return sections.map((section, index) => {
        if (index < sections.length - 1)
            return section;
        const joined = section.paragraphs.join(" ");
        const parts = joined.split(/\s+/);
        const keep = Math.max(40, parts.length - (total - max));
        return {
            ...section,
            paragraphs: [parts.slice(0, keep).join(" ")],
        };
    });
}
function directionSentence(label, ag, score) {
    if (!ag || score === null)
        return `${label} reste à préciser en entrevue.`;
    const agreement = agreementLabelFr(ag.classification);
    if (ag.classification.startsWith("mixed") && ag.dominantDirection !== "none") {
        const trend = ag.dominantDirection === "high"
            ? "élevée"
            : ag.dominantDirection === "low"
                ? "faible"
                : "modérée";
        return `${label} : score ${score}/100, ${agreement}. La majorité des réponses suggère une tendance ${trend}, mais une réponse opposée mérite d'être clarifiée.`;
    }
    if (ag.classification === "strongly_divergent") {
        return `${label} : score technique ${score}/100, ${agreement}. Aucune direction majoritaire nette; la moyenne n'est pas utilisée comme tendance fiable. Clarifier en entrevue.`;
    }
    return `${label} : score ${score}/100, ${agreement}.`;
}
export function generateSportNarrativeV31(input) {
    const auto = scoreOf(input.scoring, "autonomous_motivation");
    const results = scoreOf(input.scoring, "results_driven_motivation");
    const lt = scoreOf(input.scoring, "long_term_orientation");
    const effort = scoreOf(input.scoring, "effort_tolerance");
    const consistency = scoreOf(input.scoring, "behavioral_consistency");
    const rigidity = scoreOf(input.scoring, "rigidity_perfectionism");
    const mixed = input.findings.find((f) => f.id === "finding_motivation_mixed");
    const premature = input.findings.find((f) => f.id === "finding_premature_judgment");
    const sections = [
        {
            key: "motivation",
            title: "Profil motivationnel",
            paragraphs: [
                mixed
                    ? "Le profil ne révèle pas de moteur motivationnel clairement dominant. Motivation autonome et motivation orientée résultats sont proches; ce n'est pas un problème en soi, mais un point à clarifier pour calibrer le discours des premières semaines."
                    : `Motivation autonome ${auto ?? "—"}/100 et motivation résultats ${results ?? "—"}/100. Hypothèse de travail à valider en entrevue.`,
                premature
                    ? "Par ailleurs, une attente rapide envers les résultats et une orientation à long terme limitée peuvent fragiliser l'engagement lorsque les changements tardent — distinct de la seule motivation aux résultats."
                    : lt !== null && lt <= 40
                        ? "L'horizon à long terme paraît limité; distinguer clairement délai attendu et motivation aux résultats."
                        : "L'horizon temporel semble suffisamment ouvert pour un démarrage progressif.",
            ],
        },
        {
            key: "consistency",
            title: "Capacité de constance",
            paragraphs: [
                directionSentence("Constance", input.agreements.get("behavioral_consistency"), consistency) +
                    " Une routine minimale et des mesures de préparation concrètes seront plus utiles qu'un plan ambitieux dès la première semaine.",
            ],
        },
        {
            key: "setbacks",
            title: "Réaction aux délais et aux écarts",
            paragraphs: [
                [
                    effort !== null && effort < 40
                        ? "Une progression perçue comme trop lente pourrait freiner la motivation."
                        : "La tolérance aux délais paraît gérable si les gains non esthétiques sont rendus visibles.",
                    rigidity !== null && rigidity >= 65
                        ? "Une séance manquée pourrait être vécue de façon disproportionnée; la version minimale de séance est essentielle."
                        : "La reprise après écart semble accessible avec une procédure simple.",
                ].join(" "),
            ],
        },
        {
            key: "coaching",
            title: "Relation au coaching",
            paragraphs: [
                input.decisionPreference === "guided_choice"
                    ? guidedChoiceCopy().observation
                    : directionSentence("Besoin d'explications", input.agreements.get("explanation_need"), scoreOf(input.scoring, "explanation_need")),
            ],
        },
        {
            key: "approach",
            title: "Approche recommandée",
            paragraphs: [
                input.decisionPreference === "guided_choice"
                    ? guidedChoiceCopy().action
                    : "Expliquer les décisions importantes, limiter les priorités simultanées et vérifier la compréhension en entrevue.",
            ],
        },
        {
            key: "four_weeks",
            title: "Plan des quatre premières semaines",
            paragraphs: [
                "Sur quatre semaines : démarrer avec une version minimale de chaque séance, suivre des indicateurs hors miroir, installer la procédure après écart, et traiter toute conclusion comme une hypothèse à valider.",
            ],
        },
    ];
    const trimmed = trimToWordBudget(sections, 450);
    return { sections: trimmed, wordCount: words(trimmed) };
}
export function generateNutritionNarrativeV31(input) {
    const value = input.scores.nutrition_value_awareness ?? null;
    const plan = input.scores.nutrition_planning_capacity ?? null;
    const flex = input.scores.food_flexibility ?? null;
    const comp = input.scores.compensatory_food_response ?? null;
    const emo = input.scores.emotional_food_influence ?? null;
    const struct = input.scores.nutrition_structure_need ?? null;
    const flexStruct = input.findings.find((f) => f.id === "finding_nut_flexible_structure");
    const flexComp = input.findings.find((f) => f.id === "finding_nut_compensation");
    const emoAg = input.agreements.get("emotional_food_influence");
    const emotionParagraph = emoAg?.classification === "strongly_divergent"
        ? "Les réponses ne permettent pas d'établir une tendance générale. Le stress semble pouvoir modifier les intentions alimentaires dans certaines situations, tandis que l'utilisation de la nourriture comme réconfort est moins clairement rapportée. Les contextes précis doivent être distingués pendant l'entrevue."
        : emo !== null && emo >= 55
            ? "Le stress ou les émotions pourraient influencer certains choix; explorer ces situations avec tact."
            : "L'influence émotionnelle déclarée semble limitée, sans exclure des situations ponctuelles.";
    const sections = [
        {
            key: "role",
            title: "Perception du rôle de l'alimentation",
            paragraphs: [
                value !== null && value < 45
                    ? "Le client semble actuellement accorder une importance limitée au rôle de l'alimentation dans son énergie, sa récupération et son bien-être. Hypothèse à confirmer."
                    : "Le client semble reconnaître un rôle utile à l'alimentation; le degré d'implication reste à confirmer.",
            ],
        },
        {
            key: "planning",
            title: "Planification et environnement",
            paragraphs: [
                plan !== null && plan < 45
                    ? "La planification paraît limitée; des modèles simples pour les journées chargées seront probablement utiles."
                    : "La planification semble partiellement en place; vérifier ce qui tient réellement les semaines chargées.",
            ],
        },
        {
            key: "flexibility",
            title: "Flexibilité et réaction aux écarts",
            paragraphs: [
                flexComp?.observation ??
                    `Flexibilité ${flex ?? "—"}/100 et réponse compensatoire ${comp ?? "—"}/100. Explorer les contextes précis plutôt que de généraliser.`,
            ],
        },
        {
            key: "emotions",
            title: "Influence du stress ou des émotions",
            paragraphs: [emotionParagraph],
        },
        {
            key: "structure",
            title: "Besoin de structure",
            paragraphs: [
                flexStruct?.observation ??
                    (struct !== null && struct >= 65 && input.preferredFlexible
                        ? "Le client semble avoir besoin de repères clairs tout en souhaitant conserver une certaine liberté. Utiliser des modèles de repas, des portions de départ, des choix interchangeables et quelques solutions prédéfinies plutôt qu'un menu unique ou des conseils trop généraux."
                        : directionSentence("Besoin de structure alimentaire", input.agreements.get("nutrition_structure_need"), struct)),
            ],
        },
        {
            key: "four_weeks",
            title: "Approche des quatre premières semaines",
            paragraphs: [
                "Commencer par une structure flexible composée de quelques repas répétables, de solutions pour les journées chargées et d'une procédure claire après un écart. Observer l'influence du stress et aider le client à distinguer progressivement la faim physique des envies liées au contexte.",
            ],
        },
    ];
    const trimmed = trimToWordBudget(sections, 400);
    return { sections: trimmed, wordCount: words(trimmed) };
}
