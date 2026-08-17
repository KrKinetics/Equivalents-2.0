/**
 * Presentation-only interview justifications.
 * Remaps generic "adhésion casse" copy to a question-specific why.
 * Never mutates a stored analysis snapshot.
 */

const GENERIC_WHY = /identifie le moment et le contexte o[uù] l['’]adh[eé]sion casse/i;

const WHY = Object.freeze({
  budget: 'Précise où le coût limite concrètement les choix ou la régularité.',
  stress: 'Permet d\'identifier les situations émotionnelles qui modifient les repas, portions ou décisions.',
  social: 'Repère les contextes où l\'environnement social entre en conflit avec les intentions.',
  schedule: 'Repère le moment réel où l\'organisation de la semaine fait décrocher l\'exécution.',
  planning: 'Identifie où le manque de préparation fait basculer les repas prévus.',
  portions: 'Précise dans quels repas ou contextes les portions dérapent réellement.',
  recovery: 'Clarifie comment l\'athlète reprend après un écart, sans conclure trop tôt.',
  objective: 'Précise ce que l\'athlète cherche réellement et comment juger le progrès.',
  conflict: 'Résout une contradiction qui changerait le plan.',
  fallback: 'Peut modifier une décision de coaching des 4 premières semaines.',
});

function haystack(item = {}) {
  return [
    item.canonicalKey,
    item.sourceQuestionCode,
    item.category,
    item.affectedDecision,
    item.text,
    item.whyItMatters,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
}

export function interviewTheme(item = {}) {
  const blob = haystack(item);
  if (/budget|co[uû]t|argent|prix/.test(blob)) return 'budget';
  if (/stress|[eé]motion|anxi[eé]t/.test(blob)) return 'stress';
  if (/social|famil|resto|invit/.test(blob)) return 'social';
  if (/horaire|schedule|travail variable|organisation de la semaine|horaire variable/.test(blob)) return 'schedule';
  if (/planif|pr[eé]paration|food_planning/.test(blob)) return 'planning';
  if (/portion/.test(blob)) return 'portions';
  if (/reprise|recovery|adh[eé]sion/.test(blob) && /obstacle|barrier/.test(blob)) return 'recovery';
  if (item.category === 'objective') return 'objective';
  if (item.category === 'conflict') return 'conflict';
  return '';
}

export function specificInterviewWhy(item = {}) {
  const theme = interviewTheme(item);
  if (theme && WHY[theme]) return WHY[theme];
  if (item.category === 'objective') return WHY.objective;
  if (item.category === 'conflict') return WHY.conflict;
  if (item.category === 'obstacle') return WHY.schedule;
  return WHY.fallback;
}

/**
 * Keep a stored specific why. Replace the generic obstacle copy.
 * @param {object} item
 */
export function presentInterviewWhy(item = {}) {
  const existing = String(item.whyItMatters || '').trim();
  if (existing && !GENERIC_WHY.test(existing)) return existing;
  return specificInterviewWhy(item);
}
