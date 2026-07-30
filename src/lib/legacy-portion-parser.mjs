/**
 * Legacy portion / short-name parser.
 * Pure module — no nutrient mutation.
 */

function num(v) {
  if (v == null || v === '' || v === '—' || v === '-') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseFractionToken(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '½') return 0.5;
  if (s === '⅓') return 1 / 3;
  if (s === '¼') return 0.25;
  if (s === '⅙') return 1 / 6;
  if (s === '¾') return 0.75;
  if (s === '⅔') return 2 / 3;
  if (s === '⅛') return 0.125;
  return num(s);
}

/** Strip protein-per-container phrases that must never become portion.grams */
export function stripProteinAmountHints(label) {
  return String(label || '')
    .replace(/\([^)]*(?:g\s*prot\.|g\s*de\s*protéines?|g\s*protein|protein\s+per\s+bottle|prot\.?\s*\/\s*bouteille)[^)]*\)/gi, ' ')
    .replace(/\b\d+[.,]?\d*\s*g\s*(?:prot\.|de\s*protéines?|protein)\b/gi, ' ')
    .replace(/\bprotein\s+per\s+bottle\b/gi, ' ')
    .replace(/\bprot\.?\s*\/\s*bouteille\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractGrams(label) {
  const cleaned = stripProteinAmountHints(label);
  const parenApprox = cleaned.match(/\(\s*~?\s*(\d+[.,]?\d*)\s*g\s*\)/i);
  if (parenApprox) return num(parenApprox[1]);
  const leading = cleaned.match(/^(\d+[.,]?\d*)\s*g\b/i);
  if (leading) return num(leading[1]);
  // Explicit trailing weight only if clearly a weight paren already handled.
  // Avoid matching "gros" / random "g" words: require digit + g as unit.
  const anyWeight = cleaned.match(/(?<![A-Za-zÀ-ÿ])(\d+[.,]?\d*)\s*g\b(?!\s*prot)/i);
  if (anyWeight && !/prot/i.test(cleaned.slice(anyWeight.index, anyWeight.index + anyWeight[0].length + 8))) {
    // Prefer only if not already captured; skip bare counts without g unit context near food size
    if (/\b\d+[.,]?\d*\s*g\b/i.test(cleaned) && !/^\d+\s+[A-Za-zÀ-ÿ]/.test(cleaned.replace(/^\d+[.,]?\d*\s*g\b/i, '').trim() === '' ? 'x' : cleaned)) {
      // If label is like "15 gros raisins (75 g)" paren already caught.
      // If "30 g de Bœuf" leading caught.
      return null;
    }
  }
  return parenApprox ? num(parenApprox[1]) : null;
}

/**
 * Display name from a portion label.
 * Must preserve percentages like 100%, 0%, 1-2%.
 */
export function shortName(label, lang = 'fr') {
  let s = String(label || '').trim();
  if (!s) return '';

  // Remove trailing parenthetical weights / notes (keep % intact elsewhere)
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // Spoon measures: "1,5 c. à table de PB2" / "1.5 tbsp PB2"
  s = s.replace(
    /^\d+[.,]?\d*\s*c\.\s*[àa]\s*(?:table|thé|the|café|cafe)\s+(?:de\s+|d['’])?/i,
    ''
  );
  s = s.replace(/^\d+[.,]?\d*\s*(?:tbsp|tablespoons?)\s+/i, '');
  s = s.replace(/^\d+[.,]?\d*\s*(?:tsp|teaspoons?)\s+/i, '');

  // Volume / mass with optional de/d'
  s = s.replace(/^\d+[.,]?\d*\s*(?:ml|mg|oz)\s+(?:de\s+|d['’])?/i, '');
  s = s.replace(/^\d+[.,]?\d*\s*g\s+(?:de\s+|d['’])?/i, '');

  // Cups / bottles / scoops with fraction or number
  s = s.replace(
    /^(?:[½⅓¼¾⅔⅙⅛]|\d+[.,]?\d*)\s*(?:tasse|cup|bouteille|bottle|scoop|tranche|slice)\s+(?:de\s+|d['’])?/iu,
    ''
  );

  // Leading unicode fraction alone (½ banane)
  s = s.replace(/^[½⅓¼¾⅔⅙⅛]\s*/u, '');

  // "1 10.2 cm ... wheat pita" — leading count before a dimension number
  s = s.replace(/^\d+\s+(?=\d+[.,]?\d*)/, '');

  // Leading count ONLY when not part of a percentage (100%, 0%, 1-2%)
  // or a physical dimension (10.2 cm), and when followed by a letter (incl. œ)
  s = s.replace(
    /^(?!\d+(?:[.,]\d+)?\s*(?:cm|in)\b)\d+(?![%\d]|-\d+%)(?:[.,]\d+)?(?!\s*%|-)\s+(?=[\p{L}«])/iu,
    ''
  );

  s = s.replace(/\s+/g, ' ').trim();

  if (lang === 'fr') {
    s = s.replace(/^(?:de\s+|d['’])/i, '');
  }

  // If we accidentally produced a bare "% ...", restore is impossible; callers must avoid.
  // Guard: if starts with "%", parser failed — return original label cleaned lightly.
  if (s.startsWith('%')) {
    return String(label || '')
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return s || String(label || '').trim();
}

function detectPreparationState(labelFr, labelEn) {
  const lower = `${labelFr || ''} ${labelEn || ''}`.toLowerCase();
  if (/huile|oil|vinaigrette|mayonnaise|margarine|beurre(?!\s+d)/i.test(lower) && !/beurre d['’]arachide|peanut|almond butter|tahini/i.test(lower)) {
    // oils often N/A — leave null here; candidate report suggests not_applicable
  }
  if (/avant cuisson|uncooked|sec\b|, dry|dry,|\(sec/i.test(lower)) return 'dry_uncooked';
  if (/cuit|cooked|bouilli|boiled/i.test(lower)) return 'cooked';
  if (/[eé]goutt|drain/i.test(lower)) return 'drained';
  if (/gril+|grill[eé]|r[oô]ti|roasted|pr[eé]par/i.test(lower)) return 'prepared';
  if (/congel|frozen/i.test(lower)) return 'frozen';
  if (/conserv|canned/i.test(lower)) return 'canned';
  if (/\bcru\b|\braw\b/i.test(lower)) return 'raw';
  if (/pr[eê]t|ready|rtd|embouteill|powder|poudre|scoop|huile|oil\b/i.test(lower)) {
    // do not auto-assign not_applicable during import — leave null/unknown
  }
  return null;
}

function detectBrand(labelFr, labelEn) {
  const text = `${labelFr || ''} ${labelEn || ''}`;
  if (/core power|fairlife/i.test(text)) return { brandSpecific: true, brand: 'Core Power / Fairlife' };
  if (/egglife/i.test(text)) return { brandSpecific: true, brand: 'Egglife' };
  if (/allegro/i.test(text)) return { brandSpecific: true, brand: 'Allegro' };
  if (/natrel/i.test(text)) return { brandSpecific: true, brand: 'Natrel' };
  if (/cogruet/i.test(text)) return { brandSpecific: true, brand: 'COGRUET' };
  if (/bergeron/i.test(text)) return { brandSpecific: true, brand: 'Bergeron' };
  if (/\bpb2\b/i.test(text)) return { brandSpecific: true, brand: 'PB2' };
  if (/ezekiel/i.test(text)) return { brandSpecific: true, brand: 'Ezekiel' };
  return { brandSpecific: false, brand: null };
}

/**
 * Parse a single language portion label into structured fields.
 */
export function parsePortionLabel(label) {
  const original = String(label || '').trim();
  const cleaned = stripProteinAmountHints(original);
  let amount = null;
  let unit = null;

  const tbsp = cleaned.match(/^(\d+[.,]?\d*)\s*c\.\s*[àa]\s*table\b/i)
    || cleaned.match(/^(\d+[.,]?\d*)\s*(?:tbsp|tablespoon)/i);
  const tsp = cleaned.match(/^(\d+[.,]?\d*)\s*c\.\s*[àa]\s*th[eé]\b/i)
    || cleaned.match(/^(\d+[.,]?\d*)\s*(?:tsp|teaspoon)/i);
  const ml = cleaned.match(/(\d+[.,]?\d*)\s*ml\b/i);
  const cup = cleaned.match(/([½⅓¼¾⅔⅙⅛]|\d+[.,]?\d*)\s*(?:tasse|cup)\b/iu);
  const scoop = cleaned.match(/([½⅓¼¾⅔⅙⅛]|\d+[.,]?\d*)\s*scoop\b/iu);
  const bottle = cleaned.match(/([½⅓¼¾⅔⅙⅛]|\d+[.,]?\d*)\s*(?:bouteille|bottle)\b/iu);
  const slice = cleaned.match(/(\d+[.,]?\d*)\s*(?:tranche|slice)\b/i)
    || cleaned.match(/^(\d+)\s+tranche/i);
  const piece = cleaned.match(/(\d+[.,]?\d*)\s*(?:morceau|piece)\b/i);
  const oz = cleaned.match(/(\d+[.,]?\d*)\s*oz\b/i);
  const leadingG = cleaned.match(/^(\d+[.,]?\d*)\s*g\b/i);
  const countLead = cleaned.match(/^(\d+[.,]?\d*)\s+(?!ml\b|g\b|mg\b|oz\b|%)/i);
  const fracLead = cleaned.match(/^([½⅓¼¾⅔⅙⅛])\b/u);

  if (tbsp) {
    amount = num(tbsp[1]);
    unit = 'tbsp';
  } else if (tsp) {
    amount = num(tsp[1]);
    unit = 'tsp';
  } else if (scoop) {
    amount = parseFractionToken(scoop[1]);
    unit = 'scoop';
  } else if (bottle) {
    amount = parseFractionToken(bottle[1]);
    unit = 'bottle';
  } else if (cup) {
    amount = parseFractionToken(cup[1]);
    unit = 'cup';
  } else if (ml) {
    amount = num(ml[1]);
    unit = 'ml';
  } else if (oz) {
    amount = num(oz[1]);
    unit = 'oz';
  } else if (slice) {
    amount = num(slice[1]);
    unit = 'slice';
  } else if (piece) {
    amount = num(piece[1]);
    unit = 'piece';
  } else if (leadingG) {
    amount = num(leadingG[1]);
    unit = 'g';
  } else if (countLead) {
    amount = num(countLead[1]);
    unit = 'count';
  } else if (fracLead) {
    amount = parseFractionToken(fracLead[1]);
    unit = 'portion';
  } else {
    amount = 1;
    unit = 'portion';
  }

  let grams = null;
  const paren = cleaned.match(/\(\s*~?\s*(\d+[.,]?\d*)\s*g\s*\)/i);
  if (paren) grams = num(paren[1]);
  else if (unit === 'g') grams = amount;

  return { amount, unit, grams, label: original };
}

/**
 * Parse FR+EN portion pair. Independent comparison of both languages.
 */
export function parsePortion(labelFr, labelEn) {
  const fr = parsePortionLabel(labelFr);
  const en = parsePortionLabel(labelEn);
  const brand = detectBrand(labelFr, labelEn);
  const preparationState = detectPreparationState(labelFr, labelEn);

  // Prefer FR structured fields for primary portion (guide source language)
  // but keep EN label and expose diffs via comparePortions().
  return {
    labelFr: labelFr || null,
    labelEn: labelEn || null,
    amount: fr.amount,
    unit: fr.unit,
    grams: fr.grams,
    amountEn: en.amount,
    unitEn: en.unit,
    gramsEn: en.grams,
    preparationState,
    brandSpecific: brand.brandSpecific,
    brand: brand.brand,
  };
}

export function comparePortions(portion) {
  const diffs = [];
  if (!portion) return diffs;
  if (portion.amount != null && portion.amountEn != null && portion.amount !== portion.amountEn) {
    diffs.push({ field: 'amount', fr: portion.amount, en: portion.amountEn });
  }
  if (portion.unit && portion.unitEn && portion.unit !== portion.unitEn) {
    diffs.push({ field: 'unit', fr: portion.unit, en: portion.unitEn });
  }
  if (portion.grams != null && portion.gramsEn != null && portion.grams !== portion.gramsEn) {
    diffs.push({ field: 'grams', fr: portion.grams, en: portion.gramsEn });
  }
  return diffs;
}

export { num, parseFractionToken };
