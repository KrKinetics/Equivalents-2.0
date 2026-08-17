/**
 * Presentation-only labels for Coach reports.
 * Never mutates a stored analysis snapshot.
 */

const TENDENCY_FR = {
  low: 'faible',
  moderate: 'modérée',
  modéré: 'modérée',
  moderee: 'modérée',
  modérée: 'modérée',
  high: 'élevée',
  élevé: 'élevée',
  eleve: 'élevée',
  élevée: 'élevée',
  faible: 'faible',
  mixte: 'mixte',
  contradictoire: 'contradictoire',
  'non établi': 'non établi',
};

const EVIDENCE_LINE = /para[iî]t|paraissent|repose sur une seule|une seule réponse|appui limité|donnée unique/i;

export function localizeTendency(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (TENDENCY_FR[key]) return TENDENCY_FR[key];
  return raw
    .replace(/\bhigh\b/gi, 'élevée')
    .replace(/\bmoderate\b/gi, 'modérée')
    .replace(/\bmodéré\b/gi, 'modérée')
    .replace(/\blow\b/gi, 'faible')
    .replace(/\bélevé\b/gi, 'élevée');
}

export function inferClaimStrength(row = {}) {
  if (row.claimStrength) return row.claimStrength;
  const label = `${row.displayLabel || ''} ${row.evidenceBadge || ''} ${row.tendency || ''}`.toLowerCase();
  if (/contradictoire|strongly_divergent|ne pas conclure/.test(label)) return 'divergent';
  if (/mixte|mixed/.test(label)) return 'mixed';
  if (/donnée unique|single|à confirmer/.test(label) || row.itemCount === 1) return 'single';
  if (/cohérente|appuyée|supported/.test(label)) return 'supported';
  return '';
}

export function findingPrimaryLabel(row = {}) {
  const existing = String(row.displayLabel || '').trim();
  const tendencyMatch = existing.match(/^Tendance\s+(.+)$/i);
  if (tendencyMatch && !/\b(high|moderate|low)\b/i.test(existing)) {
    return `Tendance ${localizeTendency(tendencyMatch[1])}`;
  }
  if (/^(Signal mixte|Réponses contradictoires)/i.test(existing)
    && !/\b(high|moderate|low)\b/i.test(existing)) {
    return existing;
  }
  const strength = inferClaimStrength(row);
  if (strength === 'mixed') return 'Signal mixte';
  if (strength === 'divergent') return 'Réponses contradictoires';
  const rawTendency = row.tendency && !/^(high|moderate|low|mixed|Tendance )/i.test(String(row.tendency).trim())
    ? row.tendency
    : (/\b(high|moderate|low)\b/i.test(String(row.level || '')) ? row.level : row.tendency || '');
  const tendency = localizeTendency(rawTendency);
  if (strength === 'single') return tendency ? `Tendance ${tendency}` : 'Tendance à confirmer';
  if (tendency && !/^(mixte|contradictoire)$/i.test(tendency)) return `Tendance ${tendency}`;
  return localizeTendency(row.displayLabel) || '—';
}

export function findingStatusLabel(row = {}) {
  const strength = inferClaimStrength(row);
  if (strength === 'mixed') return 'À TESTER';
  if (strength === 'divergent') return 'NE PAS CONCLURE';
  if (strength === 'single') return 'À CONFIRMER';
  if (strength === 'supported') return 'APPUYÉE';
  return String(row.confidenceStatus || row.evidenceBadge || '').replace(/\b(high|moderate|low)\b/gi, (m) => localizeTendency(m));
}

export function findingTechnicalDirection(row = {}) {
  const strength = inferClaimStrength(row);
  if (strength !== 'mixed' && strength !== 'divergent') return '';
  const direction = localizeTendency(row.level);
  if (!direction || /mixte|contradictoire/i.test(direction)) return '';
  return `Direction technique : ${direction}`;
}

export function asPresentedCoachAction(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/[?？]$/.test(value) || /^(comment|quel|quelle|quels|quelles|pourquoi|préférez|souhaitez)/i.test(value)) {
    return '';
  }
  if (/lien alimentation-performance|alimentation.?performance/i.test(value)) {
    return 'Ancrer les premières interventions nutritionnelles sur les bénéfices concrets en séance et en récupération.';
  }
  if (EVIDENCE_LINE.test(value) && /structure alimentaire|besoin de structure/i.test(value)) {
    return 'Observer le besoin réel de structure alimentaire avant d\'imposer un cadre.';
  }
  if (EVIDENCE_LINE.test(value) && /reprise|adhésion/i.test(value)) {
    return 'Tester une reprise minimale après un écart, sans conclure sur le niveau d\'adhésion.';
  }
  if (EVIDENCE_LINE.test(value)) {
    return 'Tester cette hypothèse sur une semaine réelle avant d\'en faire une priorité d\'action.';
  }
  return value;
}

export function hasNutritionContent(nutrition, action = null) {
  if (action?.cards?.length) return true;
  if (!nutrition) return false;
  return Boolean(
    nutrition.lecture?.length
    || nutrition.structure
    || nutrition.obstacles?.length
    || nutrition.actions?.length
    || nutrition.said?.length
    || nutrition.suggested?.length,
  );
}

export function isTestableFourWeekPlan(weeks = []) {
  if (!weeks.length) return false;
  return weeks.every((week) => week.observe && week.validationCriterion && week.coachAction);
}

export function organizeLegacyNutrition(nutrition = {}, brief = {}) {
  const lecture = [...(nutrition.lecture || [])].map((line) => String(line).trim()).filter(Boolean);
  const evidence = lecture.filter((line) => EVIDENCE_LINE.test(line));
  const suggested = lecture.filter((line) => !EVIDENCE_LINE.test(line));
  const said = [
    brief.nutritionFocus,
    ...(nutrition.said || []),
  ].filter(Boolean);
  return {
    said: [...new Set(said)],
    suggested,
    confirm: nutrition.structure ? [nutrition.structure] : [],
    test: nutrition.actions || [],
    obstacles: nutrition.obstacles || [],
    structure: nutrition.structure || '',
    evidenceNote: evidence.length
      ? 'Statut de preuve : plusieurs lectures reposent sur une donnée limitée — à confirmer avant d\'agir fortement.'
      : '',
  };
}
