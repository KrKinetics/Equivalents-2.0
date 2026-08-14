/**
 * Permanent Bloc 2 bridge: wires calculator UI to server nutrition + PDF APIs.
 *
 * - never downloads the full food bank
 * - never silently falls back to the legacy client engine or client PDF on error
 * - shows a generic error and allows retry
 */

import {
  searchFoodsApi,
  calcEnergyApi,
  calcMacrosApi,
  calcPortionsApi,
  calcEquivalencesApi,
  foodDetailApi,
  generatePdfApi,
  SERVER_NUTRITION_GENERIC_ERROR,
  SERVER_NUTRITION_VALIDATION_ERROR,
  SERVER_PDF_GENERIC_ERROR,
  formatServerNutritionError,
} from './server-nutrition-api.mjs';

function featureOn() {
  // Bloc 2: server path is permanent. Prefer explicit flag when present.
  if (globalThis.COACH_FEATURES && 'serverNutritionEngine' in globalThis.COACH_FEATURES) {
    return Boolean(globalThis.COACH_FEATURES.serverNutritionEngine);
  }
  return true;
}

function notifyNutritionError(message = SERVER_NUTRITION_GENERIC_ERROR) {
  // Prefer non-blocking workspace status; fall back to alert when chrome is absent.
  const onWorkspace = typeof location !== 'undefined' && /\/workspace/.test(location.pathname || '');
  if (onWorkspace || globalThis.COACH_WORKSPACE_CONTEXT || globalThis.__COACH_WORKSPACE_CONTEXT__) {
    const status = document.getElementById('workspace-persist-status');
    if (status) {
      status.textContent = message;
      status.style.color = '#fecaca';
      return;
    }
  }
  window.alert(message);
}

