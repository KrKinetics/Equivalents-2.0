/**
 * Pure coach calculator engine — mirrors golden master calculateur-coach-original.html.
 * No browser or DOM dependency.
 */

export const FEATURE_DA_ENABLED = false;

export const FORBIDDEN_PDF_MARKERS = [
  'A/D-A',
  'hybrid-da',
  'rollup',
  'provisoire',
  'diagnostic',
  'branch',
  'refactor',
  'release-candidate',
  'legacy-a',
];

export const PROFILE_STORAGE_KEY_PREFIX = 'athlete_';

export const CATS = ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];

export const MOYENNES = {
  pro: { p: 9, g: 0, l: 2 },
  fec: { p: 3, g: 18, l: 1 },
  leg: { p: 2, g: 7, l: 0 },
  fru: { p: 1, g: 15, l: 2 },
  lai: { p: 7, g: 10, l: 2 },
  lip: { p: 1, g: 2, l: 6 },
  whey: { p: 22, g: 2, l: 2 },
};

export const MACRO_PRESETS = [
  { id: 1, name: 'Perte légère', ratio: '30,40,30', proteinPct: 30, carbPct: 40, fatPct: 30 },
  { id: 2, name: 'Perte sévère', ratio: '40,35,25', proteinPct: 40, carbPct: 35, fatPct: 25 },
  { id: 3, name: 'Maintien', ratio: '25,45,30', proteinPct: 25, carbPct: 45, fatPct: 30 },
  { id: 4, name: 'Équilibré', ratio: '33,33,33', proteinPct: 33, carbPct: 33, fatPct: 33 },
  { id: 5, name: 'Prise légère', ratio: '25,50,25', proteinPct: 25, carbPct: 50, fatPct: 25 },
  { id: 6, name: 'Prise sévère', ratio: '20,55,25', proteinPct: 20, carbPct: 55, fatPct: 25 },
  { id: 7, name: 'Performance', ratio: '15,60,25', proteinPct: 15, carbPct: 60, fatPct: 25 },
  { id: 8, name: 'Lipides réduits', ratio: '45,35,20', proteinPct: 45, carbPct: 35, fatPct: 20 },
];

export const MEAL_COUNT = 6;

const PA_MALE = { sedentaire: 1.0, leger: 1.11, modere: 1.25, actif: 1.48 };
const PA_FEMALE = { sedentaire: 1.0, leger: 1.12, modere: 1.27, actif: 1.45 };

const DEFAULT_PROTEIN_G_PER_KG = 2;
const MIN_PROTEIN_G_PER_KG = 0.8;
const MAX_PROTEIN_G_PER_KG = 3.5;
const DEFAULT_PROTEIN_PCT = 25;
const MIN_PROTEIN_PCT = 10;
const MAX_PROTEIN_PCT = 50;

const DEFAULT_MACRO_CUSTOM_G = 45;
const DEFAULT_MACRO_CUSTOM_L = 30;
const MIN_MACRO_PCT = 5;
const MAX_MACRO_PCT = 80;

const LBS_TO_KG = 2.20462;

export function kcalFromMacros(pro, glu, lip) {
  return Math.round(pro * 4 + glu * 4 + lip * 9);
}

/**
 * Display-only macro energy shares that always sum to exactly 100%.
 * Protein and carbs are independently rounded; fat absorbs the residual.
 * Does not alter grams, calories, or portions.
 */
export function macroPercentagesFromGrams(pro, glu, lip) {
  const total = kcalFromMacros(pro || 0, glu || 0, lip || 0);
  if (!total) return { pro: 0, glu: 0, lip: 0 };
  const proPct = Math.round(((pro || 0) * 4 / total) * 100);
  const gluPct = Math.round(((glu || 0) * 4 / total) * 100);
  return { pro: proPct, glu: gluPct, lip: Math.max(0, 100 - proPct - gluPct) };
}

export function roundHalf(n) {
  return Math.max(0, Math.round(n * 2) / 2);
}

export function lbsToKg(lbs) {
  return (parseFloat(lbs) || 0) / LBS_TO_KG;
}

export function weightToKg(value, unit = 'kg') {
  const val = parseFloat(value) || 0;
  return unit === 'lbs' ? val / LBS_TO_KG : val;
}

