/**
 * Canonical intake anthropometrics.
 * Store raw form answers only. Convert at read time.
 * Never logs values. Never writes derived fields back to storage.
 */

export const INCH_TO_CM = 2.54;
export const LB_TO_KG = 0.45359237;

export const INTAKE_ANTHRO_KEYS = Object.freeze([
  'age_years',
  'height_unit',
  'height_feet',
  'height_inches',
  'height_cm',
  'weight_lb',
]);

export const AGE_MIN = 1;
export const AGE_MAX = 120;
export const FEET_MIN = 1;
export const FEET_MAX = 8;
export const INCHES_MIN = 0;
export const INCHES_MAX = 11;
export const CM_MIN = 50;
export const CM_MAX = 272;
export const WEIGHT_LB_MIN = 20;
export const WEIGHT_LB_MAX = 800;

function raw(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseInteger(value) {
  const text = raw(value);
  if (!text || !/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isInteger(n) ? n : null;
}

function parseDecimal(value) {
  const text = raw(value).replace(',', '.');
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function imperialToCm(feet, inches) {
  const totalInches = Number(feet) * 12 + Number(inches);
  return totalInches * INCH_TO_CM;
}

export function cmToImperial(cm) {
  const totalInches = Number(cm) / INCH_TO_CM;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  if (inches === 12) return { feet: feet + 1, inches: 0 };
  return { feet, inches };
}

export function lbToKg(lb) {
  return Number(lb) * LB_TO_KG;
}

export function convertHeightUnit(fromUnit, values = {}) {
  if (fromUnit === 'imperial') {
    const feet = parseInteger(values.height_feet);
    const inches = parseInteger(values.height_inches);
    if (feet == null || inches == null) return { height_cm: '' };
    return { height_cm: String(Math.round(imperialToCm(feet, inches))) };
  }
  const cm = parseDecimal(values.height_cm);
  if (cm == null) return { height_feet: '', height_inches: '' };
  const imperial = cmToImperial(cm);
  return {
    height_feet: String(imperial.feet),
    height_inches: String(imperial.inches),
  };
}

export function sanitizeIntakeAnthropometrics(answers = {}) {
  const unit = raw(answers.height_unit) === 'metric' ? 'metric' : (
    raw(answers.height_unit) === 'imperial' ? 'imperial' : ''
  );
  const out = { ...answers };
  if (unit === 'imperial') {
    delete out.height_cm;
    out.height_unit = 'imperial';
  } else if (unit === 'metric') {
    delete out.height_feet;
    delete out.height_inches;
    out.height_unit = 'metric';
  }
  return out;
}

/**
 * @param {Record<string, unknown>} answers
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validateIntakeAnthropometrics(answers = {}) {
  const errors = {};
  const age = parseInteger(answers.age_years);
  if (answers.age_years == null || raw(answers.age_years) === '') {
    errors.age_years = 'required';
  } else if (age == null) {
    errors.age_years = 'not_integer';
  } else if (age <= 0 || age < AGE_MIN || age > AGE_MAX) {
    errors.age_years = 'out_of_range';
  }

  const unit = raw(answers.height_unit);
  if (unit !== 'imperial' && unit !== 'metric') {
    errors.height_unit = 'required';
  } else if (unit === 'imperial') {
    const feet = parseInteger(answers.height_feet);
    const inches = parseInteger(answers.height_inches);
    if (feet == null) errors.height_feet = raw(answers.height_feet) === '' ? 'required' : 'not_integer';
    else if (feet < FEET_MIN || feet > FEET_MAX) errors.height_feet = 'out_of_range';
    if (inches == null) errors.height_inches = raw(answers.height_inches) === '' ? 'required' : 'not_integer';
    else if (inches < INCHES_MIN || inches > INCHES_MAX) errors.height_inches = 'out_of_range';
  } else {
    const cm = parseDecimal(answers.height_cm);
    if (cm == null) errors.height_cm = raw(answers.height_cm) === '' ? 'required' : 'not_number';
    else if (cm < CM_MIN || cm > CM_MAX) errors.height_cm = 'out_of_range';
  }

  const weight = parseDecimal(answers.weight_lb);
  if (answers.weight_lb == null || raw(answers.weight_lb) === '') {
    errors.weight_lb = 'required';
  } else if (weight == null) {
    errors.weight_lb = 'not_number';
  } else if (weight <= 0 || weight < WEIGHT_LB_MIN || weight > WEIGHT_LB_MAX) {
    errors.weight_lb = 'out_of_range';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function formatCm(cm) {
  if (!Number.isFinite(cm)) return '';
  return `${Math.round(cm)} cm`;
}

function formatImperial(feet, inches) {
  if (!Number.isInteger(feet) || !Number.isInteger(inches)) return '';
  return `${feet} pi ${inches} po`;
}

function formatKg(kg) {
  if (!Number.isFinite(kg)) return '';
  return `${kg.toFixed(1).replace('.', ',')} kg`;
}

function formatLb(lb) {
  if (!Number.isFinite(lb)) return '';
  const rounded = Number.isInteger(lb) ? String(lb) : String(Math.round(lb * 10) / 10);
  return `${rounded.replace('.', ',')} lb`;
}

/**
 * Read-time normalization. Returns null when no usable anthropometrics exist.
 * Never invents zeros for missing legacy submissions.
 * @param {Record<string, unknown>} answers
 */
export function normalizeIntakeAnthropometrics(answers = {}) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
  const hasAny = INTAKE_ANTHRO_KEYS.some((key) => raw(answers[key]) !== '');
  if (!hasAny) return null;

  const ageYears = parseInteger(answers.age_years);
  const unit = raw(answers.height_unit) === 'metric' ? 'metric'
    : raw(answers.height_unit) === 'imperial' ? 'imperial'
      : '';
  let heightCm = null;
  let heightFeet = null;
  let heightInches = null;
  if (unit === 'imperial') {
    heightFeet = parseInteger(answers.height_feet);
    heightInches = parseInteger(answers.height_inches);
    if (heightFeet != null && heightInches != null && heightInches >= 0 && heightInches <= 11) {
      heightCm = imperialToCm(heightFeet, heightInches);
    } else {
      heightFeet = null;
      heightInches = null;
    }
  } else if (unit === 'metric') {
    const cm = parseDecimal(answers.height_cm);
    if (cm != null && cm > 0) {
      heightCm = cm;
      const imperial = cmToImperial(cm);
      heightFeet = imperial.feet;
      heightInches = imperial.inches;
    }
  }
  const weightLb = parseDecimal(answers.weight_lb);
  const usableWeight = weightLb != null && weightLb > 0 ? weightLb : null;
  const usableAge = ageYears != null && ageYears > 0 ? ageYears : null;
  if (usableAge == null && heightCm == null && usableWeight == null) return null;

  const heightOriginalUnit = unit || null;
  const heightImperial = formatImperial(heightFeet, heightInches);
  const heightMetric = formatCm(heightCm);
  const heightDisplay = heightOriginalUnit === 'metric'
    ? heightMetric
    : (heightImperial || heightMetric);
  const heightSecondary = heightOriginalUnit === 'metric'
    ? heightImperial
    : (heightOriginalUnit === 'imperial' ? heightMetric : '');

  const weightKg = usableWeight != null ? lbToKg(usableWeight) : null;

  return {
    ageYears: usableAge,
    heightCm,
    heightFeet,
    heightInches,
    heightOriginalUnit,
    heightDisplay,
    heightSecondary,
    weightLb: usableWeight,
    weightKg,
    weightDisplay: usableWeight != null ? formatLb(usableWeight) : '',
    weightSecondary: weightKg != null ? formatKg(weightKg) : '',
  };
}

/**
 * Coach-facing view-model slice. Renderers must not recalculate.
 * @param {Record<string, unknown>} answers
 */
export function buildIntakeAnthropometricsView(answers = {}) {
  const normalized = normalizeIntakeAnthropometrics(answers);
  if (!normalized) return null;
  return {
    age: normalized.ageYears != null ? `${normalized.ageYears} ans` : '',
    heightPrimary: normalized.heightDisplay || '',
    heightSecondary: normalized.heightSecondary || '',
    weightPrimary: normalized.weightDisplay || '',
    weightSecondary: normalized.weightSecondary || '',
    collected: Boolean(
      normalized.ageYears
      || normalized.heightDisplay
      || normalized.weightDisplay,
    ),
  };
}