function showGuideError(message = SERVER_NUTRITION_GENERIC_ERROR) {
  const el = document.getElementById('guide-count');
  if (el) el.textContent = message;
  const tbody = document.getElementById('guide-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="left">${escapeHtml(message)} `
      + `<button type="button" id="server-nutrition-retry">Réessayer</button></td></tr>`;
    document.getElementById('server-nutrition-retry')?.addEventListener('click', () => {
      void filtrerGuideEquivalentsServer();
    });
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtNum(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return String(Math.round(Number(v) * 10) / 10);
}

async function ensureMoyennes() {
  if (globalThis.__COACH_SERVER_MOYENNES) return globalThis.__COACH_SERVER_MOYENNES;
  const res = await calcPortionsApi({ action: 'moyennes' });
  globalThis.__COACH_SERVER_MOYENNES = res.moyennes;
  // Keep legacy identifier for any remaining UI references without shipping formulas.
  if (typeof globalThis.MOYENNES === 'undefined' || globalThis.COACH_FEATURES?.serverNutritionEngine) {
    globalThis.MOYENNES = res.moyennes;
  }
  return res.moyennes;
}

/**
 * Keep CoachSharedEngine.macroPercentagesFromGrams usable for plan/PDF labels.
 * Prefer last server-computed percentages when grams match cached targets/totals.
 * Never calls blocked legacy suggestBanque / NASEM paths.
 */
function installServerMacroPercentageHelpers() {
  const engine = globalThis.CoachSharedEngine;
  if (!engine || engine.__coachServerMacroPctInstalled) return;

  function fromServerCache(pro, glu, lip) {
    const cache = globalThis.__COACH_MACRO_PCT_CACHE;
    if (!cache) return null;
    const key = `${Math.round(Number(pro) || 0)}:${Math.round(Number(glu) || 0)}:${Math.round(Number(lip) || 0)}`;
    return cache[key] ? { ...cache[key] } : null;
  }

  function displayPercentages(pro, glu, lip) {
    const cached = fromServerCache(pro, glu, lip);
    if (cached) return cached;
    // Same Atwater energy-share formatting as server macros.mjs (display only).
    const p = Number(pro) || 0;
    const g = Number(glu) || 0;
    const l = Number(lip) || 0;
    const total = Math.round(p * 4 + g * 4 + l * 9);
    if (!total) return { pro: 0, glu: 0, lip: 0 };
    const proPct = Math.round((p * 4 / total) * 100);
    const gluPct = Math.round((g * 4 / total) * 100);
    return { pro: proPct, glu: gluPct, lip: Math.max(0, 100 - proPct - gluPct) };
  }

  engine.macroPercentagesFromGrams = displayPercentages;
  globalThis.macroPercentagesFromGrams = displayPercentages;
  engine.__coachServerMacroPctInstalled = true;
}

function cacheMacroPercentages(totals, percentages) {
  if (!totals || !percentages) return;
  if (!globalThis.__COACH_MACRO_PCT_CACHE) globalThis.__COACH_MACRO_PCT_CACHE = Object.create(null);
  const key = `${Math.round(Number(totals.pro) || 0)}:${Math.round(Number(totals.glu) || 0)}:${Math.round(Number(totals.lip) || 0)}`;
  globalThis.__COACH_MACRO_PCT_CACHE[key] = {
    pro: percentages.pro,
    glu: percentages.glu,
    lip: percentages.lip,
  };
}

function fingerprintRepartition(repartition) {
  if (!Array.isArray(repartition) && typeof repartition !== 'object') return '';
  const vals = [];
  const len = Array.isArray(repartition) ? repartition.length : 42;
  for (let i = 0; i < len; i += 1) vals.push(String(Number(repartition[i]) || 0));
  return vals.join('|');
}

/**
 * Canonical nutrition day state lives on joursData[jour]:
 * banque, repartition, banqueTotals, plannedTotals (server-authored).
 */
function writeCanonicalDayTotals(jourKey, { banqueTotals, plannedTotals, percentages } = {}) {
  const day = globalThis.joursData?.[jourKey];
  if (!day) return;
  if (banqueTotals) day.banqueTotals = { ...banqueTotals };
  if (plannedTotals) {
    day.plannedTotals = { ...plannedTotals };
    day.__plannedTotalsFp = fingerprintRepartition(day.repartition);
  }
  if (percentages && plannedTotals) cacheMacroPercentages(plannedTotals, percentages);
}

let plannedTotalsRefreshInflight = null;

/**
 * Refresh server planned totals so getJourSnapshot / plan text are not stuck at zeros.
 * Skips days whose fingerprint already matches cached plannedTotals (avoids burning
 * the calc-portions rate budget after auto_repartition / banque settle).
 */
async function refreshPlannedTotalsFromServer({ force = false } = {}) {
  if (plannedTotalsRefreshInflight && !force) {
    return plannedTotalsRefreshInflight;
  }
  plannedTotalsRefreshInflight = (async () => {
    const jours = globalThis.joursData || {};
    const cache = Object.create(null);
    const errors = [];
    for (const key of ['entrainement', 'repos']) {
      const day = jours[key];
      if (!day?.repartition) continue;
      // Canonical contract is Array; skip non-array so one legacy day cannot abort the other.
      if (!Array.isArray(day.repartition)) {
        errors.push(new Error(SERVER_NUTRITION_VALIDATION_ERROR));
        continue;
      }
      const fp = fingerprintRepartition(day.repartition);
      if (!force && day.plannedTotals && day.__plannedTotalsFp === fp) {
        cache[key] = { ...day.plannedTotals };
        continue;
      }
      try {
        const res = await calcPortionsApi({
          action: 'planned_totals',
          repartition: day.repartition,
        });
        const totals = res.totals || { pro: 0, glu: 0, lip: 0, kcal: 0 };
        cache[key] = totals;
        writeCanonicalDayTotals(key, {
          plannedTotals: totals,
          percentages: res.percentages,
        });
      } catch (err) {
        errors.push(err);
      }
    }
    // Preserve previously successful day caches when a sibling day fails.
    const prior = globalThis.__COACH_PLANNED_TOTALS || {};
    globalThis.__COACH_PLANNED_TOTALS = {
      ...prior,
      ...cache,
    };
    const engine = globalThis.CoachSharedEngine;
    if (engine) {
      engine.computePlannedTotalsFromRepartition = function computePlannedTotalsFromServerCache(repartition) {
        const fp = fingerprintRepartition(repartition);
        for (const dayKey of ['entrainement', 'repos']) {
          const day = globalThis.joursData?.[dayKey];
          if (!day) continue;
          if (day.plannedTotals && day.__plannedTotalsFp === fp) {
            return { ...day.plannedTotals };
          }
          if (day.repartition === repartition || fingerprintRepartition(day.repartition) === fp) {
            return { ...(globalThis.__COACH_PLANNED_TOTALS?.[dayKey] || day.plannedTotals || { pro: 0, glu: 0, lip: 0, kcal: 0 }) };
          }
        }
        return { pro: 0, glu: 0, lip: 0, kcal: 0 };
      };
    }
    if (errors.length) {
      throw errors[0];
    }
  })().finally(() => {
    plannedTotalsRefreshInflight = null;
  });
  return plannedTotalsRefreshInflight;
}

function readBanqueFromUi() {
  const CATS = globalThis.CATS || ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];
  const banque = {};
  CATS.forEach((cat) => {
    const el = document.querySelector(`.target-input[data-cat="${cat}"]`);
    banque[cat] = el ? (parseFloat(el.value) || 0) : 0;
  });
  return banque;
}

function applyRepartitionToUi(repartition) {
  const inputs = document.querySelectorAll('.rep-input');
  inputs.forEach((inp, idx) => {
    inp.value = repartition[idx] != null ? repartition[idx] : 0;
  });
}

function syncCanonicalDayFromUi(jourKey) {
  if (typeof globalThis.captureJourActif === 'function') globalThis.captureJourActif();
  const key = jourKey || globalThis.activeJour || 'entrainement';
  const day = globalThis.joursData?.[key];
  if (!day) return day;
  // Normalize numeric types for save/PDF (UI may store strings).
  const CATS = globalThis.CATS || ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];
  CATS.forEach((cat) => {
    day.banque[cat] = parseFloat(day.banque[cat]) || 0;
  });
  for (let i = 0; i < (day.repartition?.length || 0); i += 1) {
    day.repartition[i] = parseFloat(day.repartition[i]) || 0;
  }
  return day;
}

