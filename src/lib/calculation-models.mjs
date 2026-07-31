/**
 * Versioned calculation model identifiers for KR Kinetics Equivalents 2.0.
 * Production default remains legacy-a. hybrid-da-rc is release-candidate preview only.
 */

export const CALCULATION_MODEL_VERSIONS = Object.freeze({
  LEGACY_A: 'legacy-a',
  HYBRID_DA_RC: 'hybrid-da-rc',
});

export const ALLOWED_CALCULATION_MODEL_VERSIONS = Object.freeze([
  CALCULATION_MODEL_VERSIONS.LEGACY_A,
  CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC,
]);

/** Default when calculationModelVersion is absent (existing plans). */
export const DEFAULT_CALCULATION_MODEL_VERSION = CALCULATION_MODEL_VERSIONS.LEGACY_A;

export const MODEL_LABELS = Object.freeze({
  [CALCULATION_MODEL_VERSIONS.LEGACY_A]: {
    fr: 'Mode actuel — règles KR Kinetics',
    en: 'Current mode — KR Kinetics rules',
  },
  [CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC]: {
    fr: 'Aperçu précision — profils d’échange',
    en: 'Precision preview — exchange profiles',
  },
});

/**
 * Resolve plan model version. Missing metadata always falls back to legacy-a.
 * Never auto-migrates.
 */
export function resolveCalculationModelVersion(planOrVersion) {
  if (planOrVersion == null) return DEFAULT_CALCULATION_MODEL_VERSION;
  const raw = typeof planOrVersion === 'string'
    ? planOrVersion
    : planOrVersion.calculationModelVersion;
  if (raw == null || raw === '') return DEFAULT_CALCULATION_MODEL_VERSION;
  if (!ALLOWED_CALCULATION_MODEL_VERSIONS.includes(raw)) {
    throw new Error(`Unsupported calculationModelVersion: ${raw}`);
  }
  return raw;
}

export function isPreviewOnlyModel(version) {
  return resolveCalculationModelVersion(version) === CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC;
}

export function isProductionDefaultModel(version) {
  return resolveCalculationModelVersion(version) === CALCULATION_MODEL_VERSIONS.LEGACY_A;
}
