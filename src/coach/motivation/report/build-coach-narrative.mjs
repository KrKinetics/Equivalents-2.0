/**
 * Presentation-only coach narrative.
 * Connects existing view-model signals. Never scores. Never invents facts.
 */

import { inferClaimStrength } from './presentation-labels.mjs';
import { qualifyNarrativeClaim } from './presentation-claim-consistency.mjs';

const FINDING_ALIASES = {
  motivation: ['autonomous_motivation', 'autonomous_value_without_results'],
  results: ['results_orientation', 'results_delay_sensitivity'],
  structure: ['structure_need'],
  choice: ['choice_interest', 'choice_need', 'option_overload'],
  communication: ['coach_receptivity', 'explanation_need'],
  adherence: ['adherence_recovery', 'adherence_maintenance', 'adherence_recovery_signal', 'adherence_history'],
  delay: ['delay_tolerance', 'long_term_projection'],
  rigidity: ['all_or_nothing'],
  nutrition: ['nutrition_structure', 'nutrition_planning', 'nutrition_value', 'food_flexibility', 'performance_fueling'],
  compensatory: ['compensatory_food', 'emotional_stress_food', 'emotional_reward_food'],
};

function text(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    return text(value.label || value.title || value.text || value.message || value.value || value.rawLabel || '');
  }
  const out = String(value).replace(/\s+/g, ' ').trim();
  if (!out || out === '[object Object]') return '';
  return out.replace(/\s*;\s*\[object Object\]/g, '').replace(/\[object Object\]\s*;\s*/g, '').trim();
}

function decapitalize(value) {
  const raw = text(value);
  if (!raw) return '';
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function sentence(value) {
  let raw = text(value).replace(/[.]+$/, '');
  if (!raw) return '';
  raw = raw
    .replace(/\bà confirmer en entrevue,\s*à confirmer en entrevue\b/gi, 'à confirmer en entrevue')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+,/g, ',');
  return /[.!?]$/.test(raw) ? raw : `${raw}.`;
}

function findingId(row = {}) {
  return text(row.id || row.domainId || row.key || row.domain);
}

function strengthOf(row) {
  return inferClaimStrength(row || {});
}

function findByIds(findings, ids) {
  return (findings || []).find((row) => ids.includes(findingId(row))) || null;
}

function familyFinding(findings, family) {
  return findByIds(findings, FINDING_ALIASES[family] || []);
}

function hedge(strength, supported, mixed, single, conflict, unknown = '') {
  if (strength === 'supported') return supported;
  if (strength === 'mixed') return mixed;
  if (strength === 'divergent') return conflict;
  if (strength === 'single') return single;
  return unknown;
}

function meaningClause(row) {
  const meaning = text(row?.coachMeaning || row?.interpretation);
  if (!meaning) return '';
  const strength = strengthOf(row);
  if (/donnée unique|appui limité/i.test(meaning)) return '';
  if (strength === 'mixed' && /signal (?:reste )?mixte|hypothèse à tester/i.test(meaning)) return '';
  if (/^signal mixte\b|^tendance (élevée|modérée|faible)\b/i.test(meaning) && meaning.length < 90) return '';
  return decapitalize(meaning
    .replace(/^Hypothèse à tester\s*:\s*/i, '')
    .replace(/^Première indication à confirmer\s*:\s*/i, '')
    .replace(/^Un premier signal (?:laisse penser|suggère)(?: que)?\s*/i, '')
    .replace(/^Les réponses indiquent\s+/i, '')
    .replace(/^Le profil suggère\s+/i, '')
    .replace(/,?\s*à confirmer en entrevue\.?$/i, ''));
}

function structurePhrase(value) {
  const raw = text(value);
  if (!raw) return '';
  const recommended = raw.match(/^Structure recommandée\s*:\s*(.+)$/i);
  if (recommended) return `une structure ${decapitalize(recommended[1])}`;
  if (/^Structure\b/i.test(raw)) return `une ${decapitalize(raw)}`;
  return decapitalize(raw);
}