async function chargerCoachDataServer() {
  try {
    // Bootstrap categories only — one empty search page, never the full bank.
    const page = await searchFoodsApi({ q: '', limit: 1, offset: 0 });
    globalThis.COACH_DATA = {
      totalFoods: page.total,
      verifiedFoods: page.total,
      featureDaEnabled: false,
      guide: {
        sections: (page.categories || []).map((c) => ({
          id: c.id,
          titleFr: c.labelFr,
          titleEn: c.labelEn,
          foods: [],
        })),
      },
      foods: [],
      serverNutrition: true,
    };
    await ensureMoyennes();
    initialiserGuideEquivalentsServer();
  } catch {
    globalThis.COACH_DATA = null;
    showGuideError();
  }
}

function initialiserGuideEquivalentsServer() {
  const data = globalThis.COACH_DATA;
  if (!data) return;
  const sel = document.getElementById('guide-filter-cat');
  const da = document.getElementById('guide-da-flag');
  if (da) da.textContent = 'désactivé';
  if (sel) {
    const cats = (data.guide?.sections || []).map((s) => ({ id: s.id, label: s.titleFr || s.id }));
    sel.innerHTML = '<option value="">Toutes les catégories</option>'
      + cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('');
  }
  void filtrerGuideEquivalentsServer();
}

async function filtrerGuideEquivalentsServer() {
  const tbody = document.getElementById('guide-tbody');
  const countEl = document.getElementById('guide-count');
  if (!tbody) return;
  const q = (document.getElementById('guide-search')?.value || '').trim();
  const cat = document.getElementById('guide-filter-cat')?.value || '';
  try {
    const page = await searchFoodsApi({ q, category: cat, limit: 50, offset: 0 });
    const sectionTitle = Object.fromEntries(
      (globalThis.COACH_DATA?.guide?.sections || []).map((s) => [s.id, s.titleFr || s.id]),
    );
    tbody.innerHTML = (page.results || []).map((f) => {
      const n = f.nutrients || {};
      return '<tr>'
        + `<td class="left"><strong>${escapeHtml(f.nameFr)}</strong><br>`
        + `<span style="color:#64748b;font-size:0.8em;">${escapeHtml(f.nameEn)}</span></td>`
        + `<td>${escapeHtml(f.portionFr)}</td>`
        + `<td>${fmtNum(n.proteinG)}</td>`
        + `<td>${fmtNum(n.carbsG)}</td>`
        + `<td>${fmtNum(n.fatG)}</td>`
        + `<td>${fmtNum(n.declaredKcal)}</td>`
        + `<td>${escapeHtml(sectionTitle[f.displayCategory] || f.displayCategory || '')}</td>`
        + '</tr>';
    }).join('');
    if (countEl) {
      countEl.textContent = `${page.results.length} / ${page.total} (serveur, max 50)`;
    }
  } catch {
    showGuideError();
  }
}

