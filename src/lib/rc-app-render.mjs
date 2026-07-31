/**
 * Interactive release-candidate HTML (KR Kinetics branding).
 * Browser calculator uses the same data bundle produced by rc-preview.
 */

export function buildReleaseCandidateHtml({ dataUrl = './rc-data.json', logoUrl = './assets/kinetics-logo.svg' } = {}) {
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
  --ink: #1a1a2e; --muted: #64748b; --border: #e2e8f0; --bg: #f7f4f1; --panel: #ffffff;
  --brand: #991F2D; --brand-dark: #6f1520; --warn: #9a3412; --warn-bg: #fff7ed; --ok-bg: #ecfdf5;
  --shadow: 0 10px 30px rgba(26, 26, 46, 0.08);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; max-width: 100%; overflow-x: hidden; }
body {
  font-family: "DM Sans", sans-serif; color: var(--ink);
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(153, 31, 45, 0.12), transparent 60%),
    radial-gradient(900px 400px at 100% 0%, rgba(72, 149, 239, 0.10), transparent 55%),
    var(--bg);
  min-height: 100vh;
}
.wrap { width: min(1120px, calc(100% - 1.25rem)); margin: 0 auto; padding: 1rem 0 3rem; max-width: 100%; overflow-x: clip; }
.banner {
  position: sticky; top: 0; z-index: 30; background: var(--brand); color: #fff;
  text-align: center; font-weight: 700; letter-spacing: 0.04em; padding: 0.65rem 1rem; font-size: 0.85rem;
}
.provisional-banner {
  background: var(--warn-bg); color: var(--warn); border-bottom: 1px solid #fdba74;
  text-align: center; padding: 0.55rem 1rem; font-weight: 700; font-size: 0.88rem;
}
.hero { display: grid; gap: 1rem; align-items: end; grid-template-columns: 1fr; margin: 1.25rem 0 1rem; }
@media (min-width: 768px) { .hero { grid-template-columns: auto 1fr; gap: 1.5rem; } }
.hero img { width: min(220px, 55vw); height: auto; display: block; background: #fff; }
.hero h1 {
  font-family: "DM Serif Display", serif; font-weight: 400;
  font-size: clamp(1.8rem, 4vw, 2.6rem); margin: 0 0 0.35rem; color: var(--brand); line-height: 1.1;
}
.hero p { margin: 0; color: var(--muted); max-width: 42rem; }
.panel {
  background: var(--panel); border: 1px solid var(--border); border-radius: 18px;
  box-shadow: var(--shadow); padding: 0.9rem; margin-bottom: 1rem; max-width: 100%;
}
.panel h2 { font-family: "DM Serif Display", serif; font-weight: 400; font-size: 1.35rem; margin: 0 0 0.75rem; }
.mode-bar { display: grid; gap: 0.75rem; }
@media (min-width: 768px) { .mode-bar { grid-template-columns: 1fr 1fr; } }
.mode-option {
  border: 2px solid var(--border); border-radius: 14px; padding: 0.85rem 1rem;
  cursor: pointer; background: #fff; transition: border-color .15s, background .15s;
}
.mode-option.active { border-color: var(--brand); background: #fff5f6; }
.mode-option strong { display: block; margin-bottom: 0.25rem; }
.mode-option span { color: var(--muted); font-size: 0.92rem; }
.grid-2 { display: grid; gap: 1rem; }
@media (min-width: 900px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
.totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
@media (min-width: 768px) { .totals { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.stat { background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; padding: 0.7rem; min-width: 0; }
.stat .label { color: var(--muted); font-size: 0.78rem; }
.stat .value { font-size: 1.15rem; font-weight: 700; margin-top: 0.15rem; overflow-wrap: anywhere; }
.stat .value.na { font-size: 0.92rem; font-weight: 600; color: var(--muted); }
.groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
@media (min-width: 768px) { .groups { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.group-card label { display: block; font-size: 0.82rem; color: var(--muted); margin-bottom: 0.25rem; }
.group-card input, input[type="search"], select, .qty-input {
  width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.65rem; font: inherit; background: #fff;
}
button, .btn {
  appearance: none; border: none; border-radius: 12px; background: var(--brand); color: #fff;
  font: inherit; font-weight: 700; padding: 0.65rem 0.9rem; cursor: pointer;
}
button.secondary, .btn.secondary { background: #fff; color: var(--brand); border: 1px solid var(--brand); }
button:hover { background: var(--brand-dark); }
.actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.85rem; }
.warn-list { margin: 0.5rem 0 0; padding-left: 1.1rem; color: var(--warn); }
.compare-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; table-layout: fixed; }
.compare-table th, .compare-table td {
  border-bottom: 1px solid var(--border); text-align: left; padding: 0.5rem 0.35rem;
  vertical-align: top; word-break: break-word; overflow-wrap: anywhere;
}
.compare-table th { color: var(--muted); font-weight: 600; }
.filters { display: grid; gap: 0.6rem; }
@media (min-width: 900px) { .filters { grid-template-columns: 1.4fr 1fr 1fr 1fr; } }
select { max-width: 100%; text-overflow: ellipsis; }
.food-list { border: 1px solid var(--border); border-radius: 12px; max-height: none; }
.food-row {
  display: grid; gap: 0.35rem; padding: 0.7rem 0.8rem; border-bottom: 1px solid var(--border); grid-template-columns: 1fr auto;
  align-items: center;
}
.food-row:nth-child(even) { background: #fafafa; }
.muted { color: var(--muted); font-size: 0.88rem; }
.links a, .links .btn { color: inherit; text-decoration: none; }
.cart-item {
  display: grid; gap: 0.45rem; grid-template-columns: 1fr auto auto; align-items: center;
  padding: 0.55rem 0; border-bottom: 1px solid var(--border);
}
.cart-item .qty-input { width: 4.5rem; }
details.diagnostics { margin-top: 0.25rem; }
details.diagnostics > summary {
  cursor: pointer; font-weight: 700; color: var(--brand-dark); list-style: none; padding: 0.35rem 0;
}
details.diagnostics > summary::-webkit-details-marker { display: none; }
.scenario { border: 1px solid var(--border); border-radius: 12px; padding: 0.75rem; margin-bottom: 0.6rem; background: var(--ok-bg); }
.pill { display: inline-block; border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #d1fae5; color: #065f46; }
.footer-note { color: var(--muted); font-size: 0.85rem; margin-top: 1.5rem; }
.hidden { display: none !important; }
@media (max-width: 420px) {
  .groups, .totals { grid-template-columns: 1fr 1fr; }
  .actions { flex-direction: column; }
  button, .btn { width: 100%; text-align: center; }
  .cart-item { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="banner">VERSION CANDIDATE — NE PAS UTILISER POUR DES CLIENTS</div>
<div class="provisional-banner" id="provisional-banner">Aperçu personnalisé : valeurs provisoires non approuvées pour la production</div>
<div class="wrap">
  <header class="hero">
    <img id="brand-logo" src="${logoUrl}" alt="KR Kinetics" width="220" height="88" />
    <div>
      <h1>Calculateur &amp; guide — version candidate</h1>
      <p>Comparez le calcul actuel et un aperçu personnalisé par aliments sélectionnés. Aucune valeur d’aperçu n’est approuvée pour des clients.</p>
    </div>
  </header>

  <section class="panel" id="mode-panel">
    <h2>Mode de calcul</h2>
    <div class="mode-bar" role="radiogroup" aria-label="Mode de calcul">
      <div class="mode-option active" data-mode="legacy-a" id="mode-a" tabindex="0" role="radio" aria-checked="true">
        <strong>Calcul actuel</strong>
        <span>Règles KR Kinetics actuelles. Comportement inchangé pour les plans existants.</span>
      </div>
      <div class="mode-option" data-mode="hybrid-da-rc" id="mode-da" tabindex="0" role="radio" aria-checked="false">
        <strong>Aperçu personnalisé</strong>
        <span>Précision par aliments et familles d’échange. Non approuvé pour la production.</span>
      </div>
    </div>
  </section>

  <section class="panel" id="groups-panel">
    <h2>Portions par groupe — calcul actuel</h2>
    <p class="muted">Ces champs pilotent uniquement le calcul actuel. Ils restent séparés du panier d’aliments.</p>
    <div class="groups" id="group-inputs"></div>
    <div class="actions">
      <button type="button" id="btn-typical">Charger la journée type</button>
      <button type="button" class="secondary" id="btn-reset-groups">Réinitialiser les groupes</button>
    </div>
  </section>

  <section class="panel" id="cart-panel">
    <h2>Panier d’aliments — aperçu personnalisé <span class="muted" id="cart-count">(0)</span></h2>
    <p class="muted">Chaque aliment conserve son identifiant et sa famille d’échange. Aucun clic ne devient une portion générique de groupe.</p>
    <div id="cart-list"></div>
    <div class="actions">
      <button type="button" class="secondary" id="btn-clear-cart">Vider le panier</button>
      <label style="display:flex;gap:.5rem;align-items:center;">
        <input type="checkbox" id="actionable" />
        Plan exploitable (retour explicite au calcul actuel si échantillon insuffisant)
      </label>
    </div>
  </section>

  <section class="grid-2">
    <div class="panel">
      <h2>Totaux — mode actif</h2>
      <div class="totals" id="active-totals"></div>
      <ul class="warn-list" id="active-warnings"></ul>
    </div>
    <div class="panel">
      <h2>Comparaison calcul actuel vs aperçu</h2>
      <div class="totals" id="compare-totals"></div>
      <p class="muted" id="diff-summary"></p>
    </div>
  </section>

  <section class="panel">
    <h2>Détail des lignes</h2>
    <div style="overflow-x:auto;">
      <table class="compare-table" id="lines-table">
        <thead>
          <tr><th>Entrée</th><th>Calcul actuel</th><th>Aperçu</th><th>Exception</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>Guide alimentaire (287 aliments)</h2>
    <div class="links actions">
      <a class="btn secondary" href="./guides/kr-kinetics-landscape-fr.html" target="_blank" rel="noopener">Guide desktop FR</a>
      <a class="btn secondary" href="./guides/kr-kinetics-landscape-en.html" target="_blank" rel="noopener">Guide desktop EN</a>
      <a class="btn secondary" href="./guides/kr-kinetics-mobile-bilingual.html" target="_blank" rel="noopener">Guide mobile bilingue</a>
      <a class="btn secondary" href="./kr-kinetics-guide-landscape-fr-rc.pdf" target="_blank" rel="noopener">PDF desktop FR</a>
      <a class="btn secondary" href="./kr-kinetics-guide-mobile-bilingual-rc.pdf" target="_blank" rel="noopener">PDF mobile</a>
    </div>
  </section>

  <section class="panel">
    <h2>Recherche &amp; filtres</h2>
    <div class="filters">
      <input type="search" id="food-search" placeholder="Rechercher (FR ou EN)" />
      <select id="filter-category" aria-label="Catégorie"><option value="">Toutes catégories</option></select>
      <select id="filter-group" aria-label="Groupe calculateur"><option value="">Tous groupes</option></select>
      <select id="filter-rollup" aria-label="Famille d’échange"><option value="">Toutes familles</option></select>
    </div>
    <p class="muted" id="food-count"></p>
    <div class="food-list" id="food-list"></div>
  </section>

  <section class="panel">
    <details class="diagnostics" id="diagnostics">
      <summary>Diagnostics propriétaire (replié)</summary>
      <p class="muted">Détails techniques pour validation. Hors parcours client.</p>
      <pre id="validation-details" class="muted" style="white-space:pre-wrap;overflow:auto;"></pre>
      <h3>Scénarios de contrôle qualité</h3>
      <div id="scenarios"></div>
    </details>
  </section>

  <p class="footer-note">
    Ce build ne modifie aucun plan client, aucune donnée nutritionnelle individuelle, ni aucune règle de production.
    Calcul actuel = défaut. Aperçu personnalisé = non approuvé.
  </p>
</div>
<script>
const DATA_URL = ${JSON.stringify(dataUrl)};
const NUTRIENT_KEYS = ['proteinG','carbsG','fiberG','fatG','declaredKcal'];
const GROUP_LABELS = {
  protein: 'Protéines', starch: 'Féculents', vegetable: 'Légumes', fruit: 'Fruits',
  dairy: 'Laitiers', fat: 'Lipides', whey: 'Whey'
};
const CATEGORY_LABELS = {
  noix_graines: 'Noix et graines', matieres_grasses: 'Matières grasses', legumes: 'Légumes',
  fruits: 'Fruits', poissons_fruits_mer: 'Poissons et fruits de mer', viandes_volaille: 'Viandes et volaille',
  autres_sources_proteinees: 'Autres sources protéinées', feculents: 'Féculents', produits_laitiers: 'Produits laitiers'
};
const ROUNDING = { proteinG:1, fatG:1, fiberG:1, carbsG:0, declaredKcal:0 };

let DATA = null;
let mode = 'legacy-a';
let portions = { protein:4, starch:4, vegetable:3, fruit:2, dairy:2, fat:3, whey:0 };
/** @type {{foodId:string, quantity:number, exchangeRollupId:string}[]} */
let cart = [];

function roundHalfAwayFromZero(n, decimals=0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * factor) / factor;
}
function formatNum(value, lang='fr') {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) return null;
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
  return DATA.rollups
    .filter(r => r.calculatorBridge?.calculatorGroup === group)
    .filter(r => !r.insufficientSample && (r.foodCount||0) >= 3)
    .sort((a,b) => (b.foodCount-a.foodCount) || a.exchangeRollupId.localeCompare(b.exchangeRollupId))[0] || null;
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
function uniqueWarnings(list) {
  const seen = new Set();
  const out = [];
  for (const warning of list || []) {
    const key = warning.code || warning.messageFr;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(warning);
  }
  return out;
}

function calcLegacyFromGroups() {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, null]));
  const lines = [];
  for (const [group, n] of Object.entries(portions)) {
    const count = Number(n) || 0;
    if (!count) continue;
    const nutrients = legacyFor(group);
    add(totals, nutrients, count);
    lines.push({
      label: (GROUP_LABELS[group] || group) + ' × ' + count,
      nutrients,
      exception: null,
      exchangeRollupId: null,
    });
  }
  return { model: 'legacy-a', totals: normalize(totals), lines, warnings: [], fallbacks: [] };
}

function calcHybridFromCart(actionable) {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, null]));
  const lines = [];
  const warnings = [];
  const fallbacks = [];
  if (!cart.length) {
    warnings.push({ code: 'empty_cart', messageFr: 'Ajoutez des aliments au panier pour l’aperçu personnalisé.' });
    return { model: 'hybrid-da-rc', totals: normalize(totals), lines, warnings, fallbacks };
  }
  for (const item of cart) {
    const food = DATA.foodsById[item.foodId];
    const assignment = DATA.assignmentsByFoodId[item.foodId];
    const rollupId = item.exchangeRollupId || assignment?.exchangeRollupId;
    const rollup = DATA.rollupsById[rollupId];
    const insufficient = !rollup || rollup.insufficientSample || (rollup.foodCount || 0) < 3;
    const preview = roundPreview(rollup?.medianProfile || {});
    let nutrients = preview;
    let exception = null;
    if (insufficient && actionable) {
      const group = food?.calculationGroup || rollup?.calculatorBridge?.calculatorGroup;
      nutrients = legacyFor(group);
      exception = 'Échantillon insuffisant — retour explicite au calcul actuel';
      fallbacks.push(item);
      warnings.push({ code: 'insufficient_fallback', messageFr: exception });
    } else if (insufficient) {
      exception = 'Échantillon insuffisant — valeur provisoire';
      warnings.push({ code: 'insufficient_sample', messageFr: exception });
    }
    add(totals, nutrients, item.quantity);
    lines.push({
      label: (food?.names?.fr || item.foodId) + ' × ' + item.quantity,
      nutrients,
      exception,
      exchangeRollupId: rollupId,
      foodId: item.foodId,
    });
  }
  return { model: 'hybrid-da-rc', totals: normalize(totals), lines, warnings: uniqueWarnings(warnings), fallbacks };
}

function calcLegacyFromCartFoods() {
  // Bit-for-bit A rule applied to selected foods: each food uses its calculationGroup moyennes.
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, null]));
  const lines = [];
  for (const item of cart) {
    const food = DATA.foodsById[item.foodId];
    const group = food?.calculationGroup;
    const nutrients = legacyFor(group);
    add(totals, nutrients, item.quantity);
    lines.push({
      label: (food?.names?.fr || item.foodId) + ' × ' + item.quantity,
      nutrients,
      exception: null,
      exchangeRollupId: null,
      foodId: item.foodId,
    });
  }
  return { model: 'legacy-a', totals: normalize(totals), lines, warnings: [], fallbacks: [] };
}

