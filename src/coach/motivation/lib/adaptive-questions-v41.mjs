import { MAX_ADAPTIVE_PER_DOMAIN, MAX_ADAPTIVE_QUESTIONS, QUESTIONNAIRE_V41_ADAPTIVE_MAX, V41_ADAPTIVE_CANDIDATES, V41_DOMAIN_SELECTION_PRIORITY, } from "../questionnaire/adaptive-bank-v41.mjs";
import { interpretDomain, V41_DOMAIN_DEFINITIONS, } from "../scoring/domain-interpretation-v41.mjs";
export { MAX_ADAPTIVE_PER_DOMAIN, MAX_ADAPTIVE_QUESTIONS, QUESTIONNAIRE_V41_ADAPTIVE_MAX, };
function safetyPriority(domainId) {
    if (domainId === "all_or_nothing")
        return 0;
    if (domainId.startsWith("adherence"))
        return 1;
    if (domainId === "compensatory_food")
        return 2;
    return 3;
}
function priorityRank(p) {
    return p === "critical" ? 0 : p === "high" ? 1 : 2;
}
/** Derive coarse coaching decisions from domain interpretations. */
export function deriveCoachingDecisions(domains) {
    const get = (id) => domains.find((d) => d.domainId === id);
    const adherence = get("adherence_recovery");
    const allOrNothing = get("all_or_nothing");
    const structure = get("structure_need");
    const choice = get("choice_interest");
    const overload = get("option_overload");
    const expl = get("explanation_need");
    const coach = get("coach_receptivity");
    const plan = get("nutrition_planning");
    const nutStruct = get("nutrition_structure");
    const comp = get("compensatory_food");
    const lt = get("long_term_projection");
    const maintenance = get("adherence_maintenance");
    const recoverySignal = get("adherence_recovery_signal");
    const followUp = adherence?.level === "low" ||
        adherence?.level === "uncertain" ||
        maintenance?.level === "low" ||
        recoverySignal?.level === "low" ||
        allOrNothing?.level === "high" ||
        lt?.level === "low"
        ? "twice_weekly"
        : adherence?.level === "moderate" || maintenance?.level === "moderate"
            ? "weekly"
            : "biweekly";
    const trainingStructure = structure?.level === "high"
        ? "high"
        : structure?.level === "low"
            ? "low"
            : "moderate";
    // Granular recovery decision — adaptive EFF_03 / CONS_02 can flip this.
    const recovery = recoverySignal?.level === "low" ||
        recoverySignal?.level === "uncertain" ||
        maintenance?.level === "low" ||
        adherence?.level === "low" ||
        allOrNothing?.level === "high"
        ? recoverySignal?.level === "high"
            ? "standard_resume"
            : "explicit_min_version"
        : "standard_resume";
    const aonProtocol = allOrNothing?.level === "high" || allOrNothing?.trendDisplay === "high_to_confirm"
        ? "all_or_nothing_guardrails"
        : "standard";
    let choiceApproach = "guided_collaboration";
    if ((choice?.level === "low" || (choice?.technicalScore ?? 50) <= 40) &&
        (overload?.level === "high" || (overload?.technicalScore ?? 0) >= 75)) {
        choiceApproach = "guided_collaboration";
    }
    else if (choice?.level === "high" && overload?.level !== "high") {
        choiceApproach = "options_within_frame";
    }
    else if (overload?.level === "high") {
        choiceApproach = "directed_with_one_alt";
    }
    const communication = expl?.level === "high" && coach?.level === "high"
        ? "explain_then_direct"
        : coach?.level === "high"
            ? "direct_short"
            : expl?.level === "high"
                ? "explanatory"
                : "balanced";
    const foodPlanning = plan?.agreement === "mixed" || plan?.level === "uncertain"
        ? "clarify_then_prep"
        : plan?.level === "low"
            ? "rescue_meals"
            : plan?.level === "high"
                ? "structured_prep"
                : "flexible_prep";
    const foodRecovery = comp?.level === "high" || comp?.trendDisplay === "high_to_confirm"
        ? "next_meal_normal"
        : "standard_flex";
    const foodStructure = nutStruct?.agreement === "mixed"
        ? "clarify_structure_need"
        : nutStruct?.level === "high"
            ? "precise_examples"
            : nutStruct?.level === "low"
                ? "principles_only"
                : "light_structure";
    // Fingerprints let adaptive confirmations change a decision even when the
    // coarse protocol label stays the same (e.g. still twice-weekly follow-up).
    const adherenceFingerprint = [
        maintenance?.level ?? "na",
        recoverySignal?.level ?? "na",
        adherence?.agreement ?? "na",
        adherence?.trendDisplay ?? "na",
    ].join("|");
    const planningFingerprint = [
        plan?.level ?? "na",
        plan?.agreement ?? "na",
        nutStruct?.level ?? "na",
        nutStruct?.agreement ?? "na",
    ].join("|");
    return {
        follow_up_frequency: `${followUp}::${adherenceFingerprint}`,
        training_structure: trainingStructure,
        recovery_protocol: `${recovery}::${adherenceFingerprint}`,
        all_or_nothing_protocol: aonProtocol,
        choice_approach: choiceApproach,
        communication_style: communication,
        food_planning_approach: `${foodPlanning}::${planningFingerprint}`,
        food_recovery_protocol: foodRecovery,
        food_structure: `${foodStructure}::${planningFingerprint}`,
    };
}
function cloneAnswersWithLikert(questions, answers, code, numericValue) {
    const q = questions.find((item) => item.code === code);
    if (!q)
        return answers;
    const rest = answers.filter((a) => a.questionId !== q.id);
    return [
        ...rest,
        {
            questionId: q.id,
            numericValue,
        },
    ];
}
/**
 * Simulate answers 1–5 for a candidate; true if any changes an important decision.
 */
