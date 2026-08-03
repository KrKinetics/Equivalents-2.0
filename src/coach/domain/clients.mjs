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

export function createEmptyJourData() {
  const banque = {};
  const repartition = {};
  for (const cat of CATS) banque[cat] = '0';
  for (let i = 0; i < MEAL_COUNT * CATS.length; i++) repartition[i] = '0';
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
        entrainement: { ...createEmptyJourData(), ...data.jours.entrainement },
        repos: { ...createEmptyJourData(), ...data.jours.repos },
      },
    };
  }

  const ent = createEmptyJourData();
  if (data?.banque) ent.banque = { ...ent.banque, ...data.banque };
  if (data?.repartition) ent.repartition = { ...ent.repartition, ...data.repartition };
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
    jours: { entrainement: ent, repos: createEmptyJourData() },
  };
}
