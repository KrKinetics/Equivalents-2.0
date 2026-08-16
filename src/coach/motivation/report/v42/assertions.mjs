export function assertNarrativeMatchesDomainInterpretations(report) {
    const errors = [];
    const byId = new Map(report.domainInterpretations.map((d) => [d.domainId, d]));
    const sportText = report.sport.narrativeSections
        .flatMap((s) => s.paragraphs)
        .join(" ")
        .toLowerCase();
    const longTerm = byId.get("long_term_projection");
    if (longTerm?.agreement === "consistent" && longTerm.level === "low") {
        if (!sportText.includes("faible")) {
            errors.push("Sport narrative should reflect consistent low long-term projection (faible).");
        }
    }
    for (const domain of report.domainInterpretations) {
        if (domain.itemCount === 1 && domain.agreementLabel === "Cohérente") {
            errors.push(`Domain '${domain.domainId}' must not show agreementLabel 'Cohérente' with a single item.`);
        }
    }
    if (report.sport.narrativeSections.length !== 4) {
        errors.push(`Sport narrative must have 4 sections, got ${report.sport.narrativeSections.length}.`);
    }
    const nutritionText = report.nutrition?.narrativeSections.flatMap((s) => s.paragraphs).join(" ") ?? "";
    if (report.nutrition && nutritionText.length < 120) {
        errors.push("Nutrition narrative should synthesize multiple indicators.");
    }
    if (nutritionText.includes("constituent une meilleure")) {
        errors.push("Nutrition role narrative should use 'constituent probablement'.");
    }
    return errors;
}
export function assertOperationalFindingsMatchEvidence(report) {
    const errors = [];
    const byId = new Map(report.domainInterpretations.map((d) => [d.domainId, d]));
    for (const finding of report.actionableFindings) {
        if (finding.id === "f_adherence") {
            const adherence = byId.get("adherence_recovery");
            if (adherence &&
                adherence.level === "high" &&
                adherence.agreement === "consistent" &&
                adherence.itemCount > 1) {
                errors.push("Adherence finding should not fire when adherence is consistently high.");
            }
        }
        if (finding.id === "f_long_term") {
            const lt = byId.get("long_term_projection");
            if (lt?.agreement === "consistent" && lt.level === "low") {
                errors.push("Long-term finding should not mark consistent low projection as contradictory.");
            }
        }
    }
    for (const strength of report.confirmedStrengths) {
        if (strength.type === "confirmed_strength" && !strength.title.includes("confirmée")) {
            errors.push(`Unexpected confirmed strength title: ${strength.title}`);
        }
    }
    for (const strength of report.probableStrengths) {
        if (strength.title.includes("Force confirmée")) {
            errors.push("Probable strengths must not use 'Force confirmée'.");
        }
        if (strength.title.includes("fortement appuyée") && strength.source) {
            const domain = byId.get(strength.source);
            if (domain?.itemCount === 1) {
                errors.push("Single-item domain must not produce 'fortement appuyée' strength.");
            }
        }
    }
    for (const lever of report.probableLevers) {
        if (lever.source) {
            const domain = byId.get(lever.source);
            if (domain?.itemCount === 1 &&
                !lever.title.includes("appui limité") &&
                !lever.detail?.includes("appui limité")) {
                errors.push("Single-item high domain should appear as lever with limited support.");
            }
        }
    }
    for (const obstacle of report.normalizedObstacles) {
        if (obstacle.practicalAction.includes("Identifier une action minimale face à")) {
            errors.push(`Obstacle '${obstacle.canonicalId}' must not use generic minimal action.`);
        }
    }
    return errors;
}
export function assertUsabilityMatchesDomainInterpretations(report) {
    const errors = [];
    const { usability } = report;
    for (const label of usability.coherentDomains) {
        const domain = report.domainInterpretations.find((d) => d.label === label);
        if (!domain)
            continue;
        if (domain.agreement !== "consistent" || domain.itemCount <= 1) {
            errors.push(`Domain '${label}' listed as coherent but agreement/itemCount invalid.`);
        }
        if (usability.mixedDomains.includes(label)) {
            errors.push(`Domain '${label}' cannot be both coherent and mixed.`);
        }
    }
    for (const label of usability.mixedDomains) {
        const domain = report.domainInterpretations.find((d) => d.label === label);
        if (domain && domain.agreement !== "mixed") {
            errors.push(`Domain '${label}' listed as mixed but agreement is ${domain.agreement}.`);
        }
    }
    return errors;
}
export function assertReportModelV42(report) {
    return [
        ...assertNarrativeMatchesDomainInterpretations(report),
        ...assertOperationalFindingsMatchEvidence(report),
        ...assertUsabilityMatchesDomainInterpretations(report),
    ];
}
