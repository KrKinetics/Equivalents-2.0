/**
 * Audit food-equivalents.json and produce HTML / CSV / JSON reports.
 * Does NOT correct nutrient values.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateAllGroupStatistics } from '../src/lib/group-statistics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const GROUPS_PATH = path.join(ROOT, 'src', 'data', 'calculation-groups.json');
const VERSION_PATH = path.join(ROOT, 'src', 'data', 'nutrition-data-version.json');
const REPORTS_DIR = path.join(ROOT, 'reports');

const CALCULATOR_MOYENNES = {
  protein: { p: 9, g: 0, l: 2, note: 'calculator pro / portion' },
  starch: { p: 3, g: 18, l: 1, note: 'calculator fec' },
  vegetable: { p: 2, g: 7, l: 0, note: 'calculator leg' },
  fruit: { p: 1, g: 15, l: 2, note: 'calculator fru' },
  dairy: { p: 7, g: 10, l: 2, note: 'calculator lai' },
  fat: { p: 1, g: 2, l: 6, note: 'calculator lip' },
  whey: { p: 22, g: 2, l: 2, note: 'calculator whey = 1 scoop' },
};

const SUSPECT_CASES = [
  {
    idHint: 'chicken-breast',
    match: /poitrine de poulet|chicken breast/i,
    reason: 'Suspect: 48 kcal, 8 g protein, 7 g fat (Atwater ~99 kcal)',
  },
  {
    idHint: 'egg-whites',
    match: /blancs d['’]œuf|egg whites/i,
    reason: 'Suspect: 36 kcal, 2.5 g protein, 1 g carbs (protein unrealistically low)',
  },
  {
    idHint: 'greek-yogurt-100ml',
    match: /yogourt grec \(100 g\)|greek yogurt \(100 g\)/i,
    reason: 'Suspect: 67 kcal, 1 g protein, 3 g carbs, 0 g fat',
  },
  {
    idHint: 'sweet-potato',
    match: /pomme de terre.*douce|sweet potato/i,
    reason: 'Suspect: 82 kcal, 3 g protein, 1 g carbs',
  },
  {
    idHint: 'quinoa',
    match: /quinoa/i,
    reason: 'Suspect: 116 kcal, 8 g protein, 1 g carbs',
  },
  {
    idHint: 'whey',
    match: /lactos[eé]rum|\bwhey\b/i,
    reason: 'Suspect: guide ½ scoop ≈ 9 g protein vs calculator 1 scoop = 22 g protein',
  },
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function calculatedKcal(n) {
  const p = n.proteinG;
  const c = n.carbsG;
  const f = n.fatG;
  if ([p, c, f].some((v) => v == null || !Number.isFinite(v))) return null;
  return p * 4 + c * 4 + f * 9;
}

function fatFromComponents(n) {
  const parts = [n.saturatedFatG, n.polyunsaturatedFatG, n.monounsaturatedFatG];
  if (parts.every((v) => v == null)) return null;
  return parts.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function auditFood(food, idCounts) {
  const alerts = [];
  const n = food.nutrients || {};
  const portion = food.portion || {};
  const names = food.names || {};

  const push = (severity, code, message) => alerts.push({ severity, code, message });

  if (!food.id) push('ERROR', 'MISSING_ID', 'Identifiant manquant');
  if ((idCounts.get(food.id) || 0) > 1) push('ERROR', 'DUPLICATE_ID', `Identifiant dupliqué: ${food.id}`);

  if (!names.fr) push('ERROR', 'MISSING_FR_NAME', 'Nom français absent');
  if (!names.en) push('ERROR', 'MISSING_EN_NAME', 'Nom anglais / version EN absente');
  if (!portion.labelFr) push('ERROR', 'MISSING_PORTION_FR', 'Portion française absente');
  if (!portion.labelEn) push('ERROR', 'MISSING_PORTION_EN', 'Portion anglaise absente');
  if (portion.amount == null || !portion.unit) {
    push('ERROR', 'MISSING_AMOUNT_UNIT', 'Quantité ou unité absente');
  }

  for (const [key, label] of [
    ['proteinG', 'protéines'],
    ['carbsG', 'glucides'],
    ['declaredKcal', 'calories déclarées'],
  ]) {
    if (n[key] == null) push('ERROR', 'MISSING_REQUIRED', `${label} manquante(s)`);
    else if (n[key] < 0) push('ERROR', 'NEGATIVE_VALUE', `${label} négative(s)`);
  }

  if (n.fatG == null) push('ERROR', 'MISSING_TOTAL_FAT', 'Lipides totaux absents');
  else if (n.fatG < 0) push('ERROR', 'NEGATIVE_VALUE', 'Lipides totaux négatifs');

  if (n.fiberG != null && n.fiberG < 0) push('ERROR', 'NEGATIVE_VALUE', 'Fibres négatives');

  const scoopWithoutGrams =
    String(portion.unit).toLowerCase() === 'scoop' &&
    (portion.grams == null || !Number.isFinite(portion.grams));
  if (scoopWithoutGrams) {
    push('ERROR', 'SCOOP_WITHOUT_GRAMS', 'Scoop utilisé sans poids en grammes');
  }

  // FR/EN nutrient parity is structural for this import (single nutrient object).
  // Flag portion label inconsistency when amounts look divergent in labels.
  if (portion.labelFr && portion.labelEn) {
    const frHasG = /\d+[.,]?\d*\s*g/i.test(portion.labelFr);
    const enHasG = /\d+[.,]?\d*\s*g/i.test(portion.labelEn);
    const frMl = portion.labelFr.match(/(\d+[.,]?\d*)\s*ml/i);
    const enMl = portion.labelEn.match(/(\d+[.,]?\d*)\s*ml/i);
    if (frMl && enMl && Number(frMl[1].replace(',', '.')) !== Number(enMl[1].replace(',', '.'))) {
      push('WARNING', 'PORTION_FR_EN_DIFF', 'Portion ml différente entre FR et EN');
    }
    if (frHasG !== enHasG) {
      push('WARNING', 'PORTION_FR_EN_DIFF', 'Indication de poids présente dans une seule langue');
    }
  }

  const calc = calculatedKcal(n);
  const declared = n.declaredKcal;
  let absDiff = null;
  let pctDiff = null;
  if (calc != null && declared != null) {
    absDiff = Math.abs(declared - calc);
    pctDiff = calc === 0 ? (declared === 0 ? 0 : 100) : (absDiff / Math.abs(calc)) * 100;
    if (absDiff > 15 || pctDiff > 20) {
      push(
        'ERROR',
        'KCAL_DIFF_HIGH',
        `Différence calorique élevée: déclaré ${declared} vs Atwater ${calc.toFixed(1)} (Δ ${absDiff.toFixed(1)} / ${pctDiff.toFixed(1)}%)`
      );
    } else if (pctDiff >= 10) {
      push(
        'WARNING',
        'KCAL_DIFF_MODERATE',
        `Différence calorique modérée: déclaré ${declared} vs Atwater ${calc.toFixed(1)} (${pctDiff.toFixed(1)}%)`
      );
    }
  } else if (declared != null && n.fatG == null) {
    // Try Atwater with component fat for informational warning only
    const componentFat = fatFromComponents(n);
    if (componentFat != null) {
      const calc2 = n.proteinG * 4 + n.carbsG * 4 + componentFat * 9;
      const d = Math.abs(declared - calc2);
      const p = calc2 === 0 ? 100 : (d / Math.abs(calc2)) * 100;
      if (d > 15 || p > 20) {
        push(
          'WARNING',
          'KCAL_DIFF_WITH_COMPONENT_FAT',
          `Sans lipides totaux: Atwater via sat+poly+mono ≈ ${calc2.toFixed(1)} vs déclaré ${declared}`
        );
      }
    }
  }

  if (portion.grams == null) push('WARNING', 'MISSING_GRAMS', 'Poids en grammes absent');
  if (!portion.preparationState) {
    push('WARNING', 'MISSING_PREP_STATE', 'État cru/cuit/égoutté non précisé');
  }
  if (portion.brandSpecific && !portion.brand) {
    push('WARNING', 'MISSING_BRAND', 'Marque nécessaire mais absente');
  }
  if (n.fiberG != null && n.carbsG != null && n.fiberG > n.carbsG) {
    push('WARNING', 'FIBER_GT_CARBS', 'Fibres supérieures aux glucides');
  }

  const fatSum = fatFromComponents(n);
  if (n.fatG != null && fatSum != null && fatSum > n.fatG + 0.05) {
    push(
      'WARNING',
      'FAT_COMPONENTS_EXCEED_TOTAL',
      `Somme sat+mono+poly (${fatSum}) > lipides totaux (${n.fatG})`
    );
  }

  if (food.displayCategory === 'autres_sources_proteinees') {
    if (!['protein', 'whey'].includes(food.calculationGroup)) {
      push('WARNING', 'AMBIGUOUS_GROUP', 'calculationGroup ambigu pour autres protéines');
    }
  }

  // Ambiguous powdered items without grams/brand
  if (
    food.calculationGroup === 'whey' &&
    (portion.grams == null || !portion.brand)
  ) {
    push(
      'WARNING',
      'AMBIGUOUS_GROUP',
      'Protéine en poudre: précision grammes/marque insuffisante pour un calculateur fiable'
    );
  }

  // Suspect mandatory cases
  for (const sc of SUSPECT_CASES) {
    const hay = `${food.id} ${names.fr} ${names.en} ${portion.labelFr} ${portion.labelEn}`;
    if (sc.match.test(hay)) {
      push('ERROR', 'SUSPECT_CASE', sc.reason);
    }
  }

  // Calculator mismatch for whey (guide half-scoop vs calculator full scoop)
  if (/lactos[eé]rum|\bwhey\b/i.test(`${portion.labelFr} ${portion.labelEn}`)) {
    const guideP = n.proteinG;
    const calcP = CALCULATOR_MOYENNES.whey.p;
    push(
      'WARNING',
      'GUIDE_VS_CALCULATOR',
      `Whey: guide ${guideP} g prot. / ${portion.labelFr} vs calculateur MOYENNES.whey ${calcP} g prot. / scoop`
    );
  }

  const errorCount = alerts.filter((a) => a.severity === 'ERROR').length;
  const warningCount = alerts.filter((a) => a.severity === 'WARNING').length;
  const maxSeverity = errorCount ? 'ERROR' : warningCount ? 'WARNING' : 'OK';

  return {
    id: food.id,
    displayCategory: food.displayCategory,
    calculationGroup: food.calculationGroup,
    nameFr: names.fr,
    nameEn: names.en,
    status: food.status,
    portionLabelFr: portion.labelFr,
    portionLabelEn: portion.labelEn,
    amount: portion.amount,
    unit: portion.unit,
    grams: portion.grams,
    nutrients: n,
    declaredKcal: declared,
    calculatedKcal: calc,
    absDiff,
    pctDiff,
    alerts,
    errorCount,
    warningCount,
    maxSeverity,
  };
}

function buildHtml(report) {
  const rows = report.items
    .map((item) => {
      const alertText = item.alerts.map((a) => `[${a.severity}] ${a.code}: ${a.message}`).join(' | ');
      return `<tr data-severity="${esc(item.maxSeverity)}" data-cat="${esc(item.displayCategory)}" data-group="${esc(item.calculationGroup)}" data-status="${esc(item.status)}">
      <td>${esc(item.maxSeverity)}</td>
      <td>${item.errorCount}</td>
      <td>${item.warningCount}</td>
      <td>${esc(item.displayCategory)}</td>
      <td>${esc(item.calculationGroup)}</td>
      <td>${esc(item.nameFr)}</td>
      <td>${esc(item.nameEn)}</td>
      <td>${esc(item.status)}</td>
      <td>${item.declaredKcal ?? ''}</td>
      <td>${item.calculatedKcal == null ? '' : item.calculatedKcal.toFixed(1)}</td>
      <td>${item.absDiff == null ? '' : item.absDiff.toFixed(1)}</td>
      <td>${item.pctDiff == null ? '' : item.pctDiff.toFixed(1)}</td>
      <td class="alerts">${esc(alertText)}</td>
    </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Audit équivalents alimentaires — KR Kinetics</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --text:#e8eaed; --muted:#9aa0a6; --line:#2a2f3a; --err:#ff6b6b; --warn:#ffd166; --ok:#7dcea0; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, Segoe UI, sans-serif; background:var(--bg); color:var(--text); }
  header { padding:24px 28px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 8px; font-size:22px; }
  .meta { color:var(--muted); font-size:13px; }
  .stats { display:flex; flex-wrap:wrap; gap:12px; padding:16px 28px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; min-width:140px; }
  .stat b { display:block; font-size:20px; }
  .stat span { color:var(--muted); font-size:12px; }
  .controls { padding:0 28px 16px; display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  input, select { background:#10131a; color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { border-bottom:1px solid var(--line); padding:8px 10px; vertical-align:top; text-align:left; }
  th { position:sticky; top:0; background:#12151c; cursor:pointer; }
  tr[data-severity="ERROR"] td:first-child { color:var(--err); font-weight:700; }
  tr[data-severity="WARNING"] td:first-child { color:var(--warn); font-weight:700; }
  tr[data-severity="OK"] td:first-child { color:var(--ok); }
  .alerts { max-width:420px; color:var(--muted); }
  .wrap { padding:0 12px 40px; overflow:auto; }
  .note { padding:0 28px 20px; color:var(--muted); font-size:13px; }
</style>
</head>
<body>
<header>
  <h1>Audit — équivalents alimentaires</h1>
  <div class="meta">Version données ${esc(report.version.version)} · statut ${esc(report.version.status)} · généré ${esc(report.generatedAt)} · 4-4-9 = contrôle seulement</div>
</header>
<section class="stats">
  <div class="stat"><b>${report.summary.totalFoods}</b><span>Aliments</span></div>
  <div class="stat"><b>${report.summary.foodsWithErrors}</b><span>Avec ERROR</span></div>
  <div class="stat"><b>${report.summary.foodsWithWarningsOnly}</b><span>WARNING seulement</span></div>
  <div class="stat"><b>${report.summary.blockingErrors}</b><span>Erreurs bloquantes</span></div>
  <div class="stat"><b>${report.summary.warnings}</b><span>Avertissements</span></div>
  <div class="stat"><b>${report.summary.verifiedFoods}</b><span>Validés</span></div>
</section>
<p class="note">Tri: cliquer les en-têtes. Filtres: gravité, catégorie, groupe, statut, recherche. Aucune valeur nutritionnelle n’a été corrigée par cet audit.</p>
<div class="controls">
  <input id="q" placeholder="Rechercher aliment / alerte…" size="32" />
  <select id="sev"><option value="">Gravité</option><option>ERROR</option><option>WARNING</option><option>OK</option></select>
  <select id="cat"><option value="">Catégorie</option>${[...new Set(report.items.map((i) => i.displayCategory))].map((c) => `<option>${esc(c)}</option>`).join('')}</select>
  <select id="group"><option value="">Groupe calcul</option>${[...new Set(report.items.map((i) => i.calculationGroup))].map((c) => `<option>${esc(c)}</option>`).join('')}</select>
  <select id="status"><option value="">Statut</option><option>unverified</option><option>verified</option><option>rejected</option></select>
</div>
<div class="wrap">
<table id="tbl">
<thead>
<tr>
  <th data-k="maxSeverity">Gravité</th>
  <th data-k="errorCount">#E</th>
  <th data-k="warningCount">#W</th>
  <th data-k="displayCategory">Catégorie</th>
  <th data-k="calculationGroup">Groupe</th>
  <th data-k="nameFr">Aliment FR</th>
  <th data-k="nameEn">Aliment EN</th>
  <th data-k="status">Statut</th>
  <th data-k="declaredKcal">kcal déclarées</th>
  <th data-k="calculatedKcal">kcal Atwater</th>
  <th data-k="absDiff">Δ abs</th>
  <th data-k="pctDiff">Δ %</th>
  <th>Alertes</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<script>
const rows = [...document.querySelectorAll('#tbl tbody tr')];
const data = ${JSON.stringify(
    report.items.map((i) => ({
      maxSeverity: i.maxSeverity,
      errorCount: i.errorCount,
      warningCount: i.warningCount,
      displayCategory: i.displayCategory,
      calculationGroup: i.calculationGroup,
      nameFr: i.nameFr,
      nameEn: i.nameEn,
      status: i.status,
      declaredKcal: i.declaredKcal,
      calculatedKcal: i.calculatedKcal,
      absDiff: i.absDiff,
      pctDiff: i.pctDiff,
    }))
  )};
function applyFilters() {
  const q = document.getElementById('q').value.toLowerCase();
  const sev = document.getElementById('sev').value;
  const cat = document.getElementById('cat').value;
  const group = document.getElementById('group').value;
  const status = document.getElementById('status').value;
  rows.forEach((tr) => {
    const text = tr.innerText.toLowerCase();
    const ok =
      (!q || text.includes(q)) &&
      (!sev || tr.dataset.severity === sev) &&
      (!cat || tr.dataset.cat === cat) &&
      (!group || tr.dataset.group === group) &&
      (!status || tr.dataset.status === status);
    tr.style.display = ok ? '' : 'none';
  });
}
['q','sev','cat','group','status'].forEach((id) => document.getElementById(id).addEventListener('input', applyFilters));
let sortKey = 'errorCount';
let asc = false;
document.querySelectorAll('th[data-k]').forEach((th) => {
  th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (sortKey === k) asc = !asc; else { sortKey = k; asc = true; }
    const indexed = rows.map((tr, i) => ({ tr, i, v: data[i][k] }));
    indexed.sort((a, b) => {
      const av = a.v, bv = b.v;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    const tb = document.querySelector('#tbl tbody');
    indexed.forEach(({ tr }) => tb.appendChild(tr));
  });
});
</script>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error('Missing food-equivalents.json — run scripts/import-from-legacy.mjs first');
    process.exit(1);
  }
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const payload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const groupsDoc = JSON.parse(fs.readFileSync(GROUPS_PATH, 'utf8'));
  const version = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));
  const foods = payload.foods || [];

  const idCounts = new Map();
  for (const f of foods) idCounts.set(f.id, (idCounts.get(f.id) || 0) + 1);

  const items = foods.map((f) => auditFood(f, idCounts));
  items.sort((a, b) => b.errorCount - a.errorCount || b.warningCount - a.warningCount || a.nameFr.localeCompare(b.nameFr));

  const blockingErrors = items.reduce((a, i) => a + i.errorCount, 0);
  const warnings = items.reduce((a, i) => a + i.warningCount, 0);
  const foodsWithErrors = items.filter((i) => i.errorCount > 0).length;
  const foodsWithWarningsOnly = items.filter((i) => i.errorCount === 0 && i.warningCount > 0).length;
  const verifiedFoods = foods.filter((f) => f.status === 'verified').length;

  const groupStats = calculateAllGroupStatistics(
    foods,
    groupsDoc.groups.map((g) => g.id)
  );

  const suspectHits = items.filter((i) => i.alerts.some((a) => a.code === 'SUSPECT_CASE'));

  const decisionsNeeded = [
    {
      id: 'approve-reference-profiles',
      title: 'Approuver les profils de référence des calculationGroups',
      detail: 'Les referenceProfile sont volontairement null jusqu’à validation post-audit.',
    },
    {
      id: 'fat-total-for-nuts-oils',
      title: 'Définir les lipides totaux pour noix_graines et matieres_grasses',
      detail: 'Le guide legacy stocke sat/poly/mono sans lipides totaux. Décider: somme des composantes, nouvelle mesure, ou autre.',
    },
    {
      id: 'whey-portion-standard',
      title: 'Standardiser la portion whey guide vs calculateur',
      detail: 'Guide: ½ scoop ≈ 9 g prot. Calculateur MOYENNES.whey: 22 g prot. / scoop. Harmoniser grammes + protéines.',
    },
    {
      id: 'dairy-calculator-gap',
      title: 'Écart laitier guide vs calculateur',
      detail: 'Guide moyenne legacy ~7P/3G/0L/74 kcal; calculateur lai = 7P/10G/2L.',
    },
    {
      id: 'fruit-fat-gap',
      title: 'Écart lipides fruits',
      detail: 'Guide lip ~0.3 g; calculateur fru.l = 2 g.',
    },
    {
      id: 'fix-suspect-six',
      title: 'Réviser les 6 cas suspects obligatoires',
      detail: 'Poitrine de poulet, blancs d’œuf, yogourt grec, patate douce, quinoa, whey.',
    },
    {
      id: 'incomplete-vegetable-portions',
      title: 'Compléter les portions légumes sans quantité',
      detail: 'Plusieurs légumes n’ont que le nom (asperges, aubergine…) sans grammes/ml.',
    },
  ];

  version.totalFoods = foods.length;
  version.verifiedFoods = verifiedFoods;
  version.unverifiedFoods = foods.length - verifiedFoods;
  version.blockingErrors = blockingErrors;
  version.status = 'draft';
  fs.writeFileSync(VERSION_PATH, JSON.stringify(version, null, 2));

  const report = {
    generatedAt: new Date().toISOString(),
    version,
    summary: {
      totalFoods: foods.length,
      verifiedFoods,
      unverifiedFoods: foods.length - verifiedFoods,
      blockingErrors,
      warnings,
      foodsWithErrors,
      foodsWithWarningsOnly,
      foodsOk: items.filter((i) => i.maxSeverity === 'OK').length,
    },
    calculatorMoyennesCaptured: CALCULATOR_MOYENNES,
    groupStatistics: groupStats,
    suspectCases: suspectHits.map((i) => ({
      id: i.id,
      nameFr: i.nameFr,
      nutrients: i.nutrients,
      declaredKcal: i.declaredKcal,
      calculatedKcal: i.calculatedKcal,
      alerts: i.alerts.filter((a) => a.code === 'SUSPECT_CASE' || a.code === 'KCAL_DIFF_HIGH' || a.code === 'GUIDE_VS_CALCULATOR'),
    })),
    decisionsNeeded,
    alertCountsByCode: {},
    items,
  };

  for (const item of items) {
    for (const a of item.alerts) {
      report.alertCountsByCode[a.code] = (report.alertCountsByCode[a.code] || 0) + 1;
    }
  }

  const jsonPath = path.join(REPORTS_DIR, 'food-equivalents-audit.json');
  const csvPath = path.join(REPORTS_DIR, 'food-equivalents-audit.csv');
  const htmlPath = path.join(REPORTS_DIR, 'food-equivalents-audit.html');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const csvHeader = [
    'severity',
    'errorCount',
    'warningCount',
    'id',
    'displayCategory',
    'calculationGroup',
    'nameFr',
    'nameEn',
    'status',
    'proteinG',
    'carbsG',
    'fiberG',
    'fatG',
    'declaredKcal',
    'calculatedKcal',
    'absDiff',
    'pctDiff',
    'alerts',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const i of items) {
    csvLines.push(
      [
        i.maxSeverity,
        i.errorCount,
        i.warningCount,
        i.id,
        i.displayCategory,
        i.calculationGroup,
        i.nameFr,
        i.nameEn,
        i.status,
        i.nutrients.proteinG,
        i.nutrients.carbsG,
        i.nutrients.fiberG,
        i.nutrients.fatG,
        i.declaredKcal,
        i.calculatedKcal,
        i.absDiff,
        i.pctDiff,
        i.alerts.map((a) => `${a.severity}:${a.code}:${a.message}`).join(' || '),
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  fs.writeFileSync(htmlPath, buildHtml(report), 'utf8');

  // Refresh review page data embed helper
  const reviewDataPath = path.join(ROOT, 'tools', 'food-data-review-data.js');
  fs.writeFileSync(
    reviewDataPath,
    `window.FOOD_EQUIVALENTS_DATA = ${JSON.stringify(payload)};\nwindow.FOOD_AUDIT_SUMMARY = ${JSON.stringify({
      summary: report.summary,
      alertCountsByCode: report.alertCountsByCode,
      decisionsNeeded: report.decisionsNeeded,
      suspectCases: report.suspectCases,
    })};\n`,
    'utf8'
  );

  console.log('Audit complete');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('Suspect cases:', report.suspectCases.length);
  console.log('Wrote:', htmlPath);
  console.log('Wrote:', csvPath);
  console.log('Wrote:', jsonPath);
}

main();