export function heightToMeters({ unit = 'cm', cm, ft, in: inches } = {}) {
  if (unit === 'ft') {
    const feet = parseFloat(ft) || 0;
    const inch = parseFloat(inches) || 0;
    return ((feet * 12) + inch) * 2.54 / 100;
  }
  return (parseFloat(cm) || 0) / 100;
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

function growthAllowanceNasem(sexe, age) {
  if (age < 4) return sexe === 'H' ? 20 : 15;
  if (age < 9) return 15;
  if (age < 14) return sexe === 'H' ? 25 : 30;
  return 20;
}

const NASEM_COEFFICIENTS = {
  H: {
    youth: {
      sedentaire: [-447.51, 3.68, 13.01, 13.15],
      leger: [19.12, 3.68, 8.62, 20.28],
      modere: [-388.19, 3.68, 12.66, 20.46],
      actif: [-671.75, 3.68, 15.38, 23.25],
    },
    adult: {
      sedentaire: [753.07, -10.83, 6.50, 14.10],
      leger: [581.47, -10.83, 8.30, 14.94],
      modere: [1004.82, -10.83, 6.52, 15.91],
      actif: [-517.88, -10.83, 15.61, 19.11],
    },
  },
  F: {
    youth: {
      sedentaire: [55.59, -22.25, 8.43, 17.07],
      leger: [-297.54, -22.25, 12.77, 14.73],
      modere: [-189.55, -22.25, 11.74, 18.34],
      actif: [-709.59, -22.25, 18.22, 14.25],
    },
    adult: {
      sedentaire: [584.90, -7.01, 5.72, 11.71],
      leger: [575.77, -7.01, 6.60, 12.14],
      modere: [710.25, -7.01, 6.54, 12.34],
      actif: [511.83, -7.01, 9.07, 12.56],
    },
  },
};

/** IOM 2005 adult equations (historical compatibility). */
export function computeIom2005Eer({ sexe, age, poidsKg, hauteurM, activite }) {
  const kg = parseFloat(poidsKg) || 0;
  const m = parseFloat(hauteurM) || 0;
  const years = parseFloat(age) || 0;
  if (kg <= 0 || m <= 0 || years <= 0) return 0;
  if (sexe === 'H') {
    const pa = PA_MALE[activite] ?? PA_MALE.sedentaire;
    return 662 - (9.53 * years) + pa * ((15.91 * kg) + (539.6 * m));
  }
  const pa = PA_FEMALE[activite] ?? PA_FEMALE.sedentaire;
  return 354 - (6.91 * years) + pa * ((9.36 * kg) + (726 * m));
}

/** NASEM 2023 EER (youth + adult). */
export function computeNasem2023Eer({ sexe, age, poidsKg, hauteurCm, activite }) {
  const kg = parseFloat(poidsKg) || 0;
  const cm = parseFloat(hauteurCm) || 0;
  const years = parseFloat(age) || 0;
  if (kg <= 0 || cm <= 0 || years <= 0) return 0;
  const sex = sexe === 'F' ? 'F' : 'H';
  const youth = years < 19;
  const key = activite in (NASEM_COEFFICIENTS[sex].adult) ? activite : 'sedentaire';
  const [constant, ageFactor, heightFactor, weightFactor] =
    NASEM_COEFFICIENTS[sex][youth ? 'youth' : 'adult'][key];
  const growth = youth ? growthAllowanceNasem(sex, years) : 0;
  return constant + ageFactor * years + heightFactor * cm + weightFactor * kg + growth;
}

/**
 * Energy estimate.
 * @param {'nasem2023'|'iom2005'} [method='nasem2023']
 * Youth (<19) always uses NASEM 2023.
 */
export function computeEerTdee({
  sexe,
  age,
  poidsKg,
  hauteurM,
  activite,
  method = 'nasem2023',
}) {
  const kg = parseFloat(poidsKg) || 0;
  const m = parseFloat(hauteurM) || 0;
  const years = parseFloat(age) || 0;
  if (kg <= 0 || m <= 0 || years <= 0) {
    return { bmr: 0, tdee: 0, method: 'nasem2023' };
  }

  let resolved = method === 'iom2005' ? 'iom2005' : 'nasem2023';
  if (years < 19) resolved = 'nasem2023';

  if (resolved === 'iom2005') {
    return {
      bmr: computeIom2005Eer({ sexe, age: years, poidsKg: kg, hauteurM: m, activite: 'sedentaire' }),
      tdee: computeIom2005Eer({ sexe, age: years, poidsKg: kg, hauteurM: m, activite }),
      method: resolved,
    };
  }

  const cm = m * 100;
  return {
    bmr: computeNasem2023Eer({
      sexe, age: years, poidsKg: kg, hauteurCm: cm, activite: 'sedentaire',
    }),
    tdee: computeNasem2023Eer({
      sexe, age: years, poidsKg: kg, hauteurCm: cm, activite,
    }),
    method: resolved,
  };
}

export function migrateEnergyEquationVersion(data = {}) {
  return data.energyEquationVersion === 'nasem2023' ? 'nasem2023' : 'iom2005';
}

export function computeProteinGrams({ mode = 'gkg', weightKg, gPerKg, pct, goalKcal }) {
  const kg = parseFloat(weightKg) || 0;
  const kcalBrut = Math.round(parseFloat(goalKcal) || 0);
  if (mode === 'pct') {
    const proteinPct = normalizeProteinesPct(pct);
    return Math.round((kcalBrut * proteinPct) / 100 / 4);
  }
  return Math.round(kg * normalizeProteinesParKg(gPerKg));
}

export function adjustComplementaryCustomMacro(changed, value, proPct) {
  const remaining = Math.max(0, Math.round(100 - proPct));
  if (remaining <= 0) return { customG: 0, customL: 0 };
  if (remaining < 2 * MIN_MACRO_PCT) {
    const half = Math.round(remaining / 2);
    return changed === 'G'
      ? { customG: half, customL: remaining - half }
      : { customG: remaining - half, customL: half };
  }
  if (changed === 'G') {
    const g = Math.min(remaining - MIN_MACRO_PCT, Math.max(MIN_MACRO_PCT, Math.round(value)));
    return { customG: g, customL: remaining - g };
  }
  const l = Math.min(remaining - MIN_MACRO_PCT, Math.max(MIN_MACRO_PCT, Math.round(value)));
  return { customG: remaining - l, customL: l };
}

export function getCustomGluLipTotalPcts({ customG, customL, isRestDay, proPct }) {
  let gluPct = customG;
  let lipPct = customL;
  if (isRestDay) {
    gluPct *= 0.75;
    lipPct *= 1.15;
    const sum = gluPct + lipPct;
    const remaining = Math.max(0, 100 - proPct);
    if (sum > 0) {
      gluPct = (gluPct / sum) * remaining;
      lipPct = (lipPct / sum) * remaining;
    }
  }
  return { gluPct, lipPct };
}

export function getGluLipShares({ macroRatio, isRestDay }) {
  const ratioVal = String(macroRatio || '').split(',');
  let pctGlu = parseFloat(ratioVal[1]) / 100;
  let pctLip = parseFloat(ratioVal[2]) / 100;
  if (isRestDay) {
    pctGlu *= 0.75;
    pctLip *= 1.15;
  }
  const gluLipTotal = pctGlu + pctLip;
  if (gluLipTotal <= 0) return null;
  return { gluShare: pctGlu / gluLipTotal, lipShare: pctLip / gluLipTotal };
}

export function computeMacroTargets({
  tdee,
  goalMultiplier = 1,
  weightKg,
  proteinMode = 'gkg',
  gPerKg,
  pct,
  proteinGrams,
  macroMode = 'preset',
  macroRatio = '25,45,30',
  customG = DEFAULT_MACRO_CUSTOM_G,
  customL = DEFAULT_MACRO_CUSTOM_L,
  isRestDay = false,
}) {
  const kg = parseFloat(weightKg) || 0;
  const tdeeVal = parseFloat(tdee) || 0;
  if (tdeeVal <= 0 || kg <= 0) {
    return { kcal: 0, pro: 0, glu: 0, lip: 0 };
  }

  const kcalBrut = Math.round(tdeeVal * goalMultiplier);
  let pro = proteinGrams != null
    ? Math.round(proteinGrams)
    : computeProteinGrams({ mode: proteinMode, weightKg: kg, gPerKg, pct, goalKcal: kcalBrut });

  let kcalRemaining = kcalBrut - pro * 4;
  if (kcalRemaining < 200) {
    pro = Math.max(0, Math.floor((kcalBrut - 200) / 4));
    kcalRemaining = kcalBrut - pro * 4;
  }
  if (kcalRemaining < 0) kcalRemaining = 0;

  if (macroMode === 'custom') {
    const proPct = kcalBrut > 0 ? (pro * 4 * 100) / kcalBrut : 0;
    const pcts = getCustomGluLipTotalPcts({ customG, customL, isRestDay, proPct });
    const glu = Math.round((kcalBrut * pcts.gluPct) / 100 / 4);
    const lip = Math.round((kcalBrut * pcts.lipPct) / 100 / 9);
    return { pro, glu, lip, kcal: pro * 4 + glu * 4 + lip * 9 };
  }

  const shares = getGluLipShares({ macroRatio, isRestDay });
  if (!shares) return { kcal: 0, pro: 0, glu: 0, lip: 0 };
  const glu = Math.round((kcalRemaining * shares.gluShare) / 4);
  const lip = Math.round((kcalRemaining * shares.lipShare) / 9);
  return { pro, glu, lip, kcal: pro * 4 + glu * 4 + lip * 9 };
}

export function getPortionTotals(portions) {
  let pro = 0;
  let glu = 0;
  let lip = 0;
  for (const cat of CATS) {
    const v = portions[cat] || 0;
    pro += v * MOYENNES[cat].p;
    glu += v * MOYENNES[cat].g;
    lip += v * MOYENNES[cat].l;
  }
  return { pro, glu, lip, kcal: kcalFromMacros(pro, glu, lip) };
}

export function computeBanqueTotals(banque) {
  let pro = 0;
  let glu = 0;
  let lip = 0;
  for (const cat of CATS) {
    const val = parseFloat(banque?.[cat]) || 0;
    pro += val * MOYENNES[cat].p;
    glu += val * MOYENNES[cat].g;
    lip += val * MOYENNES[cat].l;
  }
  pro = Math.round(pro);
  glu = Math.round(glu);
  lip = Math.round(lip);
  return { pro, glu, lip, kcal: kcalFromMacros(pro, glu, lip) };
}

export function computeHydration(kcal, manualAddL = 0) {
  const kcalVal = parseFloat(kcal) || 0;
  const auto = kcalVal > 0 ? Math.round((kcalVal / 1000) * 10) / 10 : 0;
  const ajout = Math.max(0, parseFloat(manualAddL) || 0);
  return { auto, ajout, total: auto + ajout };
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

export function assertNoForbiddenPdfContent(text) {
  const haystack = String(text ?? '').toLowerCase();
  for (const marker of FORBIDDEN_PDF_MARKERS) {
    if (haystack.includes(marker.toLowerCase())) {
      throw new Error(`Forbidden PDF marker detected: ${marker}`);
    }
  }
}

function getRepValueFromData(repartition, mealIdx, cat) {
  const idx = mealIdx * CATS.length + CATS.indexOf(cat);
  return parseFloat(repartition?.[idx]) || 0;
}

export function evaluatePlanCompleteness({ jourData, targets, targetsReady = true }) {
  const errors = [];
  const warnings = [];
  const data = jourData || createEmptyJourData();
  const t = targets || { kcal: 0, pro: 0, glu: 0, lip: 0 };

  if (!targetsReady || t.kcal === 0) errors.push('Profil incomplet (cibles).');

  let banqueTotal = 0;
  for (const cat of CATS) banqueTotal += parseFloat(data.banque?.[cat]) || 0;
  if (banqueTotal === 0) errors.push('Banque vide.');

  const banqueTotals = computeBanqueTotals(data.banque);
  if (t.kcal > 0 && banqueTotal > 0) {
    const ecartKcal = banqueTotals.kcal - t.kcal;
    const ecartPro = banqueTotals.pro - t.pro;
    const ecartGlu = banqueTotals.glu - t.glu;
    const ecartLip = banqueTotals.lip - t.lip;
    if (Math.abs(ecartKcal) > 50 || Math.abs(ecartPro) > 5 || Math.abs(ecartGlu) > 5 || Math.abs(ecartLip) > 5) {
      warnings.push('Écart banque/cibles.');
    }
  }

  const restants = [];
  for (const cat of CATS) {
    const cible = parseFloat(data.banque?.[cat]) || 0;
    let sum = 0;
    for (let m = 0; m < MEAL_COUNT; m++) sum += getRepValueFromData(data.repartition, m, cat);
    const rest = Math.round((cible - sum) * 10) / 10;
    if (cible > 0 && rest !== 0) restants.push(cat);
  }
  if (restants.length) errors.push(`Répartition incomplète (${restants.join(', ')}).`);

  let hasMealFood = false;
  for (let i = 0; i < MEAL_COUNT * CATS.length; i++) {
    if ((parseFloat(data.repartition?.[i]) || 0) > 0) hasMealFood = true;
  }
  if (banqueTotal > 0 && !hasMealFood) errors.push('Repas non distribués.');

  return {
    errors,
    warnings,
    canExport: errors.length === 0 && hasMealFood && banqueTotal > 0,
  };
}

export function distribuerPortions(total, weights) {
  if (total <= 0) return new Array(MEAL_COUNT).fill(0);
  const raw = weights.map((w) => total * w);
  const portions = raw.map((v) => Math.floor(v * 2) / 2);
  let remain = Math.round((total - portions.reduce((a, b) => a + b, 0)) * 2) / 2;
  const order = raw
    .map((v, i) => ({ i, frac: v - portions[i] }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  let step = 0;
  while (remain >= 0.5 && step < 24) {
    portions[order[step % MEAL_COUNT].i] += 0.5;
    remain -= 0.5;
    step += 1;
  }
  return portions;
}

export function scorePortions(portions, targets) {
  const t = getPortionTotals(portions);
  const tol = { pro: 5, glu: 5, lip: 5, kcal: 50 };
  let score = Math.abs(t.pro - targets.pro) + Math.abs(t.glu - targets.glu) + Math.abs(t.lip - targets.lip);
  score += Math.abs(t.kcal - targets.kcal) * 0.1;
  if (Math.abs(t.pro - targets.pro) > tol.pro) score += 20;
  if (Math.abs(t.glu - targets.glu) > tol.glu) score += 20;
  if (Math.abs(t.lip - targets.lip) > tol.lip) score += 20;
  if (Math.abs(t.kcal - targets.kcal) > tol.kcal) score += 30;
  return score;
}

export function suggestBanque(targets) {
  if (!targets || targets.kcal === 0) {
    return null;
  }

  const tweaks = [-1, -0.5, 0, 0.5, 1];
  let best = null;
  let bestScore = Infinity;

  for (let leg = 1.5; leg <= 3; leg += 0.5) {
    for (let fru = 1; fru <= 3; fru += 0.5) {
      for (let lai = 0.5; lai <= 2; lai += 0.5) {
        const seed = { leg, fru, lai, whey: 0, pro: 0, fec: 0, lip: 0 };
        let used = getPortionTotals(seed);
        seed.fec = roundHalf((targets.glu - used.glu) / MOYENNES.fec.g);
        used = getPortionTotals(seed);
        seed.pro = roundHalf((targets.pro - used.pro) / MOYENNES.pro.p);
        used = getPortionTotals(seed);
        seed.lip = roundHalf((targets.lip - used.lip) / MOYENNES.lip.l);

        for (const dp of tweaks) {
          for (const df of tweaks) {
            for (const dl of tweaks) {
              for (const dw of [0, 0.5, 1]) {
                const trial = {
                  leg,
                  fru,
                  lai,
                  pro: Math.max(0, seed.pro + dp),
                  fec: Math.max(0, seed.fec + df),
                  lip: Math.max(0, seed.lip + dl),
                  whey: Math.max(0, seed.whey + dw),
                };
                const s = scorePortions(trial, targets);
                if (s < bestScore) {
                  bestScore = s;
                  best = trial;
                }
              }
            }
          }
        }
      }
    }
  }

  return best;
}

export function profileStorageKey(athleteName) {
  return `${PROFILE_STORAGE_KEY_PREFIX}${athleteName}`;
}

/** Explicit client-PDF variance thresholds (planned vs target). */
export const PDF_VARIANCE_THRESHOLDS = Object.freeze({
  kcal: 50,
  pro: 5,
  glu: 5,
  lip: 5,
});

/**
 * A day is "configured" for the client PDF only when meal distribution
 * contains at least one non-zero portion (banque alone is not enough).
 */
export function isJourClientPlanConfigured(jourData) {
  const data = jourData || createEmptyJourData();
  for (let i = 0; i < MEAL_COUNT * CATS.length; i += 1) {
    if ((parseFloat(data.repartition?.[i]) || 0) > 0) return true;
  }
  return false;
}

/**
 * Planned totals from meal distribution, mirroring getJourSnapshot rounding:
 * each meal rounds P/G/L before summing, then kcal is derived from the sums.
 * This is the documented source of banque vs planned divergence.
 */
export function computePlannedTotalsFromRepartition(repartition) {
  let totalPro = 0;
  let totalGlu = 0;
  let totalLip = 0;
  for (let i = 0; i < MEAL_COUNT; i += 1) {
    let rPro = 0;
    let rGlu = 0;
    let rLip = 0;
    for (const cat of CATS) {
      const val = getRepValueFromData(repartition, i, cat);
      rPro += val * MOYENNES[cat].p;
      rGlu += val * MOYENNES[cat].g;
      rLip += val * MOYENNES[cat].l;
    }
    const rKcal = kcalFromMacros(rPro, rGlu, rLip);
    if (rKcal > 0) {
      totalPro += Math.round(rPro);
      totalGlu += Math.round(rGlu);
      totalLip += Math.round(rLip);
    }
  }
  return {
    pro: totalPro,
    glu: totalGlu,
    lip: totalLip,
    kcal: kcalFromMacros(totalPro, totalGlu, totalLip),
  };
}

function deltaMacros(a, b) {
  return {
    kcal: (a?.kcal || 0) - (b?.kcal || 0),
    pro: (a?.pro || 0) - (b?.pro || 0),
    glu: (a?.glu || 0) - (b?.glu || 0),
    lip: (a?.lip || 0) - (b?.lip || 0),
  };
}

function withinVarianceThresholds(delta, thresholds = PDF_VARIANCE_THRESHOLDS) {
  return (
    Math.abs(delta.kcal) <= thresholds.kcal
    && Math.abs(delta.pro) <= thresholds.pro
    && Math.abs(delta.glu) <= thresholds.glu
    && Math.abs(delta.lip) <= thresholds.lip
  );
}

/**
 * Reconcile target / banque / planned totals for client PDF display.
 * Origin of differences:
 * - target: macro formula (rounded grams → kcal)
 * - banque: portions × MOYENNES, macros rounded once, then kcal
 * - planned: per-meal macros rounded then summed (can differ from banque)
 */
export function reconcilePlanTotals({ targets, banqueTotals, plannedTotals, thresholds = PDF_VARIANCE_THRESHOLDS }) {
  const target = {
    kcal: targets?.kcal || 0,
    pro: targets?.pro || 0,
    glu: targets?.glu || 0,
    lip: targets?.lip || 0,
  };
  const banque = {
    kcal: banqueTotals?.kcal || 0,
    pro: banqueTotals?.pro || 0,
    glu: banqueTotals?.glu || 0,
    lip: banqueTotals?.lip || 0,
  };
  const planned = {
    kcal: plannedTotals?.kcal || 0,
    pro: plannedTotals?.pro || 0,
    glu: plannedTotals?.glu || 0,
    lip: plannedTotals?.lip || 0,
  };
  const varianceVsTarget = deltaMacros(planned, target);
  const banqueVsTarget = deltaMacros(banque, target);
  const plannedVsBanque = deltaMacros(planned, banque);
  return {
    target,
    banque,
    planned,
    varianceVsTarget,
    banqueVsTarget,
    plannedVsBanque,
    thresholds: { ...thresholds },
    withinThreshold: withinVarianceThresholds(varianceVsTarget, thresholds),
    origin:
      'Cible = formule macro; banque = portions × moyennes (arrondi global); '
      + 'planifié = arrondi P/G/L par repas puis somme (source de l’écart banque/planifié).',
  };
}
