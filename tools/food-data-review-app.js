import {
  DISPLAY_CATEGORIES,
  CALCULATION_GROUPS,
  PORTION_UNITS,
  PREPARATION_STATES,
  SOURCE_TYPES,
  MANUAL_STATUSES,
  CLASSIFICATION_STATUSES,
} from '../src/lib/nutrition-constants.mjs';
import { auditFood, canMarkVerified, calculatedKcal } from '../src/lib/food-audit-core.mjs';

const state = {
  data: null,
  selectedId: null,
  dirty: new Set(),
  originals: new Map(),
};

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

function foods() {
  return state.data?.foods || [];
}

function selected() {
  return foods().find((f) => f.id === state.selectedId) || null;
}

function ensureShapes(food) {
  food.verification = food.verification || {
    status: food.status || 'unverified',
    verifiedAt: null,
    verifiedBy: null,
    datasetVersion: null,
  };
  food.source = food.source || {
    type: null,
    name: null,
    recordId: null,
    url: null,
    accessedAt: null,
    servingDescription: null,
    nutrientsBasis: null,
    notes: null,
  };
  food.legacySource = food.legacySource ?? null;
  food.auditResolutions = food.auditResolutions || [];
  food.history = food.history || [];
  food.exchangeProfileId = food.exchangeProfileId ?? null;
  food.classificationStatus = food.classificationStatus || 'pending';
  if (food.portion && food.portion.grams === '') food.portion.grams = null;
}

function reevaluateVerified(food) {
  if (food.status !== 'verified' && food.verification?.status !== 'verified') return;
  const result = auditFood(food);
  if (!canMarkVerified(food, result.alerts)) {
    food.status = 'unverified';
    food.verification.status = 'unverified';
    food.verification.verifiedAt = null;
    food.verification.verifiedBy = null;
    const reason = 'Auto-reverted to unverified after edit introduced blocking issues or invalid source';
    food.source.notes = [food.source.notes, reason].filter(Boolean).join(' | ');
    food.history.push({ at: new Date().toISOString(), action: 'auto_unverify', reason });
  }
}

function markDirty(food) {
  ensureShapes(food);
  reevaluateVerified(food);
  const orig = state.originals.get(food.id);
  if (JSON.stringify(food) !== orig) state.dirty.add(food.id);
  else state.dirty.delete(food.id);
  refreshVerifyButton();
}