async function calculerBesoinsServer() {
  const sexe = document.getElementById('sexe')?.value;
  const age = parseFloat(document.getElementById('age')?.value) || 0;
  const act = document.getElementById('activite')?.value;
  const kg = typeof globalThis.getPoidsKg === 'function' ? globalThis.getPoidsKg() : 0;
  const metres = typeof globalThis.getGrandeurM === 'function' ? globalThis.getGrandeurM() : 0;
  if (kg <= 0 || metres <= 0 || age <= 0) return;

  let method = globalThis.KR_energyEquationVersion || 'nasem2023';
  if (age < 19 && method === 'iom2005') {
    method = 'nasem2023';
    globalThis.KR_energyEquationVersion = method;
    const methodSelect = document.getElementById('energy-method');
    if (methodSelect) methodSelect.value = method;
  }

  try {
    const result = await calcEnergyApi({
      sexe,
      age,
      poidsKg: kg,
      hauteurM: metres,
      activite: act,
      method,
    });
    globalThis.currentTDEE = Math.max(0, result.tdee);
    document.getElementById('bmr-out').textContent = String(Math.round(result.bmr));
    document.getElementById('tdee-out').textContent = String(Math.round(result.tdee));
    document.getElementById('poids-kg-out').textContent = kg.toFixed(1);
    const g = result.goals || {};
    document.getElementById('kcal-80').textContent = g.perteSevere == null ? '—' : String(Math.round(g.perteSevere));
    document.getElementById('kcal-90').textContent = g.perteLegere == null ? '—' : String(Math.round(g.perteLegere));
    document.getElementById('kcal-100').textContent = String(Math.round(g.maintien ?? result.tdee));
    document.getElementById('kcal-110').textContent = g.priseLegere == null ? '—' : String(Math.round(g.priseLegere));
    document.getElementById('kcal-120').textContent = g.priseSevere == null ? '—' : String(Math.round(g.priseSevere));
    await updateCiblesServer();
    if (typeof globalThis.krUpdateScientificScope === 'function') {
      globalThis.krUpdateScientificScope();
    }
  } catch (err) {
    notifyNutritionError(err?.message || SERVER_NUTRITION_GENERIC_ERROR);
  }
}

function readMacroInputForServer() {
  const kg = typeof globalThis.getPoidsKg === 'function' ? globalThis.getPoidsKg() : 0;
  const proteinMode = globalThis.proteinesMode || 'gkg';
  const macroMode = globalThis.macroMode || 'preset';
  const isRestDay = globalThis.activeJour === 'repos';
  return {
    tdee: globalThis.currentTDEE || 0,
    goalMultiplier: globalThis.selectedGoalMultiplier || 1,
    weightKg: kg,
    proteinMode,
    gPerKg: typeof globalThis.getProteinesParKg === 'function' ? globalThis.getProteinesParKg() : 2,
    pct: typeof globalThis.getProteinesPct === 'function' ? globalThis.getProteinesPct() : 25,
    macroMode,
    macroRatio: typeof globalThis.getMacroRatioValue === 'function'
      ? globalThis.getMacroRatioValue()
      : (document.getElementById('macro-ratio')?.value || '25,45,30'),
    customG: typeof globalThis.getMacroCustomG === 'function' ? globalThis.getMacroCustomG() : 45,
    customL: typeof globalThis.getMacroCustomL === 'function' ? globalThis.getMacroCustomL() : 30,
    isRestDay,
  };
}

async function updateCiblesServer() {
  if (!globalThis.currentTDEE) return;
  try {
    const input = readMacroInputForServer();
    const res = await calcMacrosApi(input);
    const nextTargets = res.targets || { kcal: 0, pro: 0, glu: 0, lip: 0 };
    // Deploy strip promotes `targets` to var so this updates UI + bridge together.
    globalThis.targets = nextTargets;
    const targets = nextTargets;
    if (res.percentages) {
      cacheMacroPercentages(targets, res.percentages);
      globalThis.__COACH_SERVER_TARGET_PCT = { ...res.percentages };
    }
    installServerMacroPercentageHelpers();
    const kg = input.weightKg;
    const proPerKg = kg > 0 ? (targets.pro / kg).toFixed(1) : '0';
    const ratioLabel = typeof globalThis.getMacroRatioLabel === 'function'
      ? globalThis.getMacroRatioLabel()
      : '';
    const proPct = res.percentages?.pro
      ?? (targets.kcal > 0 ? Math.round((targets.pro * 4 / targets.kcal) * 100) : 0);

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText('cible-kcal', `${targets.kcal} kcal`);
    const macrosEl = document.getElementById('cible-macros');
    if (macrosEl) {
      macrosEl.innerHTML = `${targets.pro}g Pro | ${targets.glu}g Glu | ${targets.lip}g Lip`;
    }
    setText('pro-per-kg', `${proPerKg} g/kg`);
    setText('dash-goal-label', typeof globalThis.getActiveGoalLabel === 'function'
      ? globalThis.getActiveGoalLabel()
      : '');
    setText('dash-ratio-label', String(ratioLabel).split('(')[0].trim());
    setText('macro-pro-pct', `${proPct} %`);

    await calculerBanqueServer();
    if (typeof globalThis.updateJourTabsUI === 'function') globalThis.updateJourTabsUI();
    if (typeof globalThis.updateEtatPlan === 'function') globalThis.updateEtatPlan();
    if (typeof globalThis.krUpdateScientificScope === 'function') globalThis.krUpdateScientificScope();
  } catch (err) {
    notifyNutritionError(err?.message || SERVER_NUTRITION_GENERIC_ERROR);
  }
}