function normalizeKey(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fingerprint(value) {
  return normalizeKey(value).slice(0, 72);
}

function collectReservedFingerprints(viewModel) {
  const reserved = new Set();
  const add = (value) => {
    const key = fingerprint(value);
    if (key.length >= 24) reserved.add(key);
  };
  for (const section of viewModel.portraitCoach || []) {
    (section.paragraphs || []).forEach(add);
  }
  (viewModel.coachPriorities || []).forEach(add);
  (viewModel.fourWeekPlan || []).forEach((week) => {
    [week.objective, week.focus, week.coachAction, week.observe, week.validationCriterion, ...(week.actions || [])]
      .filter(Boolean)
      .forEach(add);
  });
  return reserved;
}

function pushUnique(target, reserved, used, paragraph) {
  const qualified = text(paragraph);
  if (!qualified) return;
  const key = fingerprint(qualified);
  if (used.has(key) || reserved.has(key)) return;
  used.add(key);
  target.push(qualified);
}

function countWords(paragraphs) {
  return paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
}

function sourceCount(values) {
  return values.filter(Boolean).length;
}

export function auditNarrativeSourceCoverage(viewModel = {}) {
  const brief = viewModel.athleteOperatingBrief || {};
  const decision = viewModel.coachDecisionBrief || {};
  const findings = viewModel.dimensions || [];
  const nutrition = viewModel.nutritionAction || viewModel.nutritionOrganized || viewModel.nutrition || {};
  const areas = [
    {
      id: 'objectif',
      sources: sourceCount([brief.primaryGoal, decision.athleteGoal]),
      directAnswers: sourceCount([brief.primaryGoal, decision.athleteGoal]),
      evidence: brief.primaryGoal || decision.athleteGoal ? 'direct' : 'missing',
      clarificationUseful: !(brief.primaryGoal || decision.athleteGoal),
    },
    {
      id: 'pourquoi_maintenant',
      sources: sourceCount([brief.whyNow, decision.whyNow, decision.whyNowCaptured]),
      directAnswers: decision.whyNowCaptured ? 1 : sourceCount([brief.whyNow]),
      evidence: decision.whyNowCaptured || brief.whyNow ? 'direct' : 'missing',
      clarificationUseful: !decision.whyNowCaptured && !brief.whyNow,
    },
    {
      id: 'reussite',
      sources: sourceCount([brief.successDefinition, decision.successDescribed, ...(brief.progressSignals || [])]),
      directAnswers: sourceCount([brief.successDefinition, decision.successDescribed]),
      evidence: brief.successDefinition || decision.successDescribed ? 'direct' : 'limited',
      clarificationUseful: !(brief.successDefinition || decision.successDescribed),
    },
    {
      id: 'obstacles',
      sources: sourceCount([...(brief.declaredBarriers || []), ...(viewModel.riskBuckets?.risksToPrevent || [])]),
      directAnswers: (brief.declaredBarriers || []).length,
      evidence: (brief.declaredBarriers || []).length ? 'direct' : 'limited',
      clarificationUseful: (brief.declaredBarriers || []).length === 0,
    },
    {
      id: 'adhesion',
      sources: sourceCount([familyFinding(findings, 'adherence')]),
      directAnswers: familyFinding(findings, 'adherence')?.itemCount || 0,
      evidence: strengthOf(familyFinding(findings, 'adherence')) || 'unknown',
      clarificationUseful: !['supported'].includes(strengthOf(familyFinding(findings, 'adherence'))),
    },
    {
      id: 'reprise',
      sources: sourceCount([brief.recoveryStrategy, brief.likelyDropoffPattern, familyFinding(findings, 'adherence')]),
      directAnswers: sourceCount([brief.recoveryStrategy]),
      evidence: brief.recoveryStrategy ? 'direct' : (strengthOf(familyFinding(findings, 'adherence')) || 'unknown'),
      clarificationUseful: !brief.recoveryStrategy,
    },
    {
      id: 'structure',
      sources: sourceCount([brief.structurePreference, familyFinding(findings, 'structure')]),
      directAnswers: sourceCount([brief.structurePreference]),
      evidence: strengthOf(familyFinding(findings, 'structure')) || (brief.structurePreference ? 'direct' : 'unknown'),
      clarificationUseful: strengthOf(familyFinding(findings, 'structure')) !== 'supported',
    },
    {
      id: 'choix',
      sources: sourceCount([brief.choicePreference, familyFinding(findings, 'choice')]),
      directAnswers: sourceCount([brief.choicePreference]),
      evidence: strengthOf(familyFinding(findings, 'choice')) || (brief.choicePreference ? 'direct' : 'unknown'),
      clarificationUseful: strengthOf(familyFinding(findings, 'choice')) !== 'supported',
    },
    {
      id: 'communication',
      sources: sourceCount([brief.communicationPreference, familyFinding(findings, 'communication')]),
      directAnswers: sourceCount([brief.communicationPreference]),
      evidence: strengthOf(familyFinding(findings, 'communication')) || (brief.communicationPreference ? 'direct' : 'unknown'),
      clarificationUseful: strengthOf(familyFinding(findings, 'communication')) !== 'supported',
    },
    {
      id: 'nutrition',
      sources: sourceCount([
        brief.nutritionFocus,
        nutrition.seek,
        ...(nutrition.cards || []),
        ...(nutrition.said || []),
        ...(nutrition.lecture || []),
      ]),
      directAnswers: sourceCount([brief.nutritionFocus, nutrition.seek, ...(nutrition.said || [])]),
      evidence: (nutrition.cards || []).length || brief.nutritionFocus ? 'direct' : 'limited',
      clarificationUseful: !brief.nutritionFocus && !(nutrition.cards || []).length,
    },
  ];
  return {
    areas,
    gaps: areas.filter((area) => area.clarificationUseful),
  };
}

function howAthleteWorks(vm, findings, reserved, used) {
  const brief = vm.athleteOperatingBrief || {};
  const decision = vm.coachDecisionBrief || {};
  const motivation = familyFinding(findings, 'motivation');
  const results = familyFinding(findings, 'results');
  const structure = familyFinding(findings, 'structure');
  const choice = familyFinding(findings, 'choice');
  const delay = familyFinding(findings, 'delay');
  const adherence = familyFinding(findings, 'adherence');
  const out = [];

  const goal = text(decision.athleteGoal || brief.primaryGoal);
  const success = text(decision.successDescribed || brief.successDefinition);
  if (goal) {
    pushUnique(out, reserved, used, sentence(
      `Ce qui semble mobiliser cet athlète, d'après ce qu'il a déclaré, est ${decapitalize(goal)}`,
    ));
  }
  if (success) {
    pushUnique(out, reserved, used, sentence(
      `La réussite est décrite comme ${decapitalize(success)} — c'est le critère à utiliser pour juger si le coaching avance, plutôt qu'un standard externe`,
    ));
  }

  if (motivation) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(motivation),
      `Les réponses convergent vers une motivation plutôt interne : ${meaningClause(motivation) || 'l\'athlète avance davantage par sens et maîtrise que par pression externe'}`,
      `Le profil suggère une motivation interne possible, mais les réponses sont mixtes; ${meaningClause(motivation) || 'observer ce qui tient réellement l\'engagement avant de conclure'}`,
      `Un premier signal laisse penser que ${meaningClause(motivation) || 'la motivation interne joue un rôle'}; à confirmer en entrevue`,
      'Les réponses se contredisent sur ce qui motive réellement. Ne pas conclure avant l\'entrevue',
    )));
  }
  if (results) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(results),
      `Les réponses convergent vers une sensibilité aux résultats visibles : ${meaningClause(results) || 'le rythme de progrès pourrait influencer l\'engagement'}`,
      `Le profil suggère une sensibilité aux résultats, mais les réponses sont mixtes; ${meaningClause(results) || 'tester comment l\'athlète réagit si le progrès est lent'}`,
      `Un premier signal laisse penser que ${meaningClause(results) || 'les résultats visibles comptent'}; à confirmer en entrevue`,
      'Les réponses se contredisent sur l\'importance des résultats visibles. Ne pas conclure avant d\'avoir vu la réaction aux deux premières semaines',
    )));
  }

  const structureText = structurePhrase(brief.structurePreference);
  const choiceText = text(brief.choicePreference);
  if (structureText || choiceText || structure || choice) {
    pushUnique(out, reserved, used, sentence(
      [
        structureText ? `Côté structure, le point de départ est ${structureText}` : '',
        choiceText ? `côté choix, ${decapitalize(choiceText)}` : '',
        hedge(
          strengthOf(structure) || strengthOf(choice),
          'Les réponses convergent : commencer par une structure claire, puis élargir les choix seulement si l\'athlète le demande',
          'Le profil suggère un équilibre structure/autonomie, mais les réponses sont mixtes — calibrer plutôt qu\'imposer',
          'Un premier signal laisse penser qu\'il faudra calibrer structure et autonomie, à confirmer en entrevue',
          'Les réponses se contredisent sur le besoin de structure. Ne pas conclure avant d\'avoir testé une semaine',
          'La bonne dose de structure reste à observer dans les premiers échanges',
        ),
      ].filter(Boolean).join('. '),
    ));
  }

  if (adherence) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(adherence),
      `Les réponses convergent sur la capacité de reprise : ${meaningClause(adherence) || 'prévoir un protocole simple et vérifier qu\'il est réellement utilisé après un écart'}`,
      `La capacité de reprise reste à tester : les réponses sont mixtes; ${meaningClause(adherence) || 'observer le premier écart avant de conclure'}`,
      `Un premier signal sur la reprise suggère ${meaningClause(adherence) || 'que la façon de revenir après un écart reste à clarifier'}; à confirmer en entrevue`,
      'Les réponses se contredisent sur la reprise. Ne pas conclure avant d\'avoir vu un écart réel',
    )));
  } else if (delay) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(delay),
      `Le rapport au délai semble assez établi : ${meaningClause(delay) || 'l\'athlète peut tolérer un progrès qui demande du temps'}`,
      `Le rapport au délai reste variable; ${meaningClause(delay) || 'observer la réaction si les résultats tardent'}`,
      'Un premier signal indique que le délai de résultat pourrait compter; à confirmer en entrevue',
      'Les réponses se contredisent sur le rapport au délai. Ne pas conclure avant l\'entrevue',
    )));
  }

  const solid = findings.filter((row) => strengthOf(row) === 'supported').slice(0, 3);
  const weak = findings.filter((row) => ['mixed', 'divergent', 'single'].includes(strengthOf(row))).slice(0, 3);
  if (solid.length || weak.length) {
    pushUnique(out, reserved, used, sentence(
      [
        solid.length ? `Les éléments les plus solides concernent ${solid.map((row) => decapitalize(row.label)).join(', ')}` : '',
        weak.length ? `restent hypothétiques ${weak.map((row) => decapitalize(row.label)).join(', ')}` : '',
      ].filter(Boolean).join(' ; '),
    ));
  }
  return out;
}

