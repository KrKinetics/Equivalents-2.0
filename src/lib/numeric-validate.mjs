/**
 * Shared numeric field validation aligned with JSON Schema (true numbers only).
 */

/**
 * @param {unknown} value
 * @param {{ allowNull?: boolean, min?: number|null, exclusiveMin?: number|null, field?: string }} [options]
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
export function validateNumericField(value, options = {}) {
  const {
    allowNull = true,
    min = 0,
    exclusiveMin = null,
    field = 'value',
  } = options;

  if (value == null) {
    if (allowNull) return { ok: true };
    return {
      ok: false,
      code: 'INVALID_NUMERIC_TYPE',
      message: `${field} ne peut pas être null`,
    };
  }

  if (typeof value !== 'number') {
    return {
      ok: false,
      code: 'INVALID_NUMERIC_TYPE',
      message: `${field} doit être un nombre (reçu ${typeof value})`,
    };
  }

  if (!Number.isFinite(value)) {
    return {
      ok: false,
      code: 'NON_FINITE_VALUE',
      message: `${field} doit être un nombre fini`,
    };
  }

  if (exclusiveMin != null && !(value > exclusiveMin)) {
    return {
      ok: false,
      code: 'NEGATIVE_VALUE',
      message: `${field} doit être > ${exclusiveMin}`,
    };
  }

  if (min != null && value < min) {
    return {
      ok: false,
      code: 'NEGATIVE_VALUE',
      message: `${field} ne peut pas être négatif`,
    };
  }

  return { ok: true };
}

export const NUTRIENT_NUMERIC_FIELDS = [
  ['proteinG', 'protéines'],
  ['carbsG', 'glucides'],
  ['fiberG', 'fibres'],
  ['fatG', 'lipides totaux'],
  ['saturatedFatG', 'lipides saturés'],
  ['polyunsaturatedFatG', 'lipides polyinsaturés'],
  ['monounsaturatedFatG', 'lipides monoinsaturés'],
  ['declaredKcal', 'calories déclarées'],
];