let banqueDebounceTimer = null;
let banqueDebounceWaiters = [];
let banqueInflight = null;

export function applyBanqueTotalsToSummaryCards(totals) {
  const t = totals || { pro: 0, glu: 0, lip: 0, kcal: 0 };
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('gen-pro', `${t.pro} g`);
  setText('gen-glu', `${t.glu} g`);
  setText('gen-lip', `${t.lip} g`);
  setText('gen-kcal', `${t.kcal} kcal`);
}

async function calculerBanqueServer() {
  if (banqueInflight) return banqueInflight;
  banqueInflight = (async () => {
    const CATS = globalThis.CATS || ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];
    const banque = readBanqueFromUi();
    try {
      const moyennes = await ensureMoyennes();
      const totalsRes = await calcPortionsApi({ action: 'banque_totals', banque });
      const totals = totalsRes.totals || { pro: 0, glu: 0, lip: 0, kcal: 0 };
      cacheMacroPercentages(totals, totalsRes.percentages);
      syncCanonicalDayFromUi();
      const active = globalThis.activeJour || 'entrainement';
      writeCanonicalDayTotals(active, { banqueTotals: totals, percentages: totalsRes.percentages });
      installServerMacroPercentageHelpers();

      // Per-category display uses moyennes values from the server (not formula code).
      CATS.forEach((cat) => {
        const val = banque[cat] || 0;
        const m = moyennes[cat] || { p: 0, g: 0, l: 0 };
        const cPro = val * m.p;
        const cGlu = val * m.g;
        const cLip = val * m.l;
        const cKcal = Math.round(cPro * 4 + cGlu * 4 + cLip * 9);
        const details = document.getElementById(`banque-details-${cat}`);
        if (details) {
          details.innerHTML = `<span style="color:#ef4444;font-weight:600;">${cPro}g P</span> · `
            + `<span style="color:#eab308;font-weight:600;">${cGlu}g G</span> · `
            + `<span style="color:#f97316;font-weight:600;">${cLip}g L</span><br>`
            + `<strong style="color:var(--primary);font-size:1.05em;">${cKcal} kcal</strong>`;
        }
      });

      // PRIMARY: render successful banque_totals immediately — before any secondary refresh.
      applyBanqueTotalsToSummaryCards(totals);

      const targets = globalThis.targets || { pro: 0, glu: 0, lip: 0, kcal: 0 };
      if (typeof globalThis.updateDiff === 'function') {
        globalThis.updateDiff('pro', targets.pro, totals.pro);
        globalThis.updateDiff('glu', targets.glu, totals.glu);
        globalThis.updateDiff('lip', targets.lip, totals.lip);
        globalThis.updateDiff('kcal', targets.kcal, totals.kcal);
      }

      // SECONDARY: planned totals for other days must not erase valid bank cards.
      try {
        await refreshPlannedTotalsFromServer();
      } catch (secondaryErr) {
        notifyNutritionError(secondaryErr?.message || SERVER_NUTRITION_GENERIC_ERROR);
      }

      if (typeof globalThis.updateEau === 'function') globalThis.updateEau();
      if (typeof globalThis.calculerRepartition === 'function') globalThis.calculerRepartition();
      if (typeof globalThis.updateEtatPlan === 'function') globalThis.updateEtatPlan();
    } catch (err) {
      notifyNutritionError(err?.message || SERVER_NUTRITION_GENERIC_ERROR);
    } finally {
      banqueInflight = null;
    }
  })();
  return banqueInflight;
}

/** Debounce UI oninput bursts — one settle after typing, not one request per keystroke. */
function calculerBanqueFromUi() {
  return new Promise((resolve) => {
    banqueDebounceWaiters.push(resolve);
    if (banqueDebounceTimer) clearTimeout(banqueDebounceTimer);
    banqueDebounceTimer = setTimeout(() => {
      banqueDebounceTimer = null;
      const waiters = banqueDebounceWaiters;
      banqueDebounceWaiters = [];
      void calculerBanqueServer().finally(() => {
        waiters.forEach((w) => w());
      });
    }, 280);
  });
}

