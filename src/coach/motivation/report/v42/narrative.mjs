import { componentLabelFromDomain, trendLabelFr, } from "../../scoring/domain-interpretation-v41.mjs";
import { buildEstablishedEvidenceSentence, buildSingleItemEvidenceSentence, DOMAIN_GRAMMAR, } from "./domain-grammar.mjs";
import { longTermNarrative } from "./readiness.mjs";
function d(domains, id) {
    return domains.find((x) => x.domainId === id);
}
function softComponentLabel(domain) {
    if (!domain || domain.itemCount === 0)
        return "à préciser";
    if (domain.itemCount === 1) {
        return `${componentLabelFromDomain(domain)} (appui limité — une seule réponse)`;
    }
    return componentLabelFromDomain(domain);
}
/** Adjective-only trend label — never a clause (avoids "paraît repose…"). */
function trendPhrase(domain) {
    if (!domain || domain.itemCount === 0)
        return "non établie";
    return trendLabelFr(domain.trendDisplay).toLowerCase();
}
function singleItemLevel(domain) {
    return domain.level === "high"
        ? "high"
        : domain.level === "low"
            ? "low"
            : "moderate";
}
function pluralTrendAdj(domain) {
    const trend = trendLabelFr(domain.trendDisplay);
    if (domain.itemCount > 1 && trend === "Élevée")
        return "élevés";
    if (domain.itemCount > 1 && trend === "Faible")
        return "faibles";
    return trend.toLowerCase();
}
export function buildMotivationHorizonNarrative(domains) {
    const auto = d(domains, "autonomous_motivation");
    const autoValue = d(domains, "autonomous_value_without_results");
    const results = d(domains, "results_orientation");
    const delay = d(domains, "results_delay_sensitivity");
    const longTerm = d(domains, "long_term_projection");
    const parts = [];
    if (auto?.agreement === "strongly_divergent" || autoValue?.agreement === "strongly_divergent") {
        parts.push("La motivation autonome paraît contradictoire : le client peut valoriser le projet dans l'ensemble tout en restant sensible aux résultats visibles.");
    }
    else if (results?.level === "high") {
        parts.push("L'engagement semble fortement influencé par les résultats visibles, tandis que les raisons plus personnelles de poursuivre demeurent à clarifier.");
    }
    else {
        parts.push("La motivation initiale doit être clarifiée en entrevue; les indicateurs orientent le démarrage sans constituer une mesure clinique.");
    }
    if (delay && delay.itemCount > 0) {
        parts.push(`La sensibilité au délai avant les résultats paraît ${trendPhrase(delay)}.`);
    }
    parts.push(longTermNarrative(longTerm));
    return parts.join(" ");
}
export function buildMaintenanceRecoveryNarrative(domains) {
    const adherence = d(domains, "adherence_recovery");
    const maintenance = d(domains, "adherence_maintenance");
    const recovery = d(domains, "adherence_recovery_signal");
    const history = d(domains, "adherence_history");
    const parts = [];
    if (adherence) {
        parts.push(`Adhésion globale : ${trendPhrase(adherence)}.`);
    }
    if (maintenance?.itemCount) {
        parts.push(`Maintien pendant les semaines chargées : ${softComponentLabel(maintenance)}.`);
    }
    if (recovery?.itemCount) {
        parts.push(`Reprise après interruption : ${softComponentLabel(recovery)}.`);
    }
    if (history?.itemCount) {
        parts.push(`Préparation comportementale antérieure : ${softComponentLabel(history)}.`);
    }
    parts.push("Une procédure minimale de reprise doit être testée dès les premières semaines plutôt que supposée.");
    return parts.join(" ");
}
export function buildDeviationReactionNarrative(domains) {
    const rigidity = d(domains, "all_or_nothing");
    const delay = d(domains, "delay_tolerance");
    const parts = [];
    if (rigidity) {
        if (rigidity.trendDisplay === "high_to_confirm" ||
            rigidity.agreement === "mixed") {
            parts.push("Un fonctionnement tout-ou-rien pourrait amplifier la réaction après un écart; cette tendance reste à confirmer en entrevue.");
        }
        else if (rigidity.level === "high") {
            parts.push("Le client semble réagir fortement aux écarts; une procédure de reprise sans compensation punitive sera importante.");
        }
        else {
            parts.push("La réaction après un écart n'est pas entièrement établie; observer la première séance manquée sera instructif.");
        }
    }
    if (delay?.itemCount === 1) {
        parts.push(`La tolérance aux délais paraît ${trendPhrase(delay)}, mais cette lecture repose sur une seule réponse, ce qui peut influencer la patience après un écart.`);
    }
    else if (delay?.itemCount) {
        parts.push(`La tolérance aux délais paraît ${trendPhrase(delay)}, ce qui peut influencer la patience après un écart.`);
    }
    return parts.join(" ");
}
export function buildCoachingStyleNarrative(domains, choiceApproach) {
    const coach = d(domains, "coach_receptivity");
    const expl = d(domains, "explanation_need");
    const structure = d(domains, "structure_need");
    const parts = [];
    if (coach?.level === "high" && coach.itemCount === 1) {
        parts.push("Le feedback direct pourrait être bien accepté; privilégier des retours courts et concrets, à confirmer en entrevue.");
    }
    else if (coach?.level === "high") {
        parts.push("Le feedback direct semble probablement bien accepté; privilégier des retours courts et concrets.");
    }
    else if (coach?.itemCount === 1) {
        parts.push(buildSingleItemEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.feedbackReceptivity,
            level: singleItemLevel(coach),
        }));
    }
    else if (coach) {
        parts.push(`La réceptivité au feedback paraît ${trendPhrase(coach)}.`);
    }
    if (expl?.itemCount === 1) {
        parts.push(`${buildSingleItemEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.explanationNeed,
            level: singleItemLevel(expl),
        })} Vérifier le niveau de justification nécessaire pour favoriser l'adhésion.`);
    }
    else if (expl?.itemCount) {
        parts.push(`Le besoin d'explications paraît ${trendPhrase(expl)}; calibrer la profondeur des justifications.`);
    }
    if (structure?.itemCount === 1) {
        parts.push(buildSingleItemEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.structureNeed,
            level: singleItemLevel(structure),
        }));
    }
    else if (structure?.itemCount) {
        parts.push(`Le besoin de structure paraît ${trendPhrase(structure)}.`);
    }
    if (coach?.itemCount === 1 && coach.level === "low") {
        parts.push("Expliquer clairement la logique des décisions. Avant une correction directe, demander la permission ou vérifier comment le client préfère recevoir les commentaires.");
    }
    parts.push(choiceApproach.summary);
    return parts.join(" ");
}
export function buildSportNarrativeSections(domains, choiceApproach, options = {}) {
    const wellbeingIntro = options.hasWellbeingGoal
        ? "Le bien-être est un objectif déclaré à préciser en dimensions observables; il ne doit pas être remplacé par un objectif de force ou d'apparence. "
        : "";
    return [
        {
            key: "v42-motivation-horizon",
            title: "Motivation et horizon temporel",
            paragraphs: [`${wellbeingIntro}${buildMotivationHorizonNarrative(domains)}`],
        },
        {
            key: "v42-maintenance-recovery",
            title: "Maintien et capacité de reprise",
            paragraphs: [buildMaintenanceRecoveryNarrative(domains)],
        },
        {
            key: "v42-deviation-reaction",
            title: "Réaction après un écart",
            paragraphs: [buildDeviationReactionNarrative(domains)],
        },
        {
            key: "v42-coaching-style",
            title: "Style de coaching recommandé",
            paragraphs: [buildCoachingStyleNarrative(domains, choiceApproach)],
        },
    ];
}
export function buildNutritionRoleNarrative(domains) {
    const value = d(domains, "nutrition_value");
    const perf = d(domains, "performance_fueling");
    if (!value || !perf)
        return undefined;
    if (perf.itemCount === 1 && (perf.level === "high" || perf.level === "moderate")) {
        return (`${buildSingleItemEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.foodPerformanceLink,
            level: perf.level === "high" ? "high" : "moderate",
        })} ` +
            "Les bénéfices concrets en séance et en récupération constituent probablement une meilleure porte d'entrée qu'un discours nutritionnel général.");
    }
    if ((value.level === "low" || value.level === "moderate") &&
        (perf.level === "moderate" || perf.level === "high")) {
        return ("Le client accorde actuellement peu d'importance générale à l'alimentation, mais reconnaît partiellement son lien avec l'énergie et la performance. " +
            "Les bénéfices concrets en séance et en récupération constituent probablement une meilleure porte d'entrée qu'un discours nutritionnel général.");
    }
    if (value.level === "low") {
        return "L'importance générale accordée à l'alimentation semble faible.";
    }
    return undefined;
}
export function buildRichNutritionNarrative(input) {
    const { domains, obstacles, normalizedObstacles, preferenceText, conflicts } = input;
    const paragraphs = [];
    const value = d(domains, "nutrition_value");
    const perf = d(domains, "performance_fueling");
    const planning = d(domains, "nutrition_planning");
    const flex = d(domains, "food_flexibility");
    const comp = d(domains, "compensatory_food");
    const stress = d(domains, "emotional_stress_food");
    const reward = d(domains, "emotional_reward_food");
    const structure = d(domains, "nutrition_structure");
    const hunger = d(domains, "hunger_signals");
    const role = buildNutritionRoleNarrative(domains);
    if (role)
        paragraphs.push(role);
    else if (value) {
        paragraphs.push(`L'importance générale accordée à l'alimentation ${value.itemCount > 1 ? "paraît" : "n'est pas clairement établie — tendance"} ${pluralTrendAdj(value)}.`);
    }
    if (perf?.itemCount && !role) {
        const level = perf.level === "high" ? "high" : perf.level === "low" ? "low" : "moderate";
        paragraphs.push(perf.itemCount === 1
            ? buildSingleItemEvidenceSentence({
                grammar: DOMAIN_GRAMMAR.foodPerformanceLink,
                level,
            })
            : buildEstablishedEvidenceSentence({
                grammar: DOMAIN_GRAMMAR.foodPerformanceLink,
                level,
            }));
    }
    if (planning?.itemCount) {
        paragraphs.push(`La planification alimentaire paraît ${softComponentLabel(planning)}.`);
    }
    if (flex?.itemCount) {
        const level = flex.level === "high" ? "high" : flex.level === "low" ? "low" : "moderate";
        paragraphs.push(flex.itemCount === 1
            ? buildSingleItemEvidenceSentence({
                grammar: DOMAIN_GRAMMAR.flexibility,
                level,
            })
            : flex.level === "high"
                ? "La flexibilité alimentaire est probablement favorable."
                : buildEstablishedEvidenceSentence({
                    grammar: DOMAIN_GRAMMAR.flexibility,
                    level,
                }));
    }
    if (comp?.itemCount) {
        paragraphs.push(comp.level === "low"
            ? "La réaction compensatoire après un écart semble faible."
            : comp.agreement === "insufficient" || comp.itemCount === 1
                ? "La réaction compensatoire n'est pas clairement établie."
                : `La réaction compensatoire paraît ${trendPhrase(comp)}.`);
    }
    if (stress?.itemCount) {
        paragraphs.push(stress.itemCount === 1
            ? "Le stress pourrait affecter les intentions alimentaires, mais cette donnée repose sur une seule réponse."
            : "Le stress pourrait affecter les intentions alimentaires.");
    }
    if (reward?.itemCount === 1) {
        paragraphs.push(buildSingleItemEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.foodReward,
            level: singleItemLevel(reward),
        }));
    }
    else if (reward?.itemCount) {
        paragraphs.push(buildEstablishedEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.foodReward,
            level: singleItemLevel(reward),
        }));
    }
    if (structure?.itemCount === 1) {
        paragraphs.push(buildSingleItemEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.nutritionStructureNeed,
            level: singleItemLevel(structure),
        }));
    }
    else if (structure?.itemCount) {
        paragraphs.push(buildEstablishedEvidenceSentence({
            grammar: DOMAIN_GRAMMAR.nutritionStructureNeed,
            level: singleItemLevel(structure),
        }));
    }
    if (hunger?.itemCount) {
        const level = hunger.level === "high" ? "high" : hunger.level === "low" ? "low" : "moderate";
        paragraphs.push(hunger.itemCount === 1
            ? buildSingleItemEvidenceSentence({
                grammar: DOMAIN_GRAMMAR.foodSignals,
                level,
            })
            : buildEstablishedEvidenceSentence({
                grammar: DOMAIN_GRAMMAR.foodSignals,
                level,
            }));
    }
    const approach = buildNutritionStructureApproach(domains, preferenceText);
    if (approach)
        paragraphs.push(approach);
    const hasStress = Boolean(normalizedObstacles?.some((o) => o.canonicalId === "stress_emotions"));
    const hasPlanning = Boolean(normalizedObstacles?.some((o) => o.canonicalId === "food_planning"));
    const hasFoodGeneral = Boolean(normalizedObstacles?.some((o) => o.canonicalId === "food_general")) ||
        obstacles.some((o) => o.semanticCategory === "food_general");
    if (hasFoodGeneral || hasStress || hasPlanning) {
        const bits = [];
        if (hasFoodGeneral)
            bits.push("de l'obstacle alimentaire général déclaré");
        if (hasStress)
            bits.push("de l'influence possible du stress");
        if (hasPlanning)
            bits.push("du manque de planification déclaré");
        paragraphs.push(`Les premières recommandations devront tenir compte ${bits.join(", ").replace(/,([^,]*)$/, " et$1")}.`);
    }
    else {
        const obstacleLabels = obstacles
            .filter((o) => ["budget", "portions", "social_meals", "substances"].includes(o.semanticCategory))
            .map((o) => o.normalizedLabel);
        if (obstacleLabels.length) {
            paragraphs.push(`Les contraintes déclarées (${obstacleLabels.slice(0, 3).join(", ")}) doivent orienter les premières recommandations.`);
        }
    }
    for (const conflict of conflicts ?? [])
        paragraphs.push(conflict.message);
    return paragraphs;
}
export function buildNutritionStructureApproach(domains, preferenceText) {
    const structure = d(domains, "nutrition_structure");
    const pref = preferenceText ?? "";
    if (/menu\s+pr[eé]cis|quantit[eé]/i.test(pref)) {
        return ("Les réponses fermées concernant le besoin de structure alimentaire sont divergentes, mais la préférence explicite du client favorise un menu précis avec des quantités. " +
            "Commencer par une structure claire et limitée, puis vérifier si ce niveau de précision facilite réellement l'application ou devient trop contraignant. " +
            "Tester pendant une courte période un menu précis avec quantités, un nombre limité d'options équivalentes et une procédure simple de reprise après une journée moins structurée.");
    }
    if (/portion|rep[eè]re\s+visuel/i.test(pref)) {
        return ("Commencer avec des repères visuels de portions, quelques exemples modulables et une ou deux options de dépannage. " +
            "Éviter un menu rigide, mais fournir suffisamment de structure pour faciliter l'application.");
    }
    const lowNeed = !structure ||
        structure.level === "low" ||
        structure.level === "uncertain" ||
        /flexib|libert/i.test(pref);
    if (lowNeed) {
        return ("Le client préfère une approche flexible. Commencer par quelques principes simples, des options interchangeables et un ou deux repas de dépannage facultatifs. " +
            "Éviter un menu rigide ou excessivement répétitif.");
    }
    return "Proposer une structure alimentaire modérée avec quelques repas répétables, puis ajuster selon le quotidien observé.";
}
export function buildFlexCompNarrative(domains) {
    const flex = d(domains, "food_flexibility");
    const comp = d(domains, "compensatory_food");
    if (!flex || !comp)
        return undefined;
    if ((flex.level === "high" || flex.level === "moderate") &&
        (comp.level === "high" || comp.level === "moderate")) {
        return ("Le client semble capable de flexibilité dans certaines situations, mais rapporte également une tendance à compenser ou à ressentir une perte de contrôle après certains écarts. " +
            "Identifier les contextes associés à chaque réaction et définir un retour normal au repas suivant.");
    }
    return undefined;
}