function initFrom(payload) {
  state.data = deepClone(payload);
  state.dirty.clear();
  state.originals.clear();
  for (const f of state.data.foods) {
    ensureShapes(f);
    state.originals.set(f.id, JSON.stringify(f));
  }
  const cats = [...new Set(state.data.foods.map((f) => f.displayCategory))].sort();
  const sel = document.getElementById('filterCat');
  sel.innerHTML =
    '<option value="">Toutes catégories</option>' +
    cats.map((c) => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('headerMeta').textContent =
    `${state.data.foods.length} aliments · schema ${state.data.meta?.schemaVersion ?? '?'} · verified uniquement via bouton`;
  renderList();
  if (state.selectedId) renderEditor();
}

function renderList() {
  const q = document.getElementById('search').value.toLowerCase();
  const cat = document.getElementById('filterCat').value;
  const err = document.getElementById('filterErr').value;
  const status = document.getElementById('filterStatus').value;
  const box = document.getElementById('list');
  box.innerHTML = '';
  for (const f of foods()) {
    ensureShapes(f);
    const alerts = auditFood(f).alerts;
    const hasE = alerts.some((a) => a.severity === 'ERROR' && a.resolutionStatus !== 'resolved_documented');
    const hasW = alerts.some((a) => a.severity === 'WARNING');
    const dirty = state.dirty.has(f.id);
    if (q && !`${f.names.fr} ${f.names.en} ${f.id}`.toLowerCase().includes(q)) continue;
    if (cat && f.displayCategory !== cat) continue;
    if (status && f.status !== status) continue;
    if (err === 'ERROR' && !hasE) continue;
    if (err === 'WARNING' && (hasE || !hasW)) continue;
    if (err === 'OK' && (hasE || hasW)) continue;
    if (err === 'DIRTY' && !dirty) continue;
    const el = document.createElement('div');
    el.className = 'item' + (f.id === state.selectedId ? ' active' : '');
    el.innerHTML = `
      <div class="t1">${f.names.fr || f.id}</div>
      <div class="t2">${f.displayCategory} · ${f.calculationGroup} · ${f.status}</div>
      <div style="margin-top:6px">
        ${hasE ? '<span class="badge err">ERROR</span>' : hasW ? '<span class="badge warn">WARNING</span>' : '<span class="badge ok">OK</span>'}
        ${dirty ? '<span class="badge dirty">modifié</span>' : ''}
      </div>`;
    el.onclick = () => {
      state.selectedId = f.id;
      renderList();
      renderEditor();
    };
    box.appendChild(el);
  }
}

function refreshVerifyButton() {
  const f = selected();
  const btn = document.getElementById('btnVerify');
  if (!f) {
    btn.disabled = true;
    return;
  }
  btn.disabled = !canMarkVerified(f);
}

function field(label, value, onChange, type = 'text', options = null) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lab = document.createElement('label');
  lab.textContent = label;
  let input;
  if (type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else if (type === 'select') {
    input = document.createElement('select');
    for (const opt of options || []) {
      const o = document.createElement('option');
      o.value = opt === null ? '' : String(opt);
      o.textContent = opt === null ? '—' : String(opt);
      input.appendChild(o);
    }
  } else {
    input = document.createElement('input');
    input.type = type;
  }
  input.value = value == null ? '' : value;
  input.addEventListener('input', () => {
    let v = input.value;
    if (type === 'number') v = v === '' ? null : Number(v);
    else if (type === 'select' && v === '') v = null;
    onChange(v);
    wrap.classList.add('changed');
    markDirty(selected());
    renderList();
    refreshKcalAndAlerts();
  });
  wrap.append(lab, input);
  return wrap;
}

function refreshKcalAndAlerts() {
  const f = selected();
  if (!f) return;
  const result = auditFood(f);
  const el = document.getElementById('kcalInfo');
  const calc = calculatedKcal(f.nutrients);
  const declared = f.nutrients.declaredKcal;
  const abs = calc != null && declared != null ? Math.abs(declared - calc) : null;
  if (el) {
    el.innerHTML = `
      <div>Déclarées: <strong>${declared ?? '—'}</strong></div>
      <div>Atwater 4-4-9: <strong>${calc == null ? '—' : calc.toFixed(1)}</strong></div>
      <div>Δ: <strong>${abs == null ? '—' : abs.toFixed(1)}</strong></div>
      <div>Peut être verified: <strong>${canMarkVerified(f, result.alerts) ? 'oui' : 'non'}</strong></div>`;
  }
  const list = document.getElementById('alertList');
  if (list) {
    list.innerHTML =
      result.alerts
        .map((a) => {
          const res =
            a.resolutionStatus === 'resolved_documented' ? ' — résolue et documentée' : '';
          return `<li class="${a.severity[0]}">[${a.severity}] ${a.code}: ${a.message}${res}</li>`;
        })
        .join('') || '<li>Aucune alerte</li>';
  }
  refreshVerifyButton();
}

function renderEditor() {
  const f = selected();
  const main = document.getElementById('main');
  if (!f) {
    main.innerHTML = '<div class="empty">Sélectionnez un aliment</div>';
    return;
  }
  ensureShapes(f);
  main.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'section';
  top.innerHTML = `<h2>${f.names.fr || f.id}</h2>
    <div class="kcal-box" id="kcalInfo"></div>
    <ul class="alert-list" id="alertList" style="margin-top:12px"></ul>`;
  main.appendChild(top);

  const identity = document.createElement('div');
  identity.className = 'section';
  identity.innerHTML = '<h2>Identité</h2>';
  const g1 = document.createElement('div');
  g1.className = 'grid';
  const idField = field('ID (lecture seule)', f.id, () => {});
  idField.querySelector('input').disabled = true;
  // MANUAL statuses only — verified excluded from dropdown
  g1.append(
    idField,
    field('Statut (manuel)', f.status === 'verified' ? 'unverified' : f.status, (v) => {
      if (v === 'verified') return; // hard block
      f.status = v;
      f.verification.status = v;
    }, 'select', MANUAL_STATUSES),
    field('Nom FR', f.names.fr, (v) => { f.names.fr = v; }),
    field('Nom EN', f.names.en, (v) => { f.names.en = v; }),
    field('Catégorie visible', f.displayCategory, (v) => { f.displayCategory = v; }, 'select', DISPLAY_CATEGORIES),
    field('Groupe calcul', f.calculationGroup, (v) => { f.calculationGroup = v; }, 'select', CALCULATION_GROUPS),
    field('exchangeProfileId', f.exchangeProfileId, (v) => { f.exchangeProfileId = v; }),
    field('classificationStatus', f.classificationStatus, (v) => { f.classificationStatus = v; }, 'select', CLASSIFICATION_STATUSES)
  );
  // If currently verified, show read-only badge via meta text
  if (f.status === 'verified') {
    const note = document.createElement('p');
    note.style.cssText = 'grid-column:1/-1;color:var(--ok);font-size:12px';
    note.textContent = 'Statut actuel: verified (non sélectionnable dans le menu — utiliser Rejeter ou modifier pour auto-unverify)';
    g1.appendChild(note);
  }
  identity.appendChild(g1);
  main.appendChild(identity);

  const portion = document.createElement('div');
  portion.className = 'section';
  portion.innerHTML = '<h2>Portion</h2>';
  const g2 = document.createElement('div');
  g2.className = 'grid';
  g2.append(
    field('Label FR', f.portion.labelFr, (v) => { f.portion.labelFr = v; }),
    field('Label EN', f.portion.labelEn, (v) => { f.portion.labelEn = v; }),
    field('Quantité', f.portion.amount, (v) => { f.portion.amount = v; }, 'number'),
    field('Unité', f.portion.unit, (v) => { f.portion.unit = v; }, 'select', PORTION_UNITS),
    field('Grammes', f.portion.grams, (v) => { f.portion.grams = v; }, 'number'),
    field('État préparation', f.portion.preparationState, (v) => { f.portion.preparationState = v; }, 'select', [null, ...PREPARATION_STATES]),
    field('Marque', f.portion.brand, (v) => { f.portion.brand = v; })
  );
  portion.appendChild(g2);
  main.appendChild(portion);

  const nutrients = document.createElement('div');
  nutrients.className = 'section';
  nutrients.innerHTML = '<h2>Nutriments</h2>';
  const g3 = document.createElement('div');
  g3.className = 'grid';
  g3.append(
    field('Protéines (g)', f.nutrients.proteinG, (v) => { f.nutrients.proteinG = v; }, 'number'),
    field('Glucides (g)', f.nutrients.carbsG, (v) => { f.nutrients.carbsG = v; }, 'number'),
    field('Fibres (g)', f.nutrients.fiberG, (v) => { f.nutrients.fiberG = v; }, 'number'),
    field('Lipides totaux (g)', f.nutrients.fatG, (v) => { f.nutrients.fatG = v; }, 'number'),
    field('Saturés (g)', f.nutrients.saturatedFatG, (v) => { f.nutrients.saturatedFatG = v; }, 'number'),
    field('Poly (g)', f.nutrients.polyunsaturatedFatG, (v) => { f.nutrients.polyunsaturatedFatG = v; }, 'number'),
    field('Mono (g)', f.nutrients.monounsaturatedFatG, (v) => { f.nutrients.monounsaturatedFatG = v; }, 'number'),
    field('Calories déclarées', f.nutrients.declaredKcal, (v) => { f.nutrients.declaredKcal = v; }, 'number')
  );
  nutrients.appendChild(g3);
  main.appendChild(nutrients);

  const source = document.createElement('div');
  source.className = 'section';
  source.innerHTML = '<h2>Source authoritative (requis pour verified)</h2>';
  const g4 = document.createElement('div');
  g4.className = 'grid';
  g4.append(
    field('source.type', f.source.type, (v) => { f.source.type = v; }, 'select', [null, ...SOURCE_TYPES]),
    field('source.name', f.source.name, (v) => { f.source.name = v; }),
    field('recordId', f.source.recordId, (v) => { f.source.recordId = v; }),
    field('url', f.source.url, (v) => { f.source.url = v; }),
    field('accessedAt', f.source.accessedAt, (v) => { f.source.accessedAt = v; }, 'date'),
    field('servingDescription', f.source.servingDescription, (v) => { f.source.servingDescription = v; }),
    field('nutrientsBasis', f.source.nutrientsBasis, (v) => { f.source.nutrientsBasis = v; }),
    field('notes', f.source.notes, (v) => { f.source.notes = v; }, 'textarea'),
    field('brand (étiquette)', f.source.brand, (v) => { f.source.brand = v; }),
    field('productName', f.source.productName, (v) => { f.source.productName = v; }),
    field('labelServingSize', f.source.labelServingSize, (v) => { f.source.labelServingSize = v; }),
    field('evidenceRef', f.source.evidenceRef, (v) => { f.source.evidenceRef = v; })
  );
  source.appendChild(g4);
  const legacy = document.createElement('p');
  legacy.style.cssText = 'color:var(--muted);font-size:12px;margin-top:10px';
  legacy.textContent = `legacySource: ${f.legacySource?.reference || '—'} (${f.legacySource?.referenceId || ''}) — ne permet PAS verified`;
  source.appendChild(legacy);
  main.appendChild(source);

  refreshKcalAndAlerts();
}

document.getElementById('search').oninput = renderList;
document.getElementById('filterCat').onchange = renderList;
document.getElementById('filterErr').onchange = renderList;
document.getElementById('filterStatus').onchange = renderList;

document.getElementById('btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'food-equivalents.corrected.json';
  a.click();
};

document.getElementById('importFile').onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  initFrom(JSON.parse(await file.text()));
};