/**
 * Apply server auto_repartition into UI + canonical joursData, then refresh planned totals.
 * One network calc per click: auto_repartition already returns plannedTotals for the active day.
 */
async function applyAutoRepartitionServer(mode = 'classique') {
  const banque = readBanqueFromUi();
  let banqueTotal = 0;
  Object.values(banque).forEach((v) => { banqueTotal += Number(v) || 0; });
  if (banqueTotal <= 0) {
    notifyNutritionError('Remplissez d’abord la banque (Section 3) ou utilisez le calcul automatique des portions.');
    return false;
  }
  const heureEl = document.getElementById('heure-entrainement');
  const heureRaw = heureEl?.value || null;
  const res = await calcPortionsApi({
    action: 'auto_repartition',
    banque,
    mode,
    heureEntrainement: heureRaw || null,
  });
  if (!Array.isArray(res.repartition) || !res.repartition.length) {
    throw new Error(formatServerNutritionError(500, 'nutrition_service_error'));
  }
  applyRepartitionToUi(res.repartition);
  const activeKey = globalThis.activeJour || 'entrainement';
  const day = syncCanonicalDayFromUi(activeKey);
  if (day) {
    day.repartition = res.repartition.map((v) => Number(v) || 0);
    day.repartitionMode = mode;
    writeCanonicalDayTotals(activeKey, {
      banqueTotals: res.banqueTotals,
      plannedTotals: res.plannedTotals,
      percentages: res.percentages,
    });
  }
  if (res.plannedTotals) {
    if (!globalThis.__COACH_PLANNED_TOTALS) globalThis.__COACH_PLANNED_TOTALS = Object.create(null);
    globalThis.__COACH_PLANNED_TOTALS[activeKey] = { ...res.plannedTotals };
  }
  // Repos (or other day) may still need a planned_totals fetch; active day is cache-hit.
  await refreshPlannedTotalsFromServer();
  installServerMacroPercentageHelpers();
  if (typeof globalThis.calculerRepartition === 'function') globalThis.calculerRepartition();
  if (typeof globalThis.updateEtatPlan === 'function') globalThis.updateEtatPlan();
  return true;
}

let repartirInflight = null;

async function repartirAutomatiqueServer(mode) {
  if (repartirInflight) return repartirInflight;
  repartirInflight = (async () => {
    try {
      if (mode === 'entrainement') {
        if (globalThis.activeJour !== 'entrainement') {
          window.alert('Le mode « Selon entraînement » s\'applique au jour Entraînement. Basculez l\'onglet correspondant.');
          return;
        }
        if (typeof globalThis.isRepartitionSelonEntrainementActive === 'function'
          && !globalThis.isRepartitionSelonEntrainementActive()) {
          window.alert('Activez le ciblage selon l\'entraînement pour utiliser ce mode, ou utilisez « Classique » / « Équilibré ».');
          return;
        }
        if (!document.getElementById('heure-entrainement')?.value) {
          window.alert('Indiquez l\'heure d\'entraînement avant d\'appliquer cette répartition.');
          return;
        }
      }
      await applyAutoRepartitionServer(mode || 'classique');
    } catch (err) {
      notifyNutritionError(err?.message || SERVER_NUTRITION_GENERIC_ERROR);
    } finally {
      repartirInflight = null;
    }
  })();
  return repartirInflight;
}

async function suggererBanqueServer() {
  const targets = globalThis.targets || {};
  if (!targets.kcal) {
    notifyNutritionError("Veuillez d'abord compléter le profil pour obtenir des cibles caloriques.");
    return;
  }
  try {
    const res = await calcPortionsApi({ action: 'suggest', targets });
    const best = res.banque;
    if (!best) return;
    const CATS = globalThis.CATS || ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];
    CATS.forEach((cat) => {
      const el = document.querySelector(`.target-input[data-cat="${cat}"]`);
      if (el) el.value = best[cat];
    });
    await calculerBanqueServer();
    // Auto portions must also create meal repartition (canonical + UI), not banque alone.
    await applyAutoRepartitionServer('classique');
  } catch (err) {
    notifyNutritionError(err?.message || SERVER_NUTRITION_GENERIC_ERROR);
  }
}

