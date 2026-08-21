/**
 * Inject shared pure calculation runtime into Coach HTML and route exact-parity
 * UI helpers through it.
 *
 * Does NOT touch dual-brand banque totals, completeness, or reconcile paths.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mustReplace(html, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (!html.includes(pattern)) {
      throw new Error(`Shared engine patch missing target: ${label}`);
    }
    return html.replace(pattern, replacement);
  }
  if (!pattern.test(html)) {
    throw new Error(`Shared engine patch missing target: ${label}`);
  }
  return html.replace(pattern, replacement);
}

function replaceIfLegacy(html, pattern, replacement) {
  if (typeof pattern === 'string') {
    return html.includes(pattern) ? html.replace(pattern, replacement) : html;
  }
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function rx(source) {
  return new RegExp(source.replace(/\n/g, '\\r?\\n'));
}

function stripModuleSource(source) {
  return source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+/gm, '');
}

/**
 * Browser runtime built from the same src/coach modules (no formula edits).
 */
export function buildSharedEngineRuntime() {
  const files = [
    'src/coach/domain/plan-structure.mjs',
    'src/coach/calculations/macros.mjs',
    'src/coach/domain/clients.mjs',
    'src/coach/domain/plans.mjs',
    'src/coach/calculations/portions.mjs',
  ];
  const body = files
    .map((rel) => stripModuleSource(fs.readFileSync(path.join(root, rel), 'utf8')))
    .join('\n');

  return `<script id="coach-shared-engine">
(function (global) {
${body}
global.CoachSharedEngine = {
  kcalFromMacros: kcalFromMacros,
  macroPercentagesFromGrams: macroPercentagesFromGrams,
  getPortionTotals: getPortionTotals,
  computePlannedTotalsFromRepartition: computePlannedTotalsFromRepartition,
  isJourClientPlanConfigured: isJourClientPlanConfigured,
  createEmptyJourData: createEmptyJourData,
  migrateProfilData: migrateProfilData,
  normalizeLegacyRepartition: normalizeLegacyRepartition,
  normalizeProteinesPct: normalizeProteinesPct,
  normalizeMacroPct: normalizeMacroPct,
  roundHalf: roundHalf,
  distribuerPortions: distribuerPortions,
  scorePortions: scorePortions,
  suggestBanque: suggestBanque
};
})(window);
</script>`;
}

/** Inject runtime early (before client-fixes / dual-brand scripts). */
export function injectSharedEngineRuntime(html) {
  if (html.includes('id="coach-shared-engine"')) {
    // Rebuild runtime body when regenerating index (portions module may be new).
    return html.replace(
      /<script id="coach-shared-engine">[\s\S]*?<\/script>/,
      buildSharedEngineRuntime(),
    );
  }
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) throw new Error('Cannot inject shared engine runtime');
  return `${html.slice(0, bodyClose)}${buildSharedEngineRuntime()}\n${html.slice(bodyClose)}`;
}

