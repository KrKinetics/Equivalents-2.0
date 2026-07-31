/**
 * Interactive release-candidate HTML (KR Kinetics branding).
 * Browser calculator uses the same data bundle produced by rc-preview.
 */

export function buildReleaseCandidateHtml({ dataUrl = './rc-data.json', logoUrl = './assets/kinetics-logo.png' } = {}) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KR Kinetics — Version candidate interactive</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
<style>
:root {
  --ink: #1a1a2e;
  --muted: #64748b;
  --border: #e2e8f0;
  --bg: #f7f4f1;
  --panel: #ffffff;
  --brand: #991F2D;
  --brand-dark: #6f1520;
  --warn: #9a3412;
  --warn-bg: #fff7ed;
  --ok-bg: #ecfdf5;
  --shadow: 0 10px 30px rgba(26, 26, 46, 0.08);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; max-width: 100%; overflow-x: hidden; }
body {
  font-family: "DM Sans", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(153, 31, 45, 0.12), transparent 60%),
    radial-gradient(900px 400px at 100% 0%, rgba(72, 149, 239, 0.10), transparent 55%),
    var(--bg);
  min-height: 100vh;
}
.wrap {
  width: min(1120px, calc(100% - 1.25rem));
  margin: 0 auto;
  padding: 1rem 0 3rem;
  max-width: 100%;
  overflow-x: clip;
}
.banner {
  position: sticky; top: 0; z-index: 20;
  background: var(--brand); color: #fff;
  text-align: center; font-weight: 700; letter-spacing: 0.04em;
  padding: 0.65rem 1rem; font-size: 0.85rem;
}
.hero {
  display: grid; gap: 1rem; align-items: end;
  grid-template-columns: 1fr;
  margin: 1.25rem 0 1rem;
}
@media (min-width: 768px) {
  .hero { grid-template-columns: auto 1fr; gap: 1.5rem; }
}
.hero img { width: min(220px, 55vw); height: auto; display: block; }
.hero h1 {
  font-family: "DM Serif Display", serif;
  font-weight: 400; font-size: clamp(1.8rem, 4vw, 2.6rem);
  margin: 0 0 0.35rem; color: var(--brand);
  line-height: 1.1;
}
.hero p { margin: 0; color: var(--muted); max-width: 42rem; }
.panel {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 18px; box-shadow: var(--shadow);
  padding: 0.9rem; margin-bottom: 1rem;
  max-width: 100%;
  overflow-x: auto;
}
.panel h2 {
  font-family: "DM Serif Display", serif;
  font-weight: 400; font-size: 1.35rem; margin: 0 0 0.75rem;
}
.mode-bar {
  display: grid; gap: 0.75rem;
}
@media (min-width: 768px) {
  .mode-bar { grid-template-columns: 1fr 1fr; }
}
.mode-option {
  border: 2px solid var(--border); border-radius: 14px;
  padding: 0.85rem 1rem; cursor: pointer; background: #fff;
  transition: border-color .15s, background .15s;
}
.mode-option.active { border-color: var(--brand); background: #fff5f6; }
.mode-option strong { display: block; margin-bottom: 0.25rem; }
.mode-option span { color: var(--muted); font-size: 0.92rem; }
.badge {
  display: inline-block; margin-top: 0.45rem;
  background: var(--warn-bg); color: var(--warn);
  border: 1px solid #fdba74; border-radius: 999px;
  padding: 0.15rem 0.65rem; font-size: 0.78rem; font-weight: 700;
}
.grid-2 { display: grid; gap: 1rem; }
@media (min-width: 900px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
.totals {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem;
}
@media (min-width: 768px) { .totals { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.stat {
  background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; padding: 0.7rem;
}
.stat .label { color: var(--muted); font-size: 0.78rem; }
.stat .value { font-size: 1.25rem; font-weight: 700; margin-top: 0.15rem; }
.groups {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem;
}
@media (min-width: 768px) { .groups { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.group-card label { display: block; font-size: 0.82rem; color: var(--muted); margin-bottom: 0.25rem; }
.group-card input {
  width: 100%; border: 1px solid var(--border); border-radius: 10px;
  padding: 0.55rem 0.65rem; font: inherit;
}
button, .btn {
  appearance: none; border: none; border-radius: 12px;
  background: var(--brand); color: #fff; font: inherit; font-weight: 700;
  padding: 0.7rem 1rem; cursor: pointer;
}
button.secondary, .btn.secondary { background: #fff; color: var(--brand); border: 1px solid var(--brand); }
button:hover { background: var(--brand-dark); }
button.secondary:hover { background: #fff5f6; }
.actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.85rem; }
.warn-list { margin: 0.5rem 0 0; padding-left: 1.1rem; color: var(--warn); }
.compare-table { width: 100%; min-width: 0; border-collapse: collapse; font-size: 0.85rem; table-layout: fixed; }
.compare-table th, .compare-table td {
  border-bottom: 1px solid var(--border); text-align: left; padding: 0.55rem 0.35rem;
  vertical-align: top; word-break: break-word; overflow-wrap: anywhere;
}
.compare-table th { color: var(--muted); font-weight: 600; }
@media (max-width: 420px) {
  .groups { grid-template-columns: 1fr 1fr; }
  .totals { grid-template-columns: 1fr 1fr; }
  .compare-table { font-size: 0.78rem; }
  .actions { flex-direction: column; }
  button, .btn { width: 100%; text-align: center; }
  .food-row { grid-template-columns: 1fr; }
}
.filters { display: grid; gap: 0.6rem; }
@media (min-width: 768px) { .filters { grid-template-columns: 2fr 1fr 1fr 1fr; } }
input[type="search"], select {
  width: 100%; border: 1px solid var(--border); border-radius: 10px;
  padding: 0.6rem 0.7rem; font: inherit; background: #fff;
}
.food-list { max-height: 420px; overflow: auto; border: 1px solid var(--border); border-radius: 12px; }
.food-row {
  display: grid; gap: 0.25rem; padding: 0.7rem 0.8rem;
  border-bottom: 1px solid var(--border);
}
@media (min-width: 768px) {
  .food-row { grid-template-columns: 1.4fr 0.8fr 0.8fr auto; align-items: center; gap: 0.6rem; }
}
.food-row:nth-child(even) { background: #fafafa; }
.muted { color: var(--muted); font-size: 0.88rem; }
.links a { color: var(--brand); font-weight: 600; }
details.validation { margin-top: 0.5rem; }
details.validation summary { cursor: pointer; font-weight: 700; color: var(--brand-dark); }
.scenario { border: 1px solid var(--border); border-radius: 12px; padding: 0.75rem; margin-bottom: 0.6rem; }
.scenario.pass { background: var(--ok-bg); }
.scenario.fail { background: #fef2f2; }
.pill { display: inline-block; border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.75rem; font-weight: 700; }
.pill.pass { background: #d1fae5; color: #065f46; }
.pill.fail { background: #fee2e2; color: #991b1b; }
.footer-note { color: var(--muted); font-size: 0.85rem; margin-top: 1.5rem; }
</style>
</head>
<body>
<div class="banner">VERSION CANDIDATE — NE PAS UTILISER POUR DES CLIENTS</div>
<div class="wrap">
  <header class="hero">
    <img src="${logoUrl}" alt="KR Kinetics" />
    <div>
      <h1>Calculateur &amp; guide — version candidate</h1>
      <p>Comparez le mode actuel (règles KR Kinetics) et l’aperçu précision par profils d’échange. Aucune valeur D/A n’est approuvée pour la production.</p>
    </div>
  </header>

  <section class="panel" id="mode-panel">
    <h2>Mode de calcul</h2>
    <div class="mode-bar" role="radiogroup" aria-label="Mode de calcul">
      <div class="mode-option active" data-mode="legacy-a" id="mode-a" tabindex="0" role="radio" aria-checked="true">
        <strong>Mode actuel — règles KR Kinetics</strong>
        <span>Comportement actuel bit-for-bit. Utilisé par tous les plans existants.</span>
      </div>
      <div class="mode-option" data-mode="hybrid-da-rc" id="mode-da" tabindex="0" role="radio" aria-checked="false">
        <strong>Aperçu précision — profils d’échange</strong>
        <span>Montre la future précision par familles. Non approuvé pour la production.</span>
        <div class="badge">Valeurs provisoires non approuvées</div>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2>Calculateur</h2>
    <p class="muted">Ajustez les portions par groupe. Le basculement de mode conserve vos entrées. Activez « plan exploitable » pour forcer le retour à A sur les familles à échantillon insuffisant.</p>
    <div class="groups" id="group-inputs"></div>
    <label style="display:flex;gap:.5rem;align-items:center;margin-top:.85rem;">
      <input type="checkbox" id="actionable" />
      Plan exploitable (fallback A si échantillon insuffisant)
    </label>
    <div class="actions">
      <button type="button" id="btn-typical">Charger la journée type</button>
      <button type="button" class="secondary" id="btn-reset">Réinitialiser</button>
    </div>
  </section>

  <section class="grid-2">
    <div class="panel">
      <h2>Totaux — mode actif</h2>
      <div class="totals" id="active-totals"></div>
      <ul class="warn-list" id="active-warnings"></ul>
    </div>
    <div class="panel">
      <h2>Comparaison A vs D/A</h2>
      <div class="totals" id="compare-totals"></div>
      <p class="muted" id="diff-summary"></p>
    </div>
  </section>

  <section class="panel">
    <h2>Détail des lignes</h2>
    <div style="overflow-x:auto;">
      <table class="compare-table" id="lines-table">
        <thead>
          <tr>
            <th>Entrée</th>
            <th>A (actuel)</th>
            <th>D/A (aperçu)</th>
            <th>Rollup / statut</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <details class="validation">
      <summary>Détails de validation</summary>
      <pre id="validation-details" class="muted" style="white-space:pre-wrap;"></pre>
    </details>
  </section>

  <section class="panel">
    <h2>Guide alimentaire (287 aliments)</h2>
    <p class="muted">Guide issu de la source de vérité. Les PDF candidats sont pour inspection seulement.</p>
    <div class="links actions">
      <a class="btn secondary" href="./guides/kr-kinetics-landscape-fr.html" target="_blank" rel="noopener">Guide desktop FR</a>
      <a class="btn secondary" href="./guides/kr-kinetics-mobile-bilingual.html" target="_blank" rel="noopener">Guide mobile bilingue</a>
      <a class="btn secondary" href="./kr-kinetics-guide-landscape-fr-rc.pdf" target="_blank" rel="noopener">PDF desktop FR</a>
      <a class="btn secondary" href="./kr-kinetics-guide-mobile-bilingual-rc.pdf" target="_blank" rel="noopener">PDF mobile</a>
    </div>
  </section>

  <section class="panel">
    <h2>Recherche &amp; filtres — 287 aliments</h2>
    <div class="filters">
      <input type="search" id="food-search" placeholder="Rechercher (FR ou EN)" />
      <select id="filter-category"><option value="">Toutes catégories</option></select>
      <select id="filter-group"><option value="">Tous groupes</option></select>
      <select id="filter-rollup"><option value="">Tous rollups</option></select>
    </div>
    <p class="muted" id="food-count"></p>
    <div class="food-list" id="food-list"></div>
  </section>

  <section class="panel">
    <h2>Scénarios d’acceptation</h2>
    <div id="scenarios"></div>
  </section>

  <p class="footer-note">
    Ce build ne modifie aucun plan client, aucune donnée nutritionnelle individuelle, ni aucune règle de production.
    Modèle par défaut : legacy-a. Mode hybrid-da-rc : aperçu seulement.
  </p>
</div>
<script>
const DATA_URL = ${JSON.stringify(dataUrl)};
const NUTRIENT_KEYS = ['proteinG','carbsG','fiberG','fatG','declaredKcal'];
const GROUP_LABELS = {
  protein: 'Protéines', starch: 'Féculents', vegetable: 'Légumes', fruit: 'Fruits',
  dairy: 'Laitiers', fat: 'Lipides', whey: 'Whey'
};
const ROUNDING = { proteinG:1, fatG:1, fiberG:1, carbsG:0, declaredKcal:0 };

let DATA = null;
let mode = 'legacy-a';
let portions = { protein:4, starch:4, vegetable:3, fruit:2, dairy:2, fat:3, whey:0 };

function roundHalfAwayFromZero(n, decimals=0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * factor) / factor;
}
function formatNum(value, lang='fr') {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const cleaned = Number(value.toFixed(4));
  const text = String(cleaned);
  return lang === 'fr' ? text.replace('.', ',') : text;
}
function roundPreview(profile) {
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const value = profile?.[key];
    out[key] = value == null || typeof value !== 'number' ? null : roundHalfAwayFromZero(value, ROUNDING[key] ?? 0);
  }
  return out;
}
function legacyFor(group) {
  return DATA.legacyRefs[group] || { proteinG:null, carbsG:null, fiberG:null, fatG:null, declaredKcal:null };
}
function dominantRollup(group) {
  const list = DATA.rollups
    .filter(r => r.calculatorBridge?.calculatorGroup === group)
    .filter(r => !r.insufficientSample && (r.foodCount||0) >= 3)
    .sort((a,b) => (b.foodCount-a.foodCount) || a.exchangeRollupId.localeCompare(b.exchangeRollupId));
  return list[0] || null;
}
function add(totals, nutrients, count) {
  for (const key of NUTRIENT_KEYS) {
    const value = nutrients?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && count) {
      totals[key] = (totals[key] ?? 0) + value * count;
    }
  }
}
function normalize(totals) {
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const value = totals[key];
    out[key] = value == null ? null : Number(value.toFixed(4));
  }
  return out;
}
function calc(model, entries, actionable) {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, null]));
  const lines = [];
  const warnings = [];
  const fallbacks = [];
  for (const entry of entries) {
    if (model === 'legacy-a') {
      let group = entry.group;
      if (entry.type === 'food') group = DATA.foodsById[entry.foodId]?.calculationGroup || group;
      if (entry.type === 'rollup') {
        const r = DATA.rollupsById[entry.exchangeRollupId];
        group = r?.calculatorBridge?.calculatorGroup || group;
      }
      const nutrients = legacyFor(group);
      add(totals, nutrients, entry.portions);
      lines.push({ entry, group, nutrients, exchangeRollupId: entry.exchangeRollupId || null, status:'legacy_business_rule', warnings:[] });
      continue;
    }
    // hybrid
    let rollupId = entry.exchangeRollupId || null;
    const localWarnings = [];
    if (!rollupId && entry.type === 'group') {
      const dom = dominantRollup(entry.group);
      if (!dom) {
        const nutrients = legacyFor(entry.group);
        add(totals, nutrients, entry.portions);
        warnings.push({ messageFr: 'Retour explicite aux règles actuelles (pas de rollup stable).' });
        fallbacks.push(entry);
        lines.push({ entry, group: entry.group, nutrients, exchangeRollupId:null, status:'fallback_legacy_a', warnings });
        continue;
      }
      rollupId = dom.exchangeRollupId;
      localWarnings.push({ messageFr: 'Aperçu via rollup dominant — sélectionnez des aliments pour plus de précision.' });
    }
    if (!rollupId && entry.type === 'food') {
      rollupId = DATA.assignmentsByFoodId[entry.foodId]?.exchangeRollupId || null;
    }
    const rollup = DATA.rollupsById[rollupId];
    const insufficient = !rollup || rollup.insufficientSample || (rollup.foodCount||0) < 3;
    const preview = roundPreview(rollup?.medianProfile || {});
    if (insufficient && actionable) {
      const group = entry.group || rollup?.calculatorBridge?.calculatorGroup;
      const nutrients = legacyFor(group);
      add(totals, nutrients, entry.portions);
      localWarnings.push({ messageFr: 'Échantillon insuffisant — valeur provisoire' });
      localWarnings.push({ messageFr: 'Plan exploitable : retour explicite aux règles actuelles (mode A).' });
      warnings.push(...localWarnings);
      fallbacks.push(entry);
      lines.push({ entry, group, nutrients, exchangeRollupId: rollupId, status:'insufficient_fallback_a', warnings: localWarnings, previewNutrients: preview });
      continue;
    }
    add(totals, preview, entry.portions);
    localWarnings.push({ messageFr: insufficient ? 'Échantillon insuffisant — valeur provisoire' : 'Valeurs provisoires non approuvées' });
    warnings.push(...localWarnings);
    lines.push({
      entry, group: rollup?.calculatorBridge?.calculatorGroup || entry.group,
      nutrients: preview, exchangeRollupId: rollupId,
      status: insufficient ? 'insufficient_sample_provisional' : 'stable_provisional',
      warnings: localWarnings,
    });
  }
  return { model, totals: normalize(totals), lines, warnings, fallbacks };
}

function currentEntries() {
  return Object.entries(portions)
    .filter(([, n]) => Number(n) > 0)
    .map(([group, n]) => ({ type:'group', group, portions: Number(n) }));
}

function renderTotals(el, totals) {
  const macros = [
    ['proteinG','Protéines (g)'],
    ['carbsG','Glucides (g)'],
    ['fatG','Lipides (g)'],
    ['declaredKcal','Calories'],
  ];
  el.innerHTML = macros.map(([key,label]) =>
    '<div class="stat"><div class="label">'+label+'</div><div class="value">'+formatNum(totals?.[key])+'</div></div>'
  ).join('');
}

function render() {
  const actionable = document.getElementById('actionable').checked;
  const entries = currentEntries();
  const active = calc(mode, entries, actionable);
  const legacy = calc('legacy-a', entries, actionable);
  const hybrid = calc('hybrid-da-rc', entries, actionable);
  renderTotals(document.getElementById('active-totals'), active.totals);
  const warnEl = document.getElementById('active-warnings');
  warnEl.innerHTML = active.warnings.map(w => '<li>'+w.messageFr+'</li>').join('');
  document.getElementById('compare-totals').innerHTML = [
    ['A · P', legacy.totals.proteinG],
    ['D/A · P', hybrid.totals.proteinG],
    ['A · G', legacy.totals.carbsG],
    ['D/A · G', hybrid.totals.carbsG],
    ['A · L', legacy.totals.fatG],
    ['D/A · L', hybrid.totals.fatG],
    ['A · kcal', legacy.totals.declaredKcal],
    ['D/A · kcal', hybrid.totals.declaredKcal],
  ].map(([label,value]) =>
    '<div class="stat"><div class="label">'+label+'</div><div class="value">'+formatNum(value)+'</div></div>'
  ).join('');
  const dP = (hybrid.totals.proteinG??0)-(legacy.totals.proteinG??0);
  const dG = (hybrid.totals.carbsG??0)-(legacy.totals.carbsG??0);
  const dL = (hybrid.totals.fatG??0)-(legacy.totals.fatG??0);
  document.getElementById('diff-summary').textContent =
    'Écart D/A − A : P '+formatNum(dP)+' · G '+formatNum(dG)+' · L '+formatNum(dL)+' (valeurs provisoires).';

  const tbody = document.querySelector('#lines-table tbody');
  tbody.innerHTML = legacy.lines.map((line, idx) => {
    const h = hybrid.lines[idx];
    const label = line.entry.type === 'group'
      ? (GROUP_LABELS[line.entry.group] || line.entry.group) + ' × ' + line.entry.portions
      : (line.entry.foodId || line.entry.exchangeRollupId);
    const fmt = (n) => 'P '+formatNum(n.proteinG)+' / G '+formatNum(n.carbsG)+' / L '+formatNum(n.fatG);
    const status = h.exchangeRollupId
      ? h.exchangeRollupId + (h.status.includes('insufficient') ? ' · échantillon insuffisant' : ' · provisoire')
      : h.status;
    return '<tr><td>'+label+'</td><td>'+fmt(line.nutrients)+'</td><td>'+fmt(h.nutrients)+'</td><td class="muted">'+status+'</td></tr>';
  }).join('');

  document.getElementById('validation-details').textContent = JSON.stringify({
    calculationModelVersion: mode,
    actionable,
    entries,
    activeTotals: active.totals,
    fallbacks: hybrid.fallbacks,
    warnings: hybrid.warnings,
  }, null, 2);
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('.mode-option').forEach((el) => {
    const active = el.dataset.mode === mode;
    el.classList.toggle('active', active);
    el.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  render();
}

function buildGroupInputs() {
  const root = document.getElementById('group-inputs');
  root.innerHTML = Object.keys(GROUP_LABELS).map((group) =>
    '<div class="group-card"><label for="g-'+group+'">'+GROUP_LABELS[group]+'</label>'+
    '<input id="g-'+group+'" type="number" min="0" step="1" value="'+(portions[group]||0)+'" data-group="'+group+'" /></div>'
  ).join('');
  root.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      portions[input.dataset.group] = Number(input.value) || 0;
      render();
    });
  });
}

function fillFilters() {
  const cats = [...new Set(DATA.foods.map(f => f.displayCategory))].sort();
  const groups = [...new Set(DATA.foods.map(f => f.calculationGroup))].sort();
  const rollups = DATA.rollups.map(r => r.exchangeRollupId).sort();
  const cat = document.getElementById('filter-category');
  const grp = document.getElementById('filter-group');
  const rol = document.getElementById('filter-rollup');
  cat.innerHTML += cats.map(c => '<option value="'+c+'">'+c+'</option>').join('');
  grp.innerHTML += groups.map(c => '<option value="'+c+'">'+c+'</option>').join('');
  rol.innerHTML += rollups.map(c => '<option value="'+c+'">'+c+'</option>').join('');
}

function renderFoods() {
  const q = document.getElementById('food-search').value.trim().toLowerCase();
  const cat = document.getElementById('filter-category').value;
  const grp = document.getElementById('filter-group').value;
  const rol = document.getElementById('filter-rollup').value;
  const rows = DATA.foods.filter((food) => {
    const assignment = DATA.assignmentsByFoodId[food.id];
    if (cat && food.displayCategory !== cat) return false;
    if (grp && food.calculationGroup !== grp) return false;
    if (rol && assignment?.exchangeRollupId !== rol) return false;
    if (!q) return true;
    const hay = [food.id, food.names?.fr, food.names?.en, food.exchangeProfileId, assignment?.exchangeRollupId]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
  document.getElementById('food-count').textContent = rows.length + ' / ' + DATA.foods.length + ' aliments';
  document.getElementById('food-list').innerHTML = rows.slice(0, 200).map((food) => {
    const a = DATA.assignmentsByFoodId[food.id];
    const rollup = DATA.rollupsById[a?.exchangeRollupId];
    const badge = rollup?.insufficientSample ? 'Échantillon insuffisant — valeur provisoire' : 'Valeurs provisoires non approuvées';
    return '<div class="food-row">'+
      '<div><strong>'+(food.names?.fr || food.id)+'</strong><div class="muted">'+(food.names?.en || '')+'</div></div>'+
      '<div class="muted">'+food.calculationGroup+' · '+food.displayCategory+'</div>'+
      '<div class="muted">'+(a?.exchangeRollupId || '—')+'</div>'+
      '<div><button type="button" class="secondary" data-add="'+food.id+'">+1</button><div class="muted">'+badge+'</div></div>'+
    '</div>';
  }).join('');
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const food = DATA.foodsById[btn.getAttribute('data-add')];
      if (!food) return;
      portions[food.calculationGroup] = (Number(portions[food.calculationGroup]) || 0) + 1;
      document.getElementById('g-'+food.calculationGroup).value = portions[food.calculationGroup];
      // Prefer food-precise comparison by switching display note; group counters remain the interactive default.
      render();
    });
  });
}

