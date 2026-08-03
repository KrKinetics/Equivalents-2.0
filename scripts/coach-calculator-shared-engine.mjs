/**
 * Lot 5 Option A — inject shared pure calculation runtime into Coach HTML
 * and route identical UI helpers through it.
 *
 * Scope: kcalFromMacros, macroPercentagesFromGrams, getPortionTotals,
 * computePlannedTotalsFromRepartition (getJourSnapshot totals), isJourClientPlanConfigured.
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
 * Extra domain symbols may exist in the closure; only Option A is exported.
 */
export function buildSharedEngineRuntime() {
  const files = [
    'src/coach/domain/plan-structure.mjs',
    'src/coach/calculations/macros.mjs',
    'src/coach/domain/clients.mjs',
    'src/coach/domain/plans.mjs',
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
  isJourClientPlanConfigured: isJourClientPlanConfigured
};
})(window);
</script>`;
}

/** Inject runtime early (before client-fixes / dual-brand scripts). */
export function injectSharedEngineRuntime(html) {
  if (html.includes('id="coach-shared-engine"')) return html;
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) throw new Error('Cannot inject shared engine runtime');
  return `${html.slice(0, bodyClose)}${buildSharedEngineRuntime()}\n${html.slice(bodyClose)}`;
}

/** Replace Option A local copies after other patches have been applied. */
export function applySharedEnginePatches(html) {
  if (!html.includes('id="coach-shared-engine"')) {
    html = injectSharedEngineRuntime(html);
  }

  html = mustReplace(
    html,
    rx(`function kcalFromMacros\\(pro, glu, lip\\) \\{\n    return Math\\.round\\(pro \\* 4 \\+ glu \\* 4 \\+ lip \\* 9\\);\n\\}`),
    `function kcalFromMacros(pro, glu, lip) {
    return window.CoachSharedEngine.kcalFromMacros(pro, glu, lip);
}`,
    'kcalFromMacros',
  );

  html = mustReplace(
    html,
    rx(`function macroPercentagesFromGrams\\(pro, glu, lip\\) \\{\n    const total = kcalFromMacros\\(pro \\|\\| 0, glu \\|\\| 0, lip \\|\\| 0\\);\n    if \\(!total\\) return \\{ pro: 0, glu: 0, lip: 0 \\};\n    const proPct = Math\\.round\\(\\(\\(pro \\|\\| 0\\) \\* 4 / total\\) \\* 100\\);\n    const gluPct = Math\\.round\\(\\(\\(glu \\|\\| 0\\) \\* 4 / total\\) \\* 100\\);\n    return \\{ pro: proPct, glu: gluPct, lip: Math\\.max\\(0, 100 - proPct - gluPct\\) \\};\n\\}`),
    `function macroPercentagesFromGrams(pro, glu, lip) {
    return window.CoachSharedEngine.macroPercentagesFromGrams(pro, glu, lip);
}`,
    'macroPercentagesFromGrams base',
  );

  html = mustReplace(
    html,
    rx(`function getPortionTotals\\(portions\\) \\{\n    let pro = 0, glu = 0, lip = 0;\n    CATS\\.forEach\\(cat => \\{\n        const v = portions\\[cat\\] \\|\\| 0;\n        pro \\+= v \\* MOYENNES\\[cat\\]\\.p;\n        glu \\+= v \\* MOYENNES\\[cat\\]\\.g;\n        lip \\+= v \\* MOYENNES\\[cat\\]\\.l;\n    \\}\\);\n    return \\{ pro, glu, lip, kcal: kcalFromMacros\\(pro, glu, lip\\) \\};\n\\}`),
    `function getPortionTotals(portions) {
    return window.CoachSharedEngine.getPortionTotals(portions);
}`,
    'getPortionTotals',
  );

  // getJourSnapshot: keep DOM/HTML meal loop; source day totals from shared engine.
  html = mustReplace(
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
            if (i < 3) portionsLeft += mealHTML; else portionsRight += mealHTML;
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
    'getJourSnapshot planned totals',
  );

  if (!html.includes('CoachSharedEngine.kcalFromMacros')) {
    throw new Error('Shared engine wiring incomplete: kcalFromMacros');
  }
  if (!html.includes('CoachSharedEngine.getPortionTotals')) {
    throw new Error('Shared engine wiring incomplete: getPortionTotals');
  }
  if (!html.includes('CoachSharedEngine.computePlannedTotalsFromRepartition')) {
    throw new Error('Shared engine wiring incomplete: planned totals');
  }
  if (!html.includes('CoachSharedEngine.isJourClientPlanConfigured')) {
    throw new Error('Shared engine wiring incomplete: isJourClientPlanConfigured');
  }
  if (!html.includes('CoachSharedEngine.macroPercentagesFromGrams')) {
    throw new Error('Shared engine wiring incomplete: macroPercentagesFromGrams');
  }
  // Dual-brand product forks must remain (Option A boundary).
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
