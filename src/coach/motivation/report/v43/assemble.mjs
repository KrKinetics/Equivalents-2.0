import { assembleCoachReportSnapshotV42 } from '../v42/assemble.mjs';
import { applyPresentationEvidenceRulesAll } from '../../scoring/presentation-evidence-v42.mjs';
import { interpretAllDomainsV42 } from '../../scoring/domain-interpretation-v42.mjs';
import { toCoachingIndicator } from '../../scoring/domain-interpretation-v41.mjs';
import { assertReportModelV43 } from './assertions.mjs';
import { canMakeStrongClaim } from './evidence.mjs';
import { buildSportNarrativeSectionsV43 } from './narrative.mjs';
import { presentDomains } from './dimension-presentation.mjs';
import { buildSupportBlock } from './strengths.mjs';
import { buildFirstClassConflictsV43 } from './conflicts.mjs';
import { buildAthleteOperatingBrief } from './operating-brief.mjs';
import { buildInterviewQuestionsV43 } from './interview.mjs';
import { buildFourWeekPlanV43 } from './plan.mjs';

function reportConfidence(usability) {
  if (usability?.level === 'strong') {
    return { id: 'solid', label: 'SOLIDE', coachLabel: 'Lecture Coach : solide' };
  }
  if (usability?.level === 'limited') {
    return { id: 'limited', label: 'LIMITÉ', coachLabel: 'Lecture Coach : limitée' };
  }
  return {
    id: 'usable_with_validation',
    label: 'UTILISABLE AVEC VALIDATION',
    coachLabel: 'Lecture Coach : utilisable avec validation',
  };
}

function gateFindings(findings, domains) {
  const results = (domains || []).find((item) => item.domainId === 'results_orientation');
  return (findings || []).map((finding) => {
    if (finding.id === 'f_results' && results && !canMakeStrongClaim(results)) {
      return {
        ...finding,
        title: 'Engagement possiblement influencé par les résultats visibles',
        interpretation: 'Un premier signal suggère que les résultats visibles pourraient jouer un rôle important dans la motivation; à confirmer avec l\'athlète.',
      };
    }
    return finding;
  });
}

function splitRiskBuckets({ findings, conflicts, usability }) {
  const risks = (findings || [])
    .filter((item) => item.importance === 'high' || /vigilance|risque|tout-ou-rien|reprise/i.test(`${item.title} ${item.interpretation}`))
    .map((item) => item.title);
  const hypotheses = [
    ...(usability?.highImpactDomainsToValidate || []),
    ...(findings || [])
      .filter((item) => item.importance !== 'high')
      .map((item) => item.title),
  ];
  return {
    risksToPrevent: [...new Set(risks)].slice(0, 4),
    hypothesesToTest: [...new Set(hypotheses)].slice(0, 5),
    contradictionsToResolve: (conflicts || []).map((item) => item.title || item.coachImplication).filter(Boolean),
  };
}