async function telechargerGuideEquivalentsHtmlServer() {
  try {
    const meta = await calcEquivalencesApi({ category: '', limit: 1, offset: 0 });
    const cats = meta.categories || [];
    const sectionsHtml = [];
    for (const cat of cats) {
      let offset = 0;
      const rows = [];
      let total = Infinity;
      while (offset < total && offset < 500) {
        const page = await calcEquivalencesApi({
          category: cat.id,
          limit: 50,
          offset,
        });
        total = page.total;
        rows.push(...(page.results || []));
        offset += page.limit;
        if (!(page.results || []).length) break;
      }
      const tableRows = rows.map((f) => {
        const v = f.values || {};
        return `<tr><td>${escapeHtml(f.nameFr)}</td><td>${escapeHtml(f.portionFr)}</td>`
          + `<td>${fmtNum(v.prot)}</td><td>${fmtNum(v.gluc)}</td>`
          + `<td>${fmtNum(v.lip)}</td><td>${fmtNum(v.cal)}</td></tr>`;
      }).join('');
      sectionsHtml.push(
        `<h2>${escapeHtml(cat.labelFr)}</h2>`
        + '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:18px;">'
        + '<thead><tr><th>Aliment</th><th>Portion</th><th>P</th><th>G</th><th>L</th><th>kcal</th></tr></thead><tbody>'
        + tableRows + '</tbody></table>',
      );
    }
    const w = window.open('', '_blank');
    if (!w) {
      window.alert('Autorisez les pop-ups pour ouvrir le guide.');
      return;
    }
    w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Équivalents alimentaires</title>'
      + '<style>body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#111B33;} h1{color:#071B41;} table th{background:#071B41;color:#fff;}</style></head><body>'
      + '<h1>Tableau des équivalents alimentaires</h1>'
      + sectionsHtml.join('') + '</body></html>');
    w.document.close();
  } catch (err) {
    notifyNutritionError(err?.message || SERVER_NUTRITION_GENERIC_ERROR);
  }
}

async function genererPlanTextuelServer() {
  installServerMacroPercentageHelpers();
  try {
    await ensureMoyennes();
    if (globalThis.currentTDEE) await updateCiblesServer();
    else await refreshPlannedTotalsFromServer();
    // Prefer preset ratio label from UI; fall back to server target percentages.
    const originalGetClientLabel = globalThis.getClientMacroDistributionLabel;
    if (typeof originalGetClientLabel === 'function') {
      globalThis.getClientMacroDistributionLabel = function safeMacroLabel(snapshot) {
        try {
          return originalGetClientLabel(snapshot);
        } catch {
          const pct = globalThis.__COACH_SERVER_TARGET_PCT;
          if (pct && globalThis.pdfLang === 'en') {
            return `${pct.pro}% protein · ${pct.glu}% carbs · ${pct.lip}% fat`;
          }
          if (pct) {
            return `${pct.pro} % protéines · ${pct.glu} % glucides · ${pct.lip} % lipides`;
          }
          if (typeof globalThis.getMacroRatioLabel === 'function') {
            return String(globalThis.getMacroRatioLabel() || '—');
          }
          return '—';
        }
      };
    }
    const legacy = globalThis.__coachGenererPlanTextuelLegacy;
    if (typeof legacy === 'function') {
      legacy.call(globalThis);
    }
  } catch (err) {
    notifyNutritionError(err?.message || SERVER_NUTRITION_GENERIC_ERROR);
  }
}

