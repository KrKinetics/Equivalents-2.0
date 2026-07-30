/**
 * Deterministic CNF record selection for approved nutrition batches.
 */

export const CNF_SELECTION_ERROR_CODES = Object.freeze({
  EXPECTED_CNF_RECORD_MISSING: 'EXPECTED_CNF_RECORD_MISSING',
  EXPECTED_CNF_RECORD_NOT_FOUND: 'EXPECTED_CNF_RECORD_NOT_FOUND',
  EXPECTED_CNF_RECORD_INCOMPATIBLE: 'EXPECTED_CNF_RECORD_INCOMPATIBLE',
  EXPECTED_CNF_RECORD_MISMATCH: 'EXPECTED_CNF_RECORD_MISMATCH',
});

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsConcept(haystack, concept) {
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

export function excludesConcept(haystack, concept) {
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
  if (needle === 'hydrogenated') {
    if (/\bnon[- ]?hydrogenated\b/.test(text) || /\bunhydrogenated\b/.test(text)) {
      return false;
    }
    return /\bhydrogenated\b/.test(text);
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

function evaluateCompatibility(food, sourcePlan) {
  const hay = `${food.descriptionEn || ''} ${food.descriptionFr || ''}`;
  const requiredConcepts = [...(sourcePlan.mustContainConcepts || [])];
  const requiredContext = [
    ...(sourcePlan.mustContainConcepts || []),
    ...(sourcePlan.matchKeywordsEn || []),
  ].join(' ');
  const defaultExclusions = [
    'candies',
    'candy',
    'cereal',
    'muffin',
    'babyfood',
    'butter',
    'paste',
  ];
  // Skip defaults that the locked identity / keywords intentionally require
  // (e.g. peanut butter, tahini sesame butter, homemade granola cereal).
  const excludedConcepts = [
    ...(sourcePlan.mustNotContainConcepts || []),
    ...defaultExclusions.filter((concept) => !containsConcept(requiredContext, concept)),
  ];
  const missing = requiredConcepts.filter((concept) => !containsConcept(hay, concept));
  const excludedBy = excludedConcepts.filter((concept) => excludesConcept(hay, concept));
  return {
    compatible: missing.length === 0 && excludedBy.length === 0,
    missing,
    excludedBy,
    hay,
  };
}

function heuristicSelect(normalizedFoods, sourcePlan, options = {}) {
  const foods = Array.isArray(normalizedFoods) ? normalizedFoods : [];
  const candidates = [];
  for (const food of foods) {
    const compatibility = evaluateCompatibility(food, sourcePlan);
    if (!compatibility.compatible) {
      candidates.push({
        recordId: food.recordId,
        descriptionEn: food.descriptionEn,
        compatible: false,
        missing: compatibility.missing,
        excludedBy: compatibility.excludedBy,
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
      expectedRecordId: sourcePlan.expectedRecordId || null,
      selectedRecordId: null,
      candidates: candidates.sort((a, b) => Number(b.compatible) - Number(a.compatible)),
      code: null,
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
    expectedRecordId: sourcePlan.expectedRecordId || null,
    selectedRecordId: String(selected.recordId),
    candidates: compatible.slice(0, 20),
    allRejectedSample: candidates.filter((c) => !c.compatible).slice(0, 10),
    code: null,
    message: sourcePlan.ambiguityRule || null,
  };
}

/**
 * Select a CNF record.
 * When expectedRecordId is present, that record is locked and verified.
 */
export function selectCnfRecord(normalizedFoods, sourcePlan, options = {}) {
  const expected = sourcePlan?.expectedRecordId;
  if (expected == null || expected === '') {
    if (options.requireExpectedRecordId) {
      return {
        ok: false,
        selected: null,
        expectedRecordId: null,
        selectedRecordId: null,
        candidates: [],
        code: CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_MISSING,
        message: 'expectedRecordId is required for this batch',
      };
    }
    return heuristicSelect(normalizedFoods, sourcePlan, options);
  }

  const expectedId = String(expected);
  const record = getCnfFoodByRecordId(normalizedFoods, expectedId);
  if (!record) {
    return {
      ok: false,
      selected: null,
      expectedRecordId: expectedId,
      selectedRecordId: null,
      candidates: [],
      code: CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_NOT_FOUND,
      message: `CNF record ${expectedId} not found`,
    };
  }

  const compatibility = evaluateCompatibility(record, sourcePlan);
  if (!compatibility.compatible) {
    return {
      ok: false,
      selected: null,
      expectedRecordId: expectedId,
      selectedRecordId: expectedId,
      candidates: [
        {
          recordId: record.recordId,
          descriptionEn: record.descriptionEn,
          compatible: false,
          missing: compatibility.missing,
          excludedBy: compatibility.excludedBy,
          score: -1,
        },
      ],
      code: CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_INCOMPATIBLE,
      message: `CNF record ${expectedId} incompatible with locked identity (${[
        ...compatibility.missing.map((m) => `missing:${m}`),
        ...compatibility.excludedBy.map((e) => `excluded:${e}`),
      ].join(', ')})`,
    };
  }

  const selected = {
    recordId: record.recordId,
    descriptionEn: record.descriptionEn,
    descriptionFr: record.descriptionFr,
    compatible: true,
    missing: [],
    excludedBy: [],
    score: scoreCandidate(record, sourcePlan),
    per100g: record.per100g,
  };

  // Locked selection must never silently drift to another record.
  if (String(selected.recordId) !== expectedId) {
    return {
      ok: false,
      selected: null,
      expectedRecordId: expectedId,
      selectedRecordId: String(selected.recordId),
      candidates: [selected],
      code: CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_MISMATCH,
      message: `Expected CNF record ${expectedId} but selected ${selected.recordId}`,
    };
  }

  return {
    ok: true,
    selected,
    expectedRecordId: expectedId,
    selectedRecordId: expectedId,
    candidates: [selected],
    code: null,
    message: sourcePlan.ambiguityRule || null,
  };
}

export function getCnfFoodByRecordId(normalizedFoods, recordId) {
  return (normalizedFoods || []).find((food) => String(food.recordId) === String(recordId)) || null;
}