function coachingConsequences(vm, findings, reserved, used) {
  const brief = vm.athleteOperatingBrief || {};
  const communication = familyFinding(findings, 'communication');
  const choice = familyFinding(findings, 'choice');
  const structure = familyFinding(findings, 'structure');
  const out = [];

  if (brief.structurePreference || structure) {
    const startingStructure = structurePhrase(brief.structurePreference)
      || structurePhrase(meaningClause(structure))
      || 'une structure simple et prévisible';
    pushUnique(out, reserved, used, sentence(
      `Pour le coaching, utiliser comme point de départ ${startingStructure}, puis ajuster selon la réaction des 7 à 14 premiers jours`,
    ));
  }
  if (brief.communicationPreference || communication) {
    const communicationStyle = decapitalize(
      brief.communicationPreference || meaningClause(communication) || 'un feedback direct et bref',
    );
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(communication),
      `Les réponses convergent vers ${communicationStyle}. Donner le pourquoi avant le quoi`,
      `Le style de communication reste à calibrer; tester ${communicationStyle} et vérifier ce qui aide réellement l'athlète`,
      `Le style de communication à tester est ${communicationStyle}; à confirmer en entrevue`,
      'Les réponses se contredisent sur le feedback. Ne pas conclure : tester une consigne courte, puis demander ce qui a aidé',
      brief.communicationPreference
        ? `Privilégier ${communicationStyle} tant que l'entrevue n'a pas infirmé cette lecture`
        : '',
    )));
  }
  if (brief.choicePreference || choice) {
    pushUnique(out, reserved, used, sentence(
      `Quantité de choix : ${decapitalize(brief.choicePreference || meaningClause(choice) || 'offrir peu d\'options au départ')}. Éviter de surcharger la première semaine`,
    ));
  }
  if (brief.successDefinition) {
    pushUnique(out, reserved, used, 'Présenter les objectifs avec le critère de réussite déjà nommé par l\'athlète, pas avec un standard générique.');
  }
  pushUnique(out, reserved, used, 'Durant les 7 à 14 premiers jours, observer surtout : tenue de la structure proposée, réaction au premier écart, et clarté du critère de réussite.');
  return out;
}