document.getElementById('btnReject').onclick = () => {
  const f = selected();
  if (!f) return;
  f.status = 'rejected';
  f.verification.status = 'rejected';
  f.verification.verifiedAt = null;
  f.verification.verifiedBy = null;
  f.history.push({ at: new Date().toISOString(), action: 'reject' });
  markDirty(f);
  renderList();
  renderEditor();
};

document.getElementById('btnVerify').onclick = () => {
  const f = selected();
  if (!f) return;
  const result = auditFood(f);
  if (!canMarkVerified(f, result.alerts)) {
    alert('Impossible: source authoritative, portion complète, lipides totaux, deux langues et aucune ERROR ouverte sont requis. La source legacy ne suffit pas.');
    return;
  }
  const who = prompt('Nom de la personne qui valide :');
  if (!who) return;
  f.status = 'verified';
  f.verification.status = 'verified';
  f.verification.verifiedAt = new Date().toISOString();
  f.verification.verifiedBy = who;
  f.verification.datasetVersion = window.FOOD_AUDIT_SUMMARY?.version?.version || null;
  f.version = (f.version || 1) + 1;
  f.history.push({
    at: f.verification.verifiedAt,
    action: 'verify',
    by: who,
    version: f.version,
  });
  markDirty(f);
  renderList();
  renderEditor();
};

// Expose for tests
window.__REVIEW_TEST__ = {
  MANUAL_STATUSES,
  canMarkVerified,
  auditFood,
  initFrom,
  getState: () => state,
};

if (window.FOOD_EQUIVALENTS_DATA) initFrom(window.FOOD_EQUIVALENTS_DATA);
else {
  document.getElementById('headerMeta').textContent =
    'Aucune donnée embarquée. Lancez npm run data:audit, ou importez un JSON.';
}