function renderTotals(el, totals, { showKcal = true, kcalLabel = null } = {}) {
  const macros = [
    ['proteinG', 'Protéines (g)', false],
    ['carbsG', 'Glucides (g)', false],
    ['fatG', 'Lipides (g)', false],
    ['declaredKcal', 'Calories', true],
  ];
  el.innerHTML = macros.map(([key, label, isKcal]) => {
    if (isKcal && !showKcal) {
      return '<div class="stat"><div class="label">'+label+'</div><div class="value na">'+(kcalLabel || 'Non disponible dans le calcul actuel')+'</div></div>';
    }
    const text = formatNum(totals?.[key]);
    if (isKcal && text == null) {
      return '<div class="stat"><div class="label">'+label+'</div><div class="value na">Non disponible dans le calcul actuel</div></div>';
    }
    return '<div class="stat"><div class="label">'+label+'</div><div class="value">'+(text ?? '—')+'</div></div>';
  }).join('');
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('.mode-option').forEach((el) => {
    const active = el.dataset.mode === mode;
    el.classList.toggle('active', active);
    el.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  document.getElementById('provisional-banner').classList.toggle('hidden', mode !== 'hybrid-da-rc');
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

function addToCart(foodId) {
  const assignment = DATA.assignmentsByFoodId[foodId];
  if (!assignment) return;
  const existing = cart.find((item) => item.foodId === foodId);
  if (existing) existing.quantity += 1;
  else cart.push({ foodId, quantity: 1, exchangeRollupId: assignment.exchangeRollupId });
  render();
}

function renderCart() {
  document.getElementById('cart-count').textContent = '(' + cart.reduce((n, i) => n + i.quantity, 0) + ' sélectionnés · ' + cart.length + ' aliments)';
  const root = document.getElementById('cart-list');
  if (!cart.length) {
    root.innerHTML = '<p class="muted">Panier vide. Utilisez « +1 » dans la recherche pour ajouter un aliment précis.</p>';
    return;
  }
  root.innerHTML = cart.map((item, index) => {
    const food = DATA.foodsById[item.foodId];
    return '<div class="cart-item" data-index="'+index+'">'+
      '<div><strong>'+(food?.names?.fr || item.foodId)+'</strong><div class="muted">'+(food?.names?.en || '')+'</div></div>'+
      '<input class="qty-input" type="number" min="1" step="1" value="'+item.quantity+'" data-qty="'+index+'" aria-label="Quantité" />'+
      '<button type="button" class="secondary" data-remove="'+index+'">Retirer</button>'+
    '</div>';
  }).join('');
  root.querySelectorAll('[data-qty]').forEach((input) => {
    input.addEventListener('input', () => {
      const idx = Number(input.getAttribute('data-qty'));
      cart[idx].quantity = Math.max(1, Number(input.value) || 1);
      render();
    });
  });
  root.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart.splice(Number(btn.getAttribute('data-remove')), 1);
      render();
    });
  });
}