function dropoutAndRecovery(vm, findings, reserved, used) {
  const brief = vm.athleteOperatingBrief || {};
  const rigidity = familyFinding(findings, 'rigidity');
  const compensatory = familyFinding(findings, 'compensatory');
  const delay = familyFinding(findings, 'delay');
  const risks = vm.riskBuckets?.risksToPrevent || [];
  const out = [];

  const barriers = (brief.declaredBarriers || []).map(text).filter(Boolean);
  if (barriers.length) {
    pushUnique(out, reserved, used, sentence(
      `Les obstacles déclarés — ${barriers.slice(0, 4).join(' ; ')} — sont le premier lieu de décrochage à surveiller, pas un diagnostic`,
    ));
  }
  if (brief.likelyDropoffPattern) {
    pushUnique(out, reserved, used, sentence(
      `Le contexte de décrochage à vérifier en priorité : ${decapitalize(brief.likelyDropoffPattern)}`,
    ));
  }
  const recovery = text(brief.recoveryStrategy);
  if (recovery && !/^(non répondu|non repondu)$/i.test(recovery)) {
    pushUnique(out, reserved, used, sentence(
      `La reprise déclarée : ${decapitalize(recovery)}. En faire un protocole écrit dès la première semaine, puis vérifier s'il est réellement utilisé`,
    ));
  }
  if (rigidity) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(rigidity),
      `Les réponses convergent vers un fonctionnement tout-ou-rien : ${meaningClause(rigidity) || 'prévoir une reprise minimale plutôt qu\'un redémarrage parfait'}`,
      `Le profil suggère une rigidité possible, mais les réponses sont mixtes; ${meaningClause(rigidity) || 'observer le premier écart avant de conclure'}`,
      `Un premier signal laisse penser que ${meaningClause(rigidity) || 'un écart pourrait tout arrêter'}; à confirmer en entrevue`,
      'Les réponses se contredisent sur la rigidité. Ne pas conclure avant d\'avoir vu un écart réel',
    )));
  }
  if (compensatory) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(compensatory),
      `Les réponses convergent sur la réaction compensatoire : ${meaningClause(compensatory) || 'peu de compensation est signalée, à surveiller sans surinterpréter'}`,
      `Le profil suggère une compensation possible, mais les réponses sont mixtes; ${meaningClause(compensatory) || 'à tester, pas à affirmer'}`,
      `Un premier signal laisse penser que ${meaningClause(compensatory) || 'une compensation alimentaire est possible'}; à confirmer en entrevue`,
      'Les réponses se contredisent sur les réactions compensatoires. Ne pas conclure',
    )));
  }
  if (delay) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(delay),
      `Les réponses convergent vers une tolérance au délai ${meaningClause(delay) || 'à prendre en compte dans le rythme des objectifs'}`,
      `Le profil suggère une sensibilité au délai, mais les réponses sont mixtes; ${meaningClause(delay) || 'tester un objectif de processus avant un objectif de résultat'}`,
      `Un premier signal laisse penser que ${meaningClause(delay) || 'le délai de résultat compte'}; à confirmer en entrevue`,
      'Les réponses se contredisent sur la tolérance au délai. Ne pas conclure',
    )));
  }
  if (risks.length && out.length < 3) {
    pushUnique(out, reserved, used, sentence(`À surveiller sans surinterpréter : ${risks.slice(0, 3).join(' ; ')}`));
  }
  return out;
}