async function exporterPDFServer() {
  const btn = document.getElementById('btn-export-pdf');
  const btnLabel = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Génération PDF...';
  }
  try {
    installServerMacroPercentageHelpers();
    // Plan textarea is UX-only — never block PDF on client plan text generation.
    if (!document.getElementById('output-plan')?.value?.trim()) {
      try {
        await genererPlanTextuelServer();
      } catch {
        // PDF payload does not require the text plan.
      }
    }
    const prepare = globalThis.__coachPrepareServerPdfDays;
    if (typeof prepare !== 'function') {
      throw new Error('PDF state collector unavailable');
    }
    syncCanonicalDayFromUi();
    await refreshPlannedTotalsFromServer();
    const prepared = prepare();
    const ctx = globalThis.COACH_WORKSPACE_CONTEXT
      || globalThis.__COACH_WORKSPACE_CONTEXT__
      || {};
    if (!ctx.clientId || !ctx.organizationSlug) {
      throw new Error('Workspace context missing');
    }
    const macroBase = readMacroInputForServer();
    const [trainingMacros, restMacros] = await Promise.all([
      calcMacrosApi({ ...macroBase, isRestDay: false }),
      prepared.include_rest
        ? calcMacrosApi({ ...macroBase, isRestDay: true })
        : Promise.resolve(null),
    ]);
    const training = {
      ...prepared.training,
      targets: trainingMacros.targets || { kcal: 0, pro: 0, glu: 0, lip: 0 },
    };
    const rest = prepared.include_rest && prepared.rest
      ? {
        ...prepared.rest,
        targets: restMacros?.targets || { kcal: 0, pro: 0, glu: 0, lip: 0 },
      }
      : null;
    // Client-side coherence gate (same invariants as server assertPlanReadyForPdf).
    const hasRep = (day) => Array.isArray(day?.repartition) && day.repartition.some((v) => Number(v) > 0);
    const hasBanque = (day) => day?.banque && Object.values(day.banque).some((v) => Number(v) > 0);
    const plannedKcal = Number(globalThis.joursData?.entrainement?.plannedTotals?.kcal) || 0;
    if ((hasBanque(training) || Number(training.targets?.kcal) > 0) && !hasRep(training)) {
      throw new Error(
        'Le plan alimentaire n’est pas prêt. Générez ou complétez la répartition des portions avant d’exporter le PDF.',
      );
    }
    if (hasRep(training) && plannedKcal === 0 && hasBanque(training)) {
      throw new Error(
        'Le plan alimentaire est incomplet ou incohérent. Vérifiez les portions et les totaux, puis réessayez.',
      );
    }
    const pdfBrand = globalThis.pdfCreator === 'elevate' ? 'elevate' : 'kr';
    const { blob, filename } = await generatePdfApi({
      organization_id: ctx.organizationId || undefined,
      organization_slug: ctx.organizationSlug,
      client_id: ctx.clientId,
      locale: prepared.locale,
      athlete_name: prepared.athlete_name,
      goal_label: prepared.goal_label,
      macro_ratio_label: prepared.macro_ratio_label,
      coach_notes: prepared.coach_notes,
      goal_multiplier: prepared.goal_multiplier,
      include_rest: prepared.include_rest,
      pdf_brand: pdfBrand,
      training,
      rest,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'Plan.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  } catch (err) {
    window.alert(err?.message || SERVER_PDF_GENERIC_ERROR);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  }
}

/**
 * Install bridge overrides. Safe no-op when feature flag is explicitly off.
 */
export function installServerNutritionBridge() {
  if (!featureOn()) return { installed: false };

  globalThis.COACH_SERVER_NUTRITION = Object.freeze({
    enabled: true,
    searchFoodsApi,
    foodDetailApi,
    calcEnergyApi,
    calcMacrosApi,
    calcPortionsApi,
    calcEquivalencesApi,
    generatePdfApi,
  });

  installServerMacroPercentageHelpers();

  globalThis.chargerCoachData = chargerCoachDataServer;
  globalThis.filtrerGuideEquivalents = () => { void filtrerGuideEquivalentsServer(); };
  // Return promises so workspace bootstrap can await settle before markClean.
  globalThis.calculerBesoins = () => calculerBesoinsServer();
  globalThis.updateCibles = () => updateCiblesServer();
  // UI oninput → debounced; programmatic callers (updateCibles / suggest) use immediate path.
  globalThis.calculerBanque = () => calculerBanqueFromUi();
  globalThis.__coachCalculerBanqueImmediate = () => calculerBanqueServer();
  globalThis.suggererBanque = () => suggererBanqueServer();
  globalThis.repartirAutomatique = (mode) => repartirAutomatiqueServer(mode);
  globalThis.telechargerGuideEquivalentsHtml = () => { void telechargerGuideEquivalentsHtmlServer(); };
  globalThis.exporterPDF = () => exporterPDFServer();

  // Preserve dual-brand / inline plan generator, then wrap so buttons never hit disabled engine.
  if (typeof globalThis.genererPlanTextuel === 'function'
    && globalThis.genererPlanTextuel !== genererPlanTextuelServer
    && !globalThis.__coachGenererPlanTextuelLegacy) {
    globalThis.__coachGenererPlanTextuelLegacy = globalThis.genererPlanTextuel;
  }
  globalThis.genererPlanTextuel = () => genererPlanTextuelServer();

  // Prevent legacy full-bank fetch if anything still points at it.
  if (!globalThis.__COACH_BLOCK_FULL_BANK_FETCH__) {
    globalThis.__COACH_BLOCK_FULL_BANK_FETCH__ = true;
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const url = String(input?.url || input || '');
      if (url.includes('/api/coach-data') || /coach-data\.json(?:\?|$)/.test(url)) {
        throw new Error('Full food bank fetch blocked in server nutrition path');
      }
      return originalFetch(input, init);
    };
  }

  return { installed: true };
}

// Install as soon as the module evaluates so DOMContentLoaded uses server overrides.
if (typeof document !== 'undefined' && featureOn()) {
  installServerNutritionBridge();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Re-assert overrides after late inline scripts (KR science block).
      installServerNutritionBridge();
    }, { once: true });
  }
}
