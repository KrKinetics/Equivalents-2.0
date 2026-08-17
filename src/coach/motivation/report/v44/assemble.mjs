import { assembleCoachReportSnapshotV43 } from '../v43/assemble.mjs';
import { assertReportModelV44 } from './assertions.mjs';
import { buildCanonicalFindings, findingByKey } from './findings.mjs';
import { buildCoachDecisionBrief, buildCoachPrioritiesV44 } from './coach-brief.mjs';
import { buildFourWeekPlanV44 } from './plan.mjs';
import { buildNutritionActionCards } from './nutrition.mjs';

function overlayBrief(brief, findings) {
  const adherence = findingByKey(findings, 'adherence_recovery');
  const structureFood = findingByKey(findings, 'nutrition_structure');
  const next = { ...brief };
  if (adherence && adherence.claimStrength !== 'supported') {
    next.likelyDropoffPattern = adherence.interpretation;
    if (next.recoveryStrategy && /reprise\s*:\s*(élevée|haute|forte)/i.test(next.recoveryStrategy)) {
      next.recoveryStrategy = adherence.interpretation;
    }
  }
  if (structureFood && structureFood.claimStrength !== 'supported') {
    next.structurePreference = structureFood.interpretation;
  }
  return next;
}

export function assembleCoachReportSnapshotV44(input) {
  const baseline = assembleCoachReportSnapshotV43(input);
  const findings = buildCanonicalFindings(baseline.domainInterpretations || []);
  const brief = overlayBrief(baseline.athleteOperatingBrief || {}, findings);
  const decisionBrief = buildCoachDecisionBrief({
    brief,
    findings,
    conflicts: baseline.conflicts,
    interview: baseline.priorityInterviewQuestions,
  });
  const priorities = buildCoachPrioritiesV44({ brief, decisionBrief, findings });
  const fourWeekPlanDetailed = buildFourWeekPlanV44({
    brief,
    findings,
    conflicts: baseline.conflicts,
  });
  const nutritionAction = buildNutritionActionCards({
    brief,
    findings,
    obstacles: baseline.declaredObstacles,
  });

  const portraitCoach = {
    ...baseline.portraitCoach,
    sections: (baseline.portraitCoach?.sections || []).map((section) => ({
      ...section,
      paragraphs: (section.paragraphs || []).map((line) => {
        const adherence = findingByKey(findings, 'adherence_recovery');
        if (!adherence || adherence.claimStrength === 'supported') return line;
        return String(line).replace(
          /Reprise(?: après interruption)?\s*:\s*(élevée|haute|forte)/gi,
          `Reprise : signal ${adherence.tendency} (${adherence.confidenceStatus})`,
        );
      }),
    })),
  };

  const snapshot = {
    ...baseline,
    schemaVersion: 'report-model-v4.4',
    portraitCoach,
    canonicalFindings: findings,
    presentedDomains: findings.map((item) => ({
      domainId: item.domain,
      label: item.label,
      itemCount: item.evidenceCount,
      agreement: item.consistency,
      evidenceStrength: item.confidence,
      level: item.tendency,
      technicalScore: item.rawScore,
      displayScore: item.displayScore,
      displayLabel: item.claimStrength === 'single'
        ? `Tendance ${item.tendency}`
        : item.claimStrength === 'mixed'
          ? 'Signal mixte'
          : item.claimStrength === 'divergent'
            ? 'Réponses contradictoires'
            : item.displayLabel,
      evidenceBadge: item.confidenceStatus,
      signalDirection: item.direction,
      coachMeaning: item.coachImpact,
      claimStrength: item.claimStrength,
      tendency: item.tendency,
      confidence: item.confidence,
      changesCoaching: item.changesCoaching,
    })),
    athleteOperatingBrief: brief,
    coachDecisionBrief: decisionBrief,
    coachPriorities: priorities,
    nutritionAction,
    fourWeekPlanDetailed,
    fourWeekPlan: {
      weeks: fourWeekPlanDetailed.map((week) => ({
        week: week.week,
        title: week.title,
        objective: week.objective,
        focus: week.focus,
        coachAction: week.coachAction,
        observe: week.observe,
        validationCriterion: week.validationCriterion,
        coachActions: [week.coachAction],
        actions: [week.coachAction],
        provenance: week.provenance,
      })),
    },
    metadata: {
      ...baseline.metadata,
      reportModelVersion: 'v4.4',
      clientId: input.clientId || baseline.metadata?.clientId,
      clientName: input.clientName || baseline.metadata?.clientName,
    },
    initialPlan: {
      ...baseline.initialPlan,
      priorities,
      firstFourWeeksActions: fourWeekPlanDetailed.map((week) => week.coachAction),
    },
  };

  const consistencyErrors = assertReportModelV44(snapshot);
  if (consistencyErrors.length > 0 && process.env.NODE_ENV === 'test') {
    Object.assign(snapshot.metadata, { consistencyWarnings: consistencyErrors });
  }
  return snapshot;
}

export { isCoachReportSnapshotV44 } from './assertions.mjs';