export function canAdaptiveAnswerChangeDecision(params) {
    const baseDomains = V41_DOMAIN_DEFINITIONS.map((definition) => interpretDomain({
        definition,
        questions: params.questions,
        answers: params.answers,
    })).filter((d) => d.itemCount > 0);
    const baseDecisions = deriveCoachingDecisions(baseDomains);
    const relevant = new Set(params.affectedDecisionIds);
    for (let value = 1; value <= 5; value += 1) {
        const simAnswers = cloneAnswersWithLikert(params.questions, params.answers, params.candidateQuestionCode, value);
        const simDomains = V41_DOMAIN_DEFINITIONS.map((definition) => interpretDomain({
            definition,
            questions: params.questions,
            answers: simAnswers,
        })).filter((d) => d.itemCount > 0);
        const simDecisions = deriveCoachingDecisions(simDomains);
        for (const id of relevant) {
            if (baseDecisions[id] !== simDecisions[id])
                return true;
        }
    }
    return false;
}
function ambiguityScore(domain) {
    if (!domain)
        return 0;
    if (domain.agreement === "strongly_divergent")
        return 100;
    if (domain.agreement === "mixed")
        return 70;
    if (domain.agreement === "insufficient" || domain.evidenceStrength === "limited") {
        return 55;
    }
    if (domain.level === "uncertain")
        return 60;
    return 20;
}
export function evaluateAdaptiveCandidates(input) {
    const baseQuestions = input.questions.filter((q) => !q.interpretationTags?.includes("adaptive_bank"));
    const domains = V41_DOMAIN_DEFINITIONS.map((definition) => interpretDomain({
        definition,
        questions: baseQuestions,
        answers: input.answers,
    }));
    const byDomain = new Map(domains.map((d) => [d.domainId, d]));
    return V41_ADAPTIVE_CANDIDATES.map((c) => {
        const domain = byDomain.get(c.domainId) ??
            byDomain.get(c.domainId === "adherence_maintenance" ||
                c.domainId === "adherence_recovery_signal" ||
                c.domainId === "adherence_history"
                ? "adherence_recovery"
                : c.domainId);
        const parentForAdherence = c.domainId.startsWith("adherence")
            ? byDomain.get("adherence_recovery")
            : domain;
        const amb = ambiguityScore(parentForAdherence ?? domain);
        const canChange = canAdaptiveAnswerChangeDecision({
            questions: input.questions,
            answers: input.answers,
            candidateQuestionCode: c.code,
            affectedDecisionIds: c.affectedDecisionIds,
        });
        let decisionImpact = "none";
        let rejectionReason;
        if (!canChange) {
            rejectionReason = "no_decision_impact";
        }
        else if (c.priority === "critical") {
            decisionImpact = "high";
        }
        else if (c.priority === "high") {
            decisionImpact = amb >= 55 ? "high" : "moderate";
        }
        else {
            decisionImpact = amb >= 70 ? "moderate" : "low";
        }
        // Require decision impact plus ambiguity OR a fragile/high-risk safety domain.
        const target = parentForAdherence ?? domain;
        const safety = safetyPriority(c.domainId) <= 2;
        const fragileSafety = safety &&
            (target?.level === "low" ||
                target?.level === "uncertain" ||
                target?.trendDisplay === "low_to_confirm" ||
                target?.trendDisplay === "high_to_confirm" ||
                (c.domainId === "all_or_nothing" &&
                    (target?.level === "high" || target?.level === "moderate")));
        const needsAsk = canChange &&
            (fragileSafety ||
                target?.agreement === "strongly_divergent" ||
                target?.agreement === "mixed" ||
                (target?.evidenceStrength === "limited" &&
                    (target?.level === "low" ||
                        target?.level === "high" ||
                        target?.level === "uncertain")));
        if (canChange && !needsAsk) {
            rejectionReason = "insufficient_ambiguity";
            decisionImpact = "none";
        }
        const domainIdx = V41_DOMAIN_SELECTION_PRIORITY.indexOf(c.domainId);
        const priorityScore = (4 - safetyPriority(c.domainId)) * 100_000 +
            (3 - priorityRank(c.priority)) * 10_000 +
            amb * 100 +
            (domainIdx === -1 ? 0 : (80 - domainIdx) * 10) +
            // deterministic tie-break via code
            (200 - c.code.charCodeAt(0));
        return {
            questionCode: c.code,
            domainId: c.domainId,
            affectedDecisionIds: c.affectedDecisionIds,
            decisionImpact: needsAsk ? decisionImpact : "none",
            ambiguityReductionPotential: amb,
            priorityScore,
            selected: false,
            rejectionReason: needsAsk ? undefined : rejectionReason ?? "rejected",
        };
    });
}
/**
 * Select up to 4 adaptive questions that can change a coaching decision.
 * At most one question per domainId. Deterministic.
 */