function nutritionInContext(vm, findings, reserved, used) {
  const brief = vm.athleteOperatingBrief || {};
  const action = vm.nutritionAction || {};
  const organized = vm.nutritionOrganized || {};
  const nutrition = familyFinding(findings, 'nutrition');
  const out = [];
  const said = text(action.seek || (organized.said || [])[0] || brief.nutritionFocus);
  if (said) {
    pushUnique(out, reserved, used, sentence(
      `En nutrition, ce que l'athlète demande réellement est ${decapitalize(said)} — partir de cette demande, pas d'un protocole générique`,
    ));
  }
  if (nutrition || brief.nutritionFocus) {
    pushUnique(out, reserved, used, sentence(hedge(
      strengthOf(nutrition),
      `Les réponses convergent vers un niveau de structure alimentaire ${meaningClause(nutrition) || decapitalize(brief.nutritionFocus) || 'à tenir simple au départ'}`,
      `Le profil suggère une structure alimentaire utile, mais les réponses sont mixtes; ${meaningClause(nutrition) || 'tester une seule habitude avant d\'intensifier'}`,
      `Un premier signal laisse penser que ${meaningClause(nutrition) || decapitalize(brief.nutritionFocus) || 'une structure légère'} convient; à confirmer en entrevue`,
      'Les réponses se contredisent sur la nutrition. Ne pas intensifier les recommandations avant l\'entrevue',
      brief.nutritionFocus ? `Focus alimentaire déclaré : ${decapitalize(brief.nutritionFocus)}` : '',
    )));
  }
  const caution = [
    ...(action.complicate || []),
    ...(organized.obstacles || []),
    ...(vm.nutrition?.obstacles || []),
  ].map(text).filter(Boolean).slice(0, 3);
  if (caution.length) {
    pushUnique(out, reserved, used, sentence(
      `Prudence Coach : ${caution.join(' ; ')}. Ces contextes sont susceptibles de faire basculer l'adhésion`,
    ));
  }
  const first = [...new Set([
    ...(action.verify || []),
    ...(organized.test || []),
    action.testThisWeek,
  ].map(text).filter(Boolean))].slice(0, 2);
  if (first.length) {
    pushUnique(out, reserved, used, sentence(
      `Premières stratégies raisonnables : ${first.join(' ; ')}. Valider la faisabilité avant d'intensifier`,
    ));
  }
  if (!out.length) {
    pushUnique(out, reserved, used, 'La nutrition reste à cadrer en entrevue : les données actuelles ne suffisent pas pour intensifier les recommandations.');
  }
  return out;
}