export function assembleCoachReportSnapshotV43(input) {
  const baseline = assembleCoachReportSnapshotV42(input);
  const domains = applyPresentationEvidenceRulesAll(interpretAllDomainsV42({
    questions: input.questions,
    answers: input.answers,
  }));
  const choiceApproach = baseline.initialPlan?.choiceApproach || {};
  const sportNarrative = buildSportNarrativeSectionsV43(domains, choiceApproach, {
    hasWellbeingGoal: Boolean(baseline.openAnswers?.some((item) => item.status === 'wellbeing_goal_needs_definition')),
  });
  const presentedDomains = presentDomains(domains);
  const supportBlock = buildSupportBlock({
    confirmedStrengths: baseline.confirmedStrengths,
    probableStrengths: baseline.probableStrengths,
    probableLevers: baseline.probableLevers,
    declaredLevers: baseline.declaredLevers,
  });
  const conflicts = buildFirstClassConflictsV43({
    domains,
    obstacles: baseline.normalizedObstacles,
    openAnswers: baseline.openAnswers,
    existing: baseline.conflicts,
  });
  const usability = baseline.usability || {};
  const confidence = reportConfidence(usability);
  const brief = buildAthleteOperatingBrief({
    openAnswers: baseline.openAnswers,
    directAnswers: baseline.directAnswers,
    domains,
    readiness: baseline.readiness,
    choiceApproach,
    communicationApproach: baseline.initialPlan?.communicationApproach,
    declaredObstacles: baseline.declaredObstacles,
    conflicts,
    supportBlock,
    usability,
  });
  const interview = buildInterviewQuestionsV43({
    openAnswers: baseline.openAnswers,
    directAnswers: baseline.directAnswers,
    obstacles: baseline.declaredObstacles,
    normalizedObstacles: baseline.normalizedObstacles,
    choiceApproach,
    followUpTwiceWeekly: baseline.readiness?.followUpFrequency === 'twice_weekly',
    conflicts,
  });
  const fourWeekPlanDetailed = buildFourWeekPlanV43({
    brief,
    choiceApproach,
    conflicts,
    recoveryStrategy: brief.recoveryStrategy,
    nutritionFocus: brief.nutritionFocus,
  });
  const fourWeekPlan = {
    weeks: fourWeekPlanDetailed.map((week) => ({
      week: week.week,
      title: week.title,
      objective: week.objective,
      focus: week.focus,
      coachActions: week.actions.map((item) => item.text),
      actions: week.actions.map((item) => item.text),
      provenance: week.actions.map((item) => item.provenance),
    })),
  };
  const findings = gateFindings(baseline.findings, domains);
  const buckets = splitRiskBuckets({ findings, conflicts, usability });
  const results = domains.find((item) => item.domainId === 'results_orientation');
  const resultsSummary = canMakeStrongClaim(results) && results.level === 'high'
    ? baseline.initialPlan.profileSummary
    : sportNarrative[0]?.paragraphs[0] ?? baseline.initialPlan.profileSummary;

  const snapshot = {
    ...baseline,
    schemaVersion: 'report-model-v4.3',
    questionnaireVersion: input.questionnaireVersion || 'questionnaire-v4.2',
    rulesetVersion: input.rulesetVersion || 'ruleset-v4.2',
    domainInterpretations: domains,
    coachingIndicators: domains.map((item) => toCoachingIndicator(item)),
    presentedDomains,
    supportBlock,
    athleteOperatingBrief: brief,
    portraitCoach: {
      title: 'PORTRAIT COACH',
      sections: sportNarrative,
    },
    reportConfidence: confidence,
    conflicts,
    findings,
    riskBuckets: buckets,
    priorityInterviewQuestions: interview,
    fourWeekPlanDetailed,
    fourWeekPlan,
    metadata: {
      ...baseline.metadata,
      reportModelVersion: 'v4.3',
      rulesetVersion: input.rulesetVersion || 'ruleset-v4.2',
      questionnaireVersion: input.questionnaireVersion || 'questionnaire-v4.2',
    },
    initialPlan: {
      ...baseline.initialPlan,
      profileSummary: resultsSummary,
      portraitOperational: sportNarrative[0]?.paragraphs[0] ?? resultsSummary,
      mainStrengths: supportBlock.established
        ? supportBlock.items.filter((item) => item.stance === 'CONFIRMÉ' || item.stance === 'PROBABLE').map((item) => item.title)
        : [supportBlock.summary],
      probableLevers: supportBlock.items.filter((item) => item.stance === 'PROBABLE').map((item) => item.title),
      declaredLevers: supportBlock.items.filter((item) => item.stance === 'DÉCLARÉ PAR L\'ATHLÈTE'),
      priorityInterviewQuestions: interview.map((item) => item.text),
      firstFourWeeksActions: fourWeekPlanDetailed.flatMap((week) => week.actions.map((item) => item.text)).slice(0, 8),
    },
    sport: {
      ...baseline.sport,
      domainInterpretations: domains.filter((item) => [
        'autonomous_motivation',
        'autonomous_value_without_results',
        'results_orientation',
        'results_delay_sensitivity',
        'adherence_recovery',
        'all_or_nothing',
        'delay_tolerance',
        'long_term_projection',
        'structure_need',
        'explanation_need',
        'choice_interest',
        'option_overload',
        'coach_receptivity',
      ].includes(item.domainId)),
      narrativeSections: sportNarrative,
      wordCount: sportNarrative.flatMap((item) => item.paragraphs).join(' ').split(/\s+/).length,
    },
  };

  const consistencyErrors = assertReportModelV43(snapshot);
  if (consistencyErrors.length > 0 && process.env.NODE_ENV === 'test') {
    Object.assign(snapshot.metadata, { consistencyWarnings: consistencyErrors });
  }
  return snapshot;
}

export { isCoachReportSnapshotV43 } from './assertions.mjs';