function renderScenarios() {
  const root = document.getElementById('scenarios');
  root.innerHTML = (DATA.scenarios || []).map((s) => {
    const totals = s.totals;
    const line = totals?.legacy
      ? 'A P '+formatNum(totals.legacy.proteinG)+' / G '+formatNum(totals.legacy.carbsG)+' / L '+formatNum(totals.legacy.fatG)
        + ' · D/A P '+formatNum(totals.hybrid.proteinG)+' / G '+formatNum(totals.hybrid.carbsG)+' / L '+formatNum(totals.hybrid.fatG)
      : (totals?.a1
        ? 'A1=A2 P '+formatNum(totals.a1.proteinG)+' · D/A P '+formatNum(totals.hybrid.proteinG)
        : JSON.stringify(totals));
    return '<div class="scenario '+(s.result==='PASS'?'pass':'fail')+'">'+
      '<div><span class="pill '+(s.result==='PASS'?'pass':'fail')+'">'+s.result+'</span> <strong>'+s.titleFr+'</strong></div>'+
      '<div class="muted">'+line+'</div>'+
      (s.rollups?.length ? '<div class="muted">Rollups : '+s.rollups.join(', ')+'</div>' : '')+
      (s.fallbacks?.length ? '<div class="muted">Fallbacks : '+s.fallbacks.length+'</div>' : '')+
    '</div>';
  }).join('');
}

async function boot() {
  const res = await fetch(DATA_URL);
  DATA = await res.json();
  buildGroupInputs();
  fillFilters();
  renderFoods();
  renderScenarios();
  render();
  document.querySelectorAll('.mode-option').forEach((el) => {
    el.addEventListener('click', () => setMode(el.dataset.mode));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode(el.dataset.mode); }
    });
  });
  document.getElementById('actionable').addEventListener('change', render);
  document.getElementById('btn-typical').addEventListener('click', () => {
    portions = { protein:4, starch:4, vegetable:3, fruit:2, dairy:2, fat:3, whey:0 };
    buildGroupInputs();
    render();
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    portions = { protein:0, starch:0, vegetable:0, fruit:0, dairy:0, fat:0, whey:0 };
    buildGroupInputs();
    render();
  });
  ['food-search','filter-category','filter-group','filter-rollup'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderFoods);
    document.getElementById(id).addEventListener('change', renderFoods);
  });
}
boot().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:#991F2D;padding:1rem;">Erreur de chargement : '+String(err)+'</pre>');
});
</script>
</body>
</html>`;
}