function fillFilters() {
  const cats = [...new Set(DATA.foods.map(f => f.displayCategory))].sort();
  const groups = [...new Set(DATA.foods.map(f => f.calculationGroup))].sort();
  const rollups = DATA.rollups.map(r => r.exchangeRollupId).sort();
  document.getElementById('filter-category').innerHTML += cats.map(c =>
    '<option value="'+c+'">'+(CATEGORY_LABELS[c] || c)+'</option>').join('');
  document.getElementById('filter-group').innerHTML += groups.map(c =>
    '<option value="'+c+'">'+(GROUP_LABELS[c] || c)+'</option>').join('');
  document.getElementById('filter-rollup').innerHTML += rollups.map(c =>
    '<option value="'+c+'">'+c.replace(/^rollup-/, '')+'</option>').join('');
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
  document.getElementById('food-count').textContent = rows.length + ' / ' + DATA.foods.length + ' aliments affichés';
  document.getElementById('food-list').innerHTML = rows.slice(0, 120).map((food) => {
    const a = DATA.assignmentsByFoodId[food.id];
    return '<div class="food-row">'+
      '<div><strong>'+(food.names?.fr || food.id)+'</strong><div class="muted">'+(food.names?.en || '')+' · '+(GROUP_LABELS[food.calculationGroup]||food.calculationGroup)+'</div></div>'+
      '<button type="button" class="secondary" data-add="'+food.id+'">+1</button>'+
    '</div>';
  }).join('');
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.getAttribute('data-add')));
  });
}