export function selectAdaptiveQuestionsV41(input) {
    const max = Math.min(input.max ?? MAX_ADAPTIVE_QUESTIONS, MAX_ADAPTIVE_QUESTIONS);
    const bank = input.questions.filter((q) => q.interpretationTags?.includes("adaptive_bank"));
    const evaluations = evaluateAdaptiveCandidates(input)
        .filter((e) => e.decisionImpact !== "none")
        .sort((a, b) => {
        if (b.priorityScore !== a.priorityScore)
            return b.priorityScore - a.priorityScore;
        return a.questionCode.localeCompare(b.questionCode);
    });
    const finalCodes = [];
    const domains = new Set();
    // Also track parent adherence family as one domain for max-per-domain
    const domainKey = (id) => id.startsWith("adherence") ? "adherence_family" : id;
    for (const e of evaluations) {
        const key = domainKey(e.domainId);
        if (domains.has(key))
            continue;
        if (domains.size >= max)
            break;
        // Enforce MAX_ADAPTIVE_PER_DOMAIN (1)
        const sameDomainCount = finalCodes.filter((code) => {
            const cand = V41_ADAPTIVE_CANDIDATES.find((c) => c.code === code);
            return cand && domainKey(cand.domainId) === key;
        }).length;
        if (sameDomainCount >= MAX_ADAPTIVE_PER_DOMAIN)
            continue;
        domains.add(key);
        finalCodes.push(e.questionCode);
        e.selected = true;
        if (finalCodes.length >= max)
            break;
    }
    return bank
        .filter((q) => finalCodes.includes(q.code))
        .sort((a, b) => finalCodes.indexOf(a.code) - finalCodes.indexOf(b.code));
}
export function buildQuestionnaireMetrics(input) {
    const total = input.baseQuestionCount + input.adaptiveSelectedCount;
    if (input.adaptiveSelectedCount > MAX_ADAPTIVE_QUESTIONS) {
        throw new Error(`Adaptive selection exceeds max (${input.adaptiveSelectedCount} > ${MAX_ADAPTIVE_QUESTIONS})`);
    }
    if (total > QUESTIONNAIRE_V41_ADAPTIVE_MAX + 34) {
        throw new Error(`Total questions exceed 38 (${total})`);
    }
    return {
        baseQuestionCount: input.baseQuestionCount,
        adaptiveCandidateCount: input.adaptiveCandidateCount,
        adaptiveSelectedCount: input.adaptiveSelectedCount,
        totalQuestionCount: total,
        adaptiveSelectionMs: input.adaptiveSelectionMs,
    };
}
export function assertAdaptiveSelectionValid(codes) {
    if (codes.length > MAX_ADAPTIVE_QUESTIONS) {
        throw new Error(`Too many adaptive questions: ${codes.length}`);
    }
    const domains = new Set();
    for (const code of codes) {
        const c = V41_ADAPTIVE_CANDIDATES.find((x) => x.code === code);
        if (!c)
            throw new Error(`Unknown adaptive code: ${code}`);
        const key = c.domainId.startsWith("adherence") ? "adherence_family" : c.domainId;
        if (domains.has(key)) {
            throw new Error(`Multiple adaptive questions for domain ${key}`);
        }
        domains.add(key);
    }
}
/** Build a minimal model snapshot for decision simulation debugging/tests. */
export function buildPartialCoachReportModel(input) {
    const domains = V41_DOMAIN_DEFINITIONS.map((definition) => interpretDomain({
        definition,
        questions: input.questions,
        answers: input.answers,
    })).filter((d) => d.itemCount > 0);
    return {
        domains,
        decisions: deriveCoachingDecisions(domains),
    };
}