function toValidateInPerson(vm, reserved, used) {
  const brief = vm.athleteOperatingBrief || {};
  const interview = (vm.interviewDetailed || []).map((item) => item.text || item).filter(Boolean);
  const confirm = [
    ...(vm.coachDecisionBrief?.confirmNow || []),
    ...(brief.itemsToValidate || []),
    ...(vm.riskBuckets?.hypothesesToTest || []),
    ...(vm.riskBuckets?.contradictionsToResolve || []),
    ...interview,
  ].filter(Boolean);
  const out = [];
  const unique = [];
  const seen = new Set();
  for (const item of confirm) {
    const clean = text(item).replace(/[.]+$/, '');
    const key = fingerprint(clean);
    if (seen.has(key) || reserved.has(key)) continue;
    seen.add(key);
    unique.push(clean);
    if (unique.length >= 5) break;
  }
  if (unique.length) {
    pushUnique(out, reserved, used, `Les incertitudes qui pourraient réellement changer le coaching : ${unique.join(' ; ')}.`);
  } else {
    pushUnique(out, reserved, used, 'Valider en personne le critère de réussite, le motif de décrochage et la dose de structure avant de figer le plan.');
  }
  return out;
}

export function buildCoachNarrative(viewModel = {}) {
  const findings = viewModel.dimensions || viewModel.canonicalFindings || [];
  const reserved = collectReservedFingerprints(viewModel);
  const used = new Set();
  const parts = [
    {
      id: 'functioning',
      title: 'Comment cet athlète semble fonctionner',
      paragraphs: howAthleteWorks(viewModel, findings, reserved, used)
        .map((line) => qualifyNarrativeClaim(findings, line)),
    },
    {
      id: 'coaching',
      title: 'Conséquences pour le coaching',
      paragraphs: coachingConsequences(viewModel, findings, reserved, used)
        .map((line) => qualifyNarrativeClaim(findings, line)),
    },
    {
      id: 'dropout',
      title: 'Risques de décrochage et reprise',
      paragraphs: dropoutAndRecovery(viewModel, findings, reserved, used)
        .map((line) => qualifyNarrativeClaim(findings, line)),
    },
    {
      id: 'nutrition',
      title: 'Nutrition dans le contexte du profil',
      paragraphs: nutritionInContext(viewModel, findings, reserved, used)
        .map((line) => qualifyNarrativeClaim(findings, line)),
    },
    {
      id: 'validate',
      title: 'Ce qui doit être validé en personne',
      paragraphs: toValidateInPerson(viewModel, reserved, used)
        .map((line) => qualifyNarrativeClaim(findings, line)),
    },
  ].filter((part) => part.paragraphs.length);
  const paragraphs = parts.flatMap((part) => part.paragraphs);
  return {
    title: 'Analyse narrative du coach',
    parts,
    paragraphs,
    wordCount: countWords(paragraphs),
    coverage: auditNarrativeSourceCoverage(viewModel),
  };
}