function renderScenarios() {
  const root = document.getElementById('scenarios');
  root.innerHTML = (DATA.scenarios || []).map((s) => {
    const totals = s.totals;
    const line = totals?.legacy
      ? 'A P '+ (formatNum(totals.legacy.proteinG) ?? '—') +' / G '+ (formatNum(totals.legacy.carbsG) ?? '—') +' / L '+ (formatNum(totals.legacy.fatG) ?? '—')
        + ' · aperçu P '+ (formatNum(totals.hybrid.proteinG) ?? '—')
      : (totals?.a1 ? 'Aller-retour A conservé' : JSON.stringify(totals));
    return '<div class="scenario"><div><span class="pill">'+s.result+'</span> <strong>'+s.titleFr+'</strong></div><div class="muted">'+line+'</div></div>';
  }).join('');
}

function render() {
  const actionable = document.getElementById('actionable').checked;
  renderCart();
  const legacyGroups = calcLegacyFromGroups();
  const hybridCart = calcHybridFromCart(actionable);
  const legacyCart = cart.length ? calcLegacyFromCartFoods() : legacyGroups;
  const active = mode === 'legacy-a' ? legacyGroups : hybridCart;
  const compareA = cart.length ? legacyCart : legacyGroups;
  const compareDA = hybridCart;

  renderTotals(document.getElementById('active-totals'), active.totals, {
    showKcal: mode === 'hybrid-da-rc',
    kcalLabel: 'Non disponible dans le calcul actuel',
  });
  document.getElementById('active-warnings').innerHTML = uniqueWarnings(active.warnings)
    .map(w => '<li>'+w.messageFr+'</li>').join('');

  const aKcal = compareA.totals.declaredKcal;
  const daKcal = compareDA.totals.declaredKcal;
  const kcalComparable = typeof aKcal === 'number' && typeof daKcal === 'number';
  document.getElementById('compare-totals').innerHTML = [
    ['Actuel · P', formatNum(compareA.totals.proteinG)],
    ['Aperçu · P', formatNum(compareDA.totals.proteinG)],
    ['Actuel · G', formatNum(compareA.totals.carbsG)],
    ['Aperçu · G', formatNum(compareDA.totals.carbsG)],
    ['Actuel · L', formatNum(compareA.totals.fatG)],
    ['Aperçu · L', formatNum(compareDA.totals.fatG)],
    ['Actuel · kcal', null],
    ['Aperçu · kcal', formatNum(daKcal)],
  ].map(([label, value], idx) => {
    if (label === 'Actuel · kcal') {
      return '<div class="stat"><div class="label">'+label+'</div><div class="value na">Non disponible dans le calcul actuel</div></div>';
    }
    return '<div class="stat"><div class="label">'+label+'</div><div class="value">'+(value ?? '—')+'</div></div>';
  }).join('');

  const dP = (compareDA.totals.proteinG??0)-(compareA.totals.proteinG??0);
  const dG = (compareDA.totals.carbsG??0)-(compareA.totals.carbsG??0);
  const dL = (compareDA.totals.fatG??0)-(compareA.totals.fatG??0);
  document.getElementById('diff-summary').textContent = kcalComparable
    ? ('Écart aperçu − actuel : P '+formatNum(dP)+' · G '+formatNum(dG)+' · L '+formatNum(dL)+' · kcal '+formatNum(daKcal - aKcal))
    : ('Écart aperçu − actuel : P '+formatNum(dP)+' · G '+formatNum(dG)+' · L '+formatNum(dL)+' · calories non comparables (absentes du calcul actuel)');

  const tbody = document.querySelector('#lines-table tbody');
  const max = Math.max(compareA.lines.length, compareDA.lines.length);
  const rows = [];
  for (let i = 0; i < max; i += 1) {
    const a = compareA.lines[i];
    const h = compareDA.lines[i];
    const fmt = (n) => n ? ('P '+(formatNum(n.proteinG)??'—')+' / G '+(formatNum(n.carbsG)??'—')+' / L '+(formatNum(n.fatG)??'—')) : '—';
    rows.push('<tr><td>'+(h?.label || a?.label || '—')+'</td><td>'+fmt(a?.nutrients)+'</td><td>'+fmt(h?.nutrients)+'</td><td class="muted">'+(h?.exception || '—')+'</td></tr>');
  }
  tbody.innerHTML = rows.join('') || '<tr><td colspan="4" class="muted">Aucune ligne</td></tr>';

  document.getElementById('validation-details').textContent = JSON.stringify({
    calculationModelVersion: mode,
    labels: { active: mode === 'legacy-a' ? 'Calcul actuel' : 'Aperçu personnalisé' },
    portions,
    cart,
    actionable,
    activeTotals: active.totals,
    fallbacks: hybridCart.fallbacks,
    warnings: hybridCart.warnings,
  }, null, 2);
}

async function boot() {
  const res = await fetch(DATA_URL);
  DATA = await res.json();
  buildGroupInputs();
  fillFilters();
  renderFoods();
  renderScenarios();
  document.getElementById('provisional-banner').classList.add('hidden');
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
  document.getElementById('btn-reset-groups').addEventListener('click', () => {
    portions = { protein:0, starch:0, vegetable:0, fruit:0, dairy:0, fat:0, whey:0 };
    buildGroupInputs();
    render();
  });
  document.getElementById('btn-clear-cart').addEventListener('click', () => { cart = []; render(); });
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