/** Replace exact-parity local copies after other patches have been applied. */
export function applySharedEnginePatches(html) {
  html = injectSharedEngineRuntime(html);

  html = replaceIfLegacy(
    html,
    rx(`function kcalFromMacros\\(pro, glu, lip\\) \\{\n    return Math\\.round\\(pro \\* 4 \\+ glu \\* 4 \\+ lip \\* 9\\);\n\\}`),
    `function kcalFromMacros(pro, glu, lip) {
    return window.CoachSharedEngine.kcalFromMacros(pro, glu, lip);
}`,
  );

  html = replaceIfLegacy(
    html,
    rx(`function macroPercentagesFromGrams\\(pro, glu, lip\\) \\{\n    const total = kcalFromMacros\\(pro \\|\\| 0, glu \\|\\| 0, lip \\|\\| 0\\);\n    if \\(!total\\) return \\{ pro: 0, glu: 0, lip: 0 \\};\n    const proPct = Math\\.round\\(\\(\\(pro \\|\\| 0\\) \\* 4 / total\\) \\* 100\\);\n    const gluPct = Math\\.round\\(\\(\\(glu \\|\\| 0\\) \\* 4 / total\\) \\* 100\\);\n    return \\{ pro: proPct, glu: gluPct, lip: Math\\.max\\(0, 100 - proPct - gluPct\\) \\};\n\\}`),
    `function macroPercentagesFromGrams(pro, glu, lip) {
    return window.CoachSharedEngine.macroPercentagesFromGrams(pro, glu, lip);
}`,
  );

  html = replaceIfLegacy(
    html,
    rx(`function getPortionTotals\\(portions\\) \\{\n    let pro = 0, glu = 0, lip = 0;\n    CATS\\.forEach\\(cat => \\{\n        const v = portions\\[cat\\] \\|\\| 0;\n        pro \\+= v \\* MOYENNES\\[cat\\]\\.p;\n        glu \\+= v \\* MOYENNES\\[cat\\]\\.g;\n        lip \\+= v \\* MOYENNES\\[cat\\]\\.l;\n    \\}\\);\n    return \\{ pro, glu, lip, kcal: kcalFromMacros\\(pro, glu, lip\\) \\};\n\\}`),
    `function getPortionTotals(portions) {
    return window.CoachSharedEngine.getPortionTotals(portions);
}`,
  );

  // getJourSnapshot planned totals — only if still using local aggregation
  // Normalize the seven-meal column split so the legacy aggregation matcher
  // below can still replace the whole block with the shared engine version.
  html = html.replace(
    'if (i < Math.ceil(MEAL_COUNT / 2)) portionsLeft += mealHTML; else portionsRight += mealHTML;',
    'if (i < 3) portionsLeft += mealHTML; else portionsRight += mealHTML;',
  );
  html = replaceIfLegacy(
    html,
    rx(`let portionsLeft = '', portionsRight = '', recapRowsHTML = '';\n    let totalPro = 0, totalGlu = 0, totalLip = 0;\n\n    for \\(let i = 0; i < MEAL_COUNT; i\\+\\+\\) \\{\n        let rPro = 0, rGlu = 0, rLip = 0, portionsLigne = '';\n        CATS\\.forEach\\(cat => \\{\n            const val = getRepValueFromData\\(jourData\\.repartition, i, cat\\);\n            rPro \\+= val \\* MOYENNES\\[cat\\]\\.p;\n            rGlu \\+= val \\* MOYENNES\\[cat\\]\\.g;\n            rLip \\+= val \\* MOYENNES\\[cat\\]\\.l;\n            if \\(val > 0\\) portionsLigne \\+= '<li>' \\+ val \\+ ' portion\\(s\\) — ' \\+ NOMS_CATEGORIES\\[cat\\] \\+ '</li>';\n        \\}\\);\n        const rKcal = kcalFromMacros\\(rPro, rGlu, rLip\\);\n        rPro = Math\\.round\\(rPro\\); rGlu = Math\\.round\\(rGlu\\); rLip = Math\\.round\\(rLip\\);\n        if \\(portionsLigne\\) \\{\n            let mealHTML = '<div class="meal-box">';\n            mealHTML \\+= '<div class="meal-title">' \\+ REPAS_EMOJI\\[i\\] \\+ ' ' \\+ REPAS_LABELS\\[i\\] \\+ getMealTimingLabelForSnapshot\\(timing, i\\) \\+ '</div>';\n            mealHTML \\+= '<ul class="meal-list">' \\+ portionsLigne \\+ '</ul></div>';\n            if \\(i < 3\\) portionsLeft \\+= mealHTML; else portionsRight \\+= mealHTML;\n        \\}\n        if \\(rKcal > 0\\) \\{\n            recapRowsHTML \\+= '<tr class="' \\+ \\(i % 2 === 0 \\? 'recap-row-even' : 'recap-row-odd'\\) \\+ '">';\n            recapRowsHTML \\+= '<td class="left">' \\+ REPAS_EMOJI\\[i\\] \\+ ' ' \\+ REPAS_LABELS\\[i\\] \\+ '</td>';\n            recapRowsHTML \\+= '<td>' \\+ rPro \\+ ' g</td><td>' \\+ rGlu \\+ ' g</td><td>' \\+ rLip \\+ ' g</td>';\n            recapRowsHTML \\+= '<td class="kcal">' \\+ rKcal \\+ ' kcal</td></tr>';\n            totalPro \\+= rPro; totalGlu \\+= rGlu; totalLip \\+= rLip;\n        \\}\n    \\}\n    const totalKcal = kcalFromMacros\\(totalPro, totalGlu, totalLip\\);`),
    `let portionsLeft = '', portionsRight = '', recapRowsHTML = '';

    for (let i = 0; i < MEAL_COUNT; i++) {
        let rPro = 0, rGlu = 0, rLip = 0, portionsLigne = '';
        CATS.forEach(cat => {
            const val = getRepValueFromData(jourData.repartition, i, cat);
            rPro += val * MOYENNES[cat].p;
            rGlu += val * MOYENNES[cat].g;
            rLip += val * MOYENNES[cat].l;
            if (val > 0) portionsLigne += '<li>' + val + ' portion(s) — ' + NOMS_CATEGORIES[cat] + '</li>';
        });
        const rKcal = kcalFromMacros(rPro, rGlu, rLip);
        rPro = Math.round(rPro); rGlu = Math.round(rGlu); rLip = Math.round(rLip);
        if (portionsLigne) {
            let mealHTML = '<div class="meal-box">';
            mealHTML += '<div class="meal-title">' + REPAS_EMOJI[i] + ' ' + REPAS_LABELS[i] + getMealTimingLabelForSnapshot(timing, i) + '</div>';
            mealHTML += '<ul class="meal-list">' + portionsLigne + '</ul></div>';
            if (i < Math.ceil(MEAL_COUNT / 2)) portionsLeft += mealHTML; else portionsRight += mealHTML;
        }
        if (rKcal > 0) {
            recapRowsHTML += '<tr class="' + (i % 2 === 0 ? 'recap-row-even' : 'recap-row-odd') + '">';
            recapRowsHTML += '<td class="left">' + REPAS_EMOJI[i] + ' ' + REPAS_LABELS[i] + '</td>';
            recapRowsHTML += '<td>' + rPro + ' g</td><td>' + rGlu + ' g</td><td>' + rLip + ' g</td>';
            recapRowsHTML += '<td class="kcal">' + rKcal + ' kcal</td></tr>';
        }
    }
    const plannedTotals = window.CoachSharedEngine.computePlannedTotalsFromRepartition(jourData.repartition);
    const totalPro = plannedTotals.pro, totalGlu = plannedTotals.glu, totalLip = plannedTotals.lip;
    const totalKcal = plannedTotals.kcal;`,
  );

  html = mustReplace(
    html,
    rx(`function createEmptyJourData\\(\\) \\{\n    const banque = \\{\\}, repartition = \\{\\};\n    CATS\\.forEach\\(cat => \\{ banque\\[cat\\] = '0'; \\}\\);\n    for \\(let i = 0; i < MEAL_COUNT \\* CATS\\.length; i\\+\\+\\) repartition\\[i\\] = '0';\n    return \\{\n        banque, repartition,\n        heureEntrainement: '17:30',\n        repartitionSelonEntrainement: true,\n        eauLitres: '0', eauAjout: '0', eauManuel: false\n    \\};\n\\}`),
    `function createEmptyJourData() {
    return window.CoachSharedEngine.createEmptyJourData();
}`,
    'createEmptyJourData',
  );

  // Prefer engine migrate (legacy object → canonical Array) when a local copy remains.
  html = replaceIfLegacy(
    html,
    /function migrateProfilData\(data\) \{[\s\S]*?\nfunction evaluerJourData\(/,
    `function migrateProfilData(data) {
    return window.CoachSharedEngine.migrateProfilData(data);
}

function evaluerJourData(`,
  );

  // Keep canonical Array repartition across profile apply (never re-spread into {}).
  html = replaceIfLegacy(
    html,
    `repartition: { ...entBase.repartition, ...migrated.jours.entrainement.repartition }
    };
    joursData.repos = {
        ...repBase, ...migrated.jours.repos,
        banque: { ...repBase.banque, ...migrated.jours.repos.banque },
        repartition: { ...repBase.repartition, ...(migrated.jours.repos.repartition || {}) }
    };`,
    `repartition: Array.isArray(migrated.jours.entrainement.repartition)
            ? migrated.jours.entrainement.repartition.slice()
            : (migrated.jours.entrainement.repartition ?? entBase.repartition)
    };
    joursData.repos = {
        ...repBase, ...migrated.jours.repos,
        banque: { ...repBase.banque, ...migrated.jours.repos.banque },
        repartition: Array.isArray(migrated.jours.repos.repartition)
            ? migrated.jours.repos.repartition.slice()
            : (migrated.jours.repos.repartition ?? repBase.repartition)
    };`,
  );

  html = mustReplace(
    html,
    rx(`function normalizeProteinesPct\\(value\\) \\{\n    const n = parseFloat\\(value\\);\n    if \\(isNaN\\(n\\)\\) return DEFAULT_PROTEIN_PCT;\n    return Math\\.min\\(MAX_PROTEIN_PCT, Math\\.max\\(MIN_PROTEIN_PCT, Math\\.round\\(n\\)\\)\\);\n\\}`),
    `function normalizeProteinesPct(value) {
    return window.CoachSharedEngine.normalizeProteinesPct(value);
}`,
    'normalizeProteinesPct',
  );

  html = mustReplace(
    html,
    rx(`function normalizeMacroPct\\(value\\) \\{\n    const n = parseFloat\\(value\\);\n    if \\(isNaN\\(n\\)\\) return DEFAULT_MACRO_CUSTOM_G;\n    return Math\\.min\\(MAX_MACRO_PCT, Math\\.max\\(MIN_MACRO_PCT, Math\\.round\\(n\\)\\)\\);\n\\}`),
    `function normalizeMacroPct(value) {
    return window.CoachSharedEngine.normalizeMacroPct(value);
}`,
    'normalizeMacroPct',
  );

  html = mustReplace(
    html,
    rx(`function roundHalf\\(n\\) \\{\n    return Math\\.max\\(0, Math\\.round\\(n \\* 2\\) / 2\\);\n\\}`),
    `function roundHalf(n) {
    return window.CoachSharedEngine.roundHalf(n);
}`,
    'roundHalf',
  );

  html = mustReplace(
    html,
    rx(`function scorePortions\\(portions\\) \\{\n    const t = getPortionTotals\\(portions\\);\n    const tol = \\{ pro: 5, glu: 5, lip: 5, kcal: 50 \\};\n    let score = Math\\.abs\\(t\\.pro - targets\\.pro\\) \\+ Math\\.abs\\(t\\.glu - targets\\.glu\\) \\+ Math\\.abs\\(t\\.lip - targets\\.lip\\);\n    score \\+= Math\\.abs\\(t\\.kcal - targets\\.kcal\\) \\* 0\\.1;\n    if \\(Math\\.abs\\(t\\.pro - targets\\.pro\\) > tol\\.pro\\) score \\+= 20;\n    if \\(Math\\.abs\\(t\\.glu - targets\\.glu\\) > tol\\.glu\\) score \\+= 20;\n    if \\(Math\\.abs\\(t\\.lip - targets\\.lip\\) > tol\\.lip\\) score \\+= 20;\n    if \\(Math\\.abs\\(t\\.kcal - targets\\.kcal\\) > tol\\.kcal\\) score \\+= 30;\n    return score;\n\\}`),
    `function scorePortions(portions) {
    return window.CoachSharedEngine.scorePortions(portions, targets);
}`,
    'scorePortions',
  );

  html = mustReplace(
    html,
    /function suggererBanque\(\) \{[\s\S]*?\nfunction resetBanque\(/,
    `function suggererBanque() {
    if (targets.kcal === 0) { alert("Veuillez d'abord compléter le profil pour obtenir des cibles caloriques."); return; }
    const best = window.CoachSharedEngine.suggestBanque(targets);
    if (!best) return;
    CATS.forEach(cat => {
        document.querySelector('.target-input[data-cat="' + cat + '"]').value = best[cat];
    });
    calculerBanque();
}

function resetBanque(`,
    'suggererBanque',
  );

  html = mustReplace(
    html,
    rx(`function distribuerPortions\\(total, weights\\) \\{\n    if \\(total <= 0\\) return new Array\\(MEAL_COUNT\\)\\.fill\\(0\\);\n    const raw = weights\\.map\\(w => total \\* w\\);\n    const portions = raw\\.map\\(v => Math\\.floor\\(v \\* 2\\) / 2\\);\n    let remain = Math\\.round\\(\\(total - portions\\.reduce\\(\\(a, b\\) => a \\+ b, 0\\)\\) \\* 2\\) / 2;\n    const order = raw\\.map\\(\\(v, i\\) => \\(\\{ i, frac: v - portions\\[i\\] \\}\\)\\)\n        \\.sort\\(\\(a, b\\) => b\\.frac - a\\.frac \\|\\| b\\.i - a\\.i\\);\n    let step = 0;\n    while \\(remain >= 0\\.5 && step < 24\\) \\{\n        portions\\[order\\[step % MEAL_COUNT\\]\\.i\\] \\+= 0\\.5;\n        remain -= 0\\.5;\n        step\\+\\+;\n    \\}\n    return portions;\n\\}`),
    `function distribuerPortions(total, weights) {
    return window.CoachSharedEngine.distribuerPortions(total, weights);
}`,
    'distribuerPortions',
  );

  const required = [
    'CoachSharedEngine.kcalFromMacros',
    'CoachSharedEngine.getPortionTotals',
    'CoachSharedEngine.computePlannedTotalsFromRepartition',
    'CoachSharedEngine.isJourClientPlanConfigured',
    'CoachSharedEngine.macroPercentagesFromGrams',
    'CoachSharedEngine.createEmptyJourData',
    'CoachSharedEngine.migrateProfilData',
    'CoachSharedEngine.normalizeProteinesPct',
    'CoachSharedEngine.normalizeMacroPct',
    'CoachSharedEngine.roundHalf',
    'CoachSharedEngine.scorePortions',
    'CoachSharedEngine.suggestBanque',
    'CoachSharedEngine.distribuerPortions',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`Shared engine wiring incomplete: ${marker}`);
    }
  }
  if (!html.includes('computeBanqueTotalsFromData = function')) {
    throw new Error('Dual-brand banque totals override missing after shared-engine patch');
  }
  if (!html.includes('withinCoachTolerance') || !html.includes('evaluerJourData = function')) {
    throw new Error('Dual-brand completeness override missing after shared-engine patch');
  }
  if (!html.includes('reconcilePlanTotalsFromSnapshot = function')) {
    throw new Error('Dual-brand reconcile override missing after shared-engine patch');
  }
  return html;
}
