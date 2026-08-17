/**
 * Deterministic claim-language contract for report-model-v4.4.
 * Presentation only — does not invent clinical meaning.
 */

const FORBIDDEN_SINGLE = /\b(démontre|confirme que|profil établi|sera clairement|est fortement|engagement est)\b/i;
const FORBIDDEN_MIXED_DEFINITIVE = /\b(reprise\s*:\s*(élevée|haute|forte)|paraît élevé|est élevé|est faible|est modéré)\b/i;
const FORBIDDEN_DIVERGENT_STRONG = /\b(recommand[ée]\s+fortement|doit\s+absolument|profil établi|démontre)\b/i;
const ALLOWED_HEDGE = /\b(suggère|pourrait|semble|à confirmer|hypothèse|signal mixte|ne pas conclure|possiblement)\b/i;

export function languageViolations(text, claimStrength) {
  const value = String(text || '');
  if (!value.trim()) return [];
  const errors = [];
  if (claimStrength === 'single' && FORBIDDEN_SINGLE.test(value) && !ALLOWED_HEDGE.test(value)) {
    errors.push('single-item text exceeds claimStrength');
  }
  if ((claimStrength === 'mixed' || claimStrength === 'divergent') && FORBIDDEN_MIXED_DEFINITIVE.test(value)) {
    errors.push('mixed/divergent text states a definitive level');
  }
  if (claimStrength === 'divergent' && FORBIDDEN_DIVERGENT_STRONG.test(value)) {
    errors.push('divergent text makes a strong recommendation');
  }
  return errors;
}

export function assertClaimLanguage(texts, findings = []) {
  const byKey = new Map((findings || []).map((item) => [item.key, item]));
  const errors = [];
  for (const entry of texts || []) {
    const text = typeof entry === 'string' ? entry : entry?.text;
    const key = typeof entry === 'string' ? null : entry?.key;
    const strength = key && byKey.get(key) ? byKey.get(key).claimStrength : entry?.claimStrength;
    if (!text || !strength) continue;
    for (const error of languageViolations(text, strength)) {
      errors.push(`${key || 'text'}: ${error}`);
    }
  }
  return errors;
}

export function isInterviewQuestion(text) {
  const value = String(text || '').trim();
  return /[?？]$/.test(value) || /^(comment|quel|quelle|quels|quelles|pourquoi|préférez|souhaitez)/i.test(value);
}

export function asCoachAction(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (isInterviewQuestion(value)) return '';
  return value;
}
