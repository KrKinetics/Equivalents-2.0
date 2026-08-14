/**
 * Pure client-profile domain helpers for the Coach calculator.
 * No DOM, storage I/O, filesystem, or PDF side effects.
 */

import { CATS, MEAL_COUNT } from './plan-structure.mjs';

export const PROFILE_STORAGE_KEY_PREFIX = 'athlete_';

const DEFAULT_PROTEIN_G_PER_KG = 2;
const MIN_PROTEIN_G_PER_KG = 0.8;
const MAX_PROTEIN_G_PER_KG = 3.5;
const DEFAULT_PROTEIN_PCT = 25;
const MIN_PROTEIN_PCT = 10;
const MAX_PROTEIN_PCT = 50;

const DEFAULT_MACRO_CUSTOM_G = 45;
const MIN_MACRO_PCT = 5;
const MAX_MACRO_PCT = 80;

export function profileStorageKey(athleteName) {
  return `${PROFILE_STORAGE_KEY_PREFIX}${athleteName}`;
}

export function migrateEnergyEquationVersion(data = {}) {
  return data.energyEquationVersion === 'nasem2023' ? 'nasem2023' : 'iom2005';
}

export function normalizeProteinesParKg(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return DEFAULT_PROTEIN_G_PER_KG;
  return Math.min(MAX_PROTEIN_G_PER_KG, Math.max(MIN_PROTEIN_G_PER_KG, Math.round(n * 10) / 10));
}

export function normalizeProteinesPct(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return DEFAULT_PROTEIN_PCT;
  return Math.min(MAX_PROTEIN_PCT, Math.max(MIN_PROTEIN_PCT, Math.round(n)));
}

export function normalizeMacroPct(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return DEFAULT_MACRO_CUSTOM_G;
  return Math.min(MAX_MACRO_PCT, Math.max(MIN_MACRO_PCT, Math.round(n)));
}

const REPARTITION_CELL_COUNT = MEAL_COUNT * CATS.length;
const LEGACY_REPARTITION_KEY_RE = /^(?:0|[1-9]\d?)$/;

/**
 * Convert a recognized legacy indexed repartition object into the canonical
 * Array representation used by the Coach API contract.
 *
 * - Valid Arrays are returned unchanged.
 * - Only plain objects whose keys are integer indices in [0, 41] are accepted.
 * - Numeric strings (optional comma decimals) are coerced safely.
 * - Malformed structures are rejected (ok: false) without mutation.
 */
export function normalizeLegacyRepartition(repartition) {
  if (Array.isArray(repartition)) {
    return { ok: true, value: repartition, changed: false };
  }
  if (repartition == null) {
    return { ok: true, value: repartition, changed: false };
  }
  if (typeof repartition !== 'object') {
    return { ok: false, reason: 'invalid_repartition_type' };
  }

  const keys = Object.keys(repartition);
  for (const key of keys) {
    if (!LEGACY_REPARTITION_KEY_RE.test(key)) {
      return { ok: false, reason: 'invalid_repartition_key' };
    }
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= REPARTITION_CELL_COUNT) {
      return { ok: false, reason: 'invalid_repartition_key' };
    }
  }

  const out = new Array(REPARTITION_CELL_COUNT).fill(0);
  for (const key of keys) {
    const idx = Number(key);
    const raw = repartition[key];
    const n = typeof raw === 'string'
      ? Number(String(raw).trim().replace(',', '.'))
      : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return { ok: false, reason: 'invalid_repartition_value' };
    }
    out[idx] = n;
  }
  return { ok: true, value: out, changed: true };
}

function withCanonicalRepartition(jour) {
  if (!jour || typeof jour !== 'object') return jour;
  const normalized = normalizeLegacyRepartition(jour.repartition);
  if (!normalized.ok) return jour;
  if (!normalized.changed) return jour;
  return { ...jour, repartition: normalized.value };
}

export function createEmptyJourData() {
  const banque = {};
  for (const cat of CATS) banque[cat] = '0';
  const repartition = new Array(REPARTITION_CELL_COUNT).fill(0);
  return {
    banque,
    repartition,
    heureEntrainement: '17:30',
    repartitionSelonEntrainement: true,
    eauLitres: '0',
    eauAjout: '0',
    eauManuel: false,
  };
}

export function migrateProfilData(data) {
  if (data?.jours?.entrainement && data?.jours?.repos) {
    return {
      ...data,
      activeJour: data.activeJour || 'entrainement',
      macroMode: data.macroMode === 'custom' ? 'custom' : 'preset',
      macroCustomG: normalizeMacroPct(data.macroCustomG),
      macroCustomL: normalizeMacroPct(data.macroCustomL),
      proteinesMode: data.proteinesMode === 'pct' ? 'pct' : 'gkg',
      proteinesParKg: normalizeProteinesParKg(data.proteinesParKg),
      proteinesPct: normalizeProteinesPct(data.proteinesPct),
      jourReposActif: data.jourReposActif !== false,
      coachNotes: typeof data.coachNotes === 'string' ? data.coachNotes : '',
      jours: {
        entrainement: withCanonicalRepartition({
          ...createEmptyJourData(),
          ...data.jours.entrainement,
        }),
        repos: withCanonicalRepartition({
          ...createEmptyJourData(),
          ...data.jours.repos,
        }),
      },
    };
  }

  const ent = createEmptyJourData();
  if (data?.banque) ent.banque = { ...ent.banque, ...data.banque };
  if (data?.repartition) {
    // Merge legacy indexed values onto the empty template, then canonicalize.
    const merged = { ...ent.repartition, ...data.repartition };
    const normalized = normalizeLegacyRepartition(merged);
    ent.repartition = normalized.ok ? normalized.value : data.repartition;
  }
  ent.heureEntrainement = data?.heureEntrainement || '17:30';
  ent.eauLitres = data?.eauLitres || '0';
  ent.eauAjout = data?.eauAjout || '0';
  ent.eauManuel = !!data?.eauManuel;

  return {
    ...data,
    version: 2,
    activeJour: data?.typeJour || data?.activeJour || 'entrainement',
    macroMode: data?.macroMode === 'custom' ? 'custom' : 'preset',
    macroCustomG: normalizeMacroPct(data?.macroCustomG),
    macroCustomL: normalizeMacroPct(data?.macroCustomL),
    proteinesMode: data?.proteinesMode === 'pct' ? 'pct' : 'gkg',
    proteinesParKg: normalizeProteinesParKg(data?.proteinesParKg),
    proteinesPct: normalizeProteinesPct(data?.proteinesPct),
    jourReposActif: data?.jourReposActif !== false,
    coachNotes: typeof data?.coachNotes === 'string' ? data.coachNotes : '',
    jours: {
      entrainement: withCanonicalRepartition(ent),
      repos: createEmptyJourData(),
    },
  };
}
