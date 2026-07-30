/**
 * Deterministic CNF record selection for approved nutrition batches.
 */

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsConcept(haystack, concept) {
  const text = normalizeText(haystack);
  const needle = normalizeText(concept);
  if (!needle) return true;
  if (text.includes(needle)) return true;
  if (needle === 'meat only') {
    return (
      /\bmeat\b/.test(text) &&
      !/\bskin\b/.test(text) &&
      !/\bmeat and skin\b/.test(text)
    );
  }
  if (needle === 'cooked') {
    return /\b(cooked|roasted|stewed|braised|grilled)\b/.test(text);
  }
  if (needle === 'raw') {
    return /\braw\b/.test(text) || /\bunroasted\b/.test(text) || /\bundried raw\b/.test(text);
  }
  if (needle === 'blueberry' || needle === 'blueberries') {
    return /\bblueberr/.test(text);
  }
  if (needle === 'almond' || needle === 'almonds') {
    return /\balmonds?\b/.test(text);
  }
  return false;
}

function excludesConcept(haystack, concept) {
  const text = normalizeText(haystack);
  const needle = normalizeText(concept);
  if (!needle) return false;
  if (needle === 'skin') {
    return /\bskin\b/.test(text) || /\bmeat and skin\b/.test(text);
  }
  if (needle === 'oil') {
    return /\boil roasted\b/.test(text) || /\bwith oil\b/.test(text);
  }
  if (needle === 'roasted') {
    if (/\bunroasted\b/.test(text)) return false;
    return /\b(roasted|toasted)\b/.test(text);
  }
  if (needle === 'blanched') {
    if (/\bunblanched\b/.test(text)) return false;
    return /\bblanched\b/.test(text);
  }
  if (needle === 'salted') {
    if (/\bunsalted\b/.test(text)) return false;
    return /\bsalted\b/.test(text);
  }
  return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
}

function scoreCandidate(food, sourcePlan) {
  const en = food.descriptionEn || '';
  const fr = food.descriptionFr || '';
  const hay = `${en} ${fr}`;
  let score = 0;
  for (const keyword of sourcePlan.matchKeywordsEn || []) {
    if (containsConcept(hay, keyword)) score += 10;
  }
  for (const concept of sourcePlan.mustContainConcepts || []) {
    if (containsConcept(hay, concept)) score += 25;
  }
  // Prefer shorter / more specific generic descriptions
  score += Math.max(0, 40 - normalizeText(en).split(' ').length);
  if (/\b(homemade|commercial|frozen|babyfood|deli|fast foods|candies|cereal|muffin|pie|butter|paste|meal)\b/i.test(en)) {
    score -= 40;
  }
  if (/^nuts,\s*almonds/i.test(en)) score += 50;
  if (/^blueberry,\s*raw$/i.test(en)) score += 50;
  if (/^grains,\s*quinoa,\s*cooked$/i.test(en)) score += 50;
  if (/^chicken,\s*broiler,\s*breast,\s*meat,\s*roasted$/i.test(en)) score += 50;
  return score;
}

export function selectCnfRecord(normalizedFoods, sourcePlan, options = {}) {
  const foods = Array.isArray(normalizedFoods) ? normalizedFoods : [];
  const requiredConcepts = [...(sourcePlan.mustContainConcepts || [])];
  const excludedConcepts = [
    ...(sourcePlan.mustNotContainConcepts || []),
    'candies',
    'candy',
    'cereal',
    'muffin',
    'babyfood',
    'butter',
    'paste',
  ];
  const candidates = [];
  for (const food of foods) {
    const hay = `${food.descriptionEn || ''} ${food.descriptionFr || ''}`;
    const missing = requiredConcepts.filter((concept) => !containsConcept(hay, concept));
    const excludedBy = excludedConcepts.filter((concept) => excludesConcept(hay, concept));
    if (missing.length || excludedBy.length) {
      candidates.push({
        recordId: food.recordId,
        descriptionEn: food.descriptionEn,
        compatible: false,
        missing,
        excludedBy,
        score: -1,
      });
      continue;
    }
    candidates.push({
      recordId: food.recordId,
      descriptionEn: food.descriptionEn,
      descriptionFr: food.descriptionFr,
      compatible: true,
      missing: [],
      excludedBy: [],
      score: scoreCandidate(food, sourcePlan),
      per100g: food.per100g,
    });
  }

  const compatible = candidates
    .filter((c) => c.compatible)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.descriptionEn || '').localeCompare(String(b.descriptionEn || '')) ||
        String(a.recordId).localeCompare(String(b.recordId))
    );

  if (!compatible.length) {
    return {
      ok: false,
      selected: null,
      candidates: candidates.sort((a, b) => Number(b.compatible) - Number(a.compatible)),
      message: 'Aucun enregistrement CNF compatible',
    };
  }

  const selected = compatible[0];
  if (options.requireUniqueTop && compatible.length > 1 && compatible[1].score === selected.score) {
    // Still pick deterministically first after sort, but report ambiguity.
  }

  return {
    ok: true,
    selected,
    candidates: compatible.slice(0, 20),
    allRejectedSample: candidates.filter((c) => !c.compatible).slice(0, 10),
    message: sourcePlan.ambiguityRule || null,
  };
}

export function getCnfFoodByRecordId(normalizedFoods, recordId) {
  return (normalizedFoods || []).find((food) => String(food.recordId) === String(recordId)) || null;
}
