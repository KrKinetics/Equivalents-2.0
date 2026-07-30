import {
  auditDataset,
  canMarkVerified,
  calculatedKcal,
  RESOLVABLE_CODES,
  resolutionSnapshotHash,
  validateSource,
} from '../src/lib/food-audit-core.mjs';
import { getFoodStatus, setFoodStatus } from '../src/lib/food-status.mjs';
import {
  DISPLAY_CATEGORIES,
  CALCULATION_GROUPS,
  PORTION_UNITS,
  PREPARATION_STATES,
  SOURCE_TYPES,
  MANUAL_STATUSES,
  CLASSIFICATION_STATUSES,
  NUTRIENTS_BASIS,
} from '../src/lib/nutrition-constants.mjs';

const state = {
  data: null,
  audit: { summary: {}, items: [], byId: {} },
  selectedId: null,
  dirty: new Set(),
  originals: new Map(),
  lastExportAt: null,
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const foods = () => state.data?.foods || [];
const selected = () => foods().find((food) => food.id === state.selectedId) || null;
const selectedAudit = () => state.audit.byId[selected()?.id] || null;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureShapes(food) {
  if (!food.verification || typeof food.verification !== 'object') {
    food.verification = {
      status: food.status || 'unverified',
      verifiedAt: null,
      verifiedBy: null,
      datasetVersion: null,
    };
  }
  food.source ||= {};
  for (const key of [
    'type', 'name', 'recordId', 'url', 'doi', 'accessedAt', 'servingDescription',
    'nutrientsBasis', 'notes', 'brand', 'productName', 'labelServingSize', 'evidenceRef',
  ]) {
    food.source[key] ??= null;
  }
  food.auditResolutions ||= [];
  food.history ||= [];
  food.exchangeProfileId ??= null;
  food.classificationStatus ||= 'pending';
  if (food.portion?.grams === '') food.portion.grams = null;
}

function refreshHeader() {
  const header = document.getElementById('headerMeta');
  if (!header || !state.data) return;
  const exported = state.lastExportAt
    ? ` · dernier export ${new Date(state.lastExportAt).toLocaleString('fr-CA')}`
    : '';
  header.textContent =
    `${foods().length} aliments · schema ${state.data.meta?.schemaVersion ?? '?'} · ` +
    `${state.dirty.size} modification(s) non exportée(s)${exported}`;
}

function refreshAudit() {
  state.audit = auditDataset(foods());
  refreshHeader();
  return state.audit;
}

function updateDirty(food) {
  const original = state.originals.get(food.id);
  if (JSON.stringify(food) === original) state.dirty.delete(food.id);
  else state.dirty.add(food.id);
  refreshHeader();
}

function invalidateVerifiedAfterEdit(food) {
  if (getFoodStatus(food) !== 'verified') return false;
  const item = state.audit.byId[food.id];
  if (item && canMarkVerified(food, item.alerts)) return false;
  setFoodStatus(food, 'unverified');
  food.history.push({
    at: new Date().toISOString(),
    action: 'auto_unverify',
    reason: 'Edit made the verified status invalid under the shared audit rules',
  });
  refreshAudit();
  return true;
}

function afterMutation(food, { checkVerified = true } = {}) {
  ensureShapes(food);
  refreshAudit();
  if (checkVerified) invalidateVerifiedAfterEdit(food);
  updateDirty(food);
  renderList();
  refreshKcalAndAlerts();
}

function initFrom(payload) {
  if (!payload || !Array.isArray(payload.foods)) throw new Error('JSON invalide: foods[] requis');
  state.data = clone(payload);
  state.dirty.clear();
  state.originals.clear();
  state.selectedId = null;
  state.lastExportAt = null;
  for (const food of foods()) {
    ensureShapes(food);
    state.originals.set(food.id, JSON.stringify(food));
  }
  refreshAudit();

  const categories = [...new Set(foods().map((food) => food.displayCategory))].sort();
  document.getElementById('filterCat').innerHTML =
    '<option value="">Toutes catégories</option>' +
    categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
  renderList();
  renderEditor();
}

function renderList() {
  const query = document.getElementById('search').value.toLowerCase();
  const category = document.getElementById('filterCat').value;
  const severity = document.getElementById('filterErr').value;
  const status = document.getElementById('filterStatus').value;
  const list = document.getElementById('list');
  list.innerHTML = '';

  for (const food of foods()) {
    const item = state.audit.byId[food.id];
    if (!item) continue;
    const hasError = item.errorCount > 0;
    const hasWarning = item.warningCount > 0;
    const dirty = state.dirty.has(food.id);
    if (query && !`${item.nameFr} ${item.nameEn} ${food.id}`.toLowerCase().includes(query)) continue;
    if (category && food.displayCategory !== category) continue;
    if (status && getFoodStatus(food) !== status) continue;
    if (severity === 'ERROR' && !hasError) continue;
    if (severity === 'WARNING' && (hasError || !hasWarning)) continue;
    if (severity === 'OK' && (hasError || hasWarning)) continue;
    if (severity === 'DIRTY' && !dirty) continue;

    const element = document.createElement('div');
    element.className = `item${food.id === state.selectedId ? ' active' : ''}`;
    element.innerHTML = `
      <div class="t1">${esc(item.nameFr || food.id)}</div>
      <div class="t2">${esc(item.displayCategory)} · ${esc(item.calculationGroup)} · ${esc(item.status)}</div>
      <div style="margin-top:6px">
        ${hasError ? '<span class="badge err">ERROR</span>' : hasWarning ? '<span class="badge warn">WARNING</span>' : '<span class="badge ok">OK</span>'}
        ${dirty ? '<span class="badge dirty">modifié</span>' : ''}
      </div>`;
    element.onclick = () => {
      state.selectedId = food.id;
      renderList();
      renderEditor();
    };
    list.appendChild(element);
  }
}

function field(label, value, onChange, type = 'text', options = null) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const caption = document.createElement('label');
  caption.textContent = label;
  const input = type === 'textarea' ? document.createElement('textarea') : document.createElement(type === 'select' ? 'select' : 'input');
  if (type === 'textarea') input.rows = 3;
  else if (type === 'select') {
    for (const option of options || []) {
      const element = document.createElement('option');
      element.value = option == null ? '' : String(option);
      element.textContent = option == null ? '—' : String(option);
      input.appendChild(element);
    }
  } else input.type = type;
  input.value = value == null ? '' : value;
  input.addEventListener(type === 'select' ? 'change' : 'input', () => {
    let next = input.value;
    if (type === 'number') next = next === '' ? null : Number(next);
    else if (type === 'select' && next === '') next = null;
    onChange(next);
    wrapper.classList.add('changed');
    afterMutation(selected());
  });
  wrapper.append(caption, input);
  return wrapper;
}

function preview(value) {
  if (!value) return '—';
  return `amount=${value.amount ?? '—'}, unit=${value.unit ?? '—'}, grams=${value.grams ?? '—'}`;
}

function refreshKcalAndAlerts() {
  const food = selected();
  const item = selectedAudit();
  if (!food || !item) return;
  const kcal = document.getElementById('kcalInfo');
  const calculated = calculatedKcal(food.nutrients);
  const declared = food.nutrients.declaredKcal;
  const difference = calculated != null && declared != null ? Math.abs(declared - calculated) : null;
  if (kcal) {
    kcal.innerHTML = `
      <div>Déclarées: <strong>${declared ?? '—'}</strong></div>
      <div>Atwater 4-4-9: <strong>${calculated == null ? '—' : calculated.toFixed(1)}</strong></div>
      <div>Δ: <strong>${difference == null ? '—' : difference.toFixed(1)}</strong></div>
      <div>Peut être verified: <strong>${canMarkVerified(food, item.alerts) ? 'oui' : 'non'}</strong></div>`;
  }
  const alerts = document.getElementById('alertList');
  if (alerts) {
    alerts.innerHTML = item.alerts.map((alert) => {
      const resolution = alert.resolutionStatus === 'resolved_documented'
        ? ' — résolue et documentée'
        : alert.resolutionStatus === 'stale' ? ' — résolution périmée' : '';
      return `<li class="${esc(alert.severity[0])}">[${esc(alert.severity)}] ${esc(alert.code)}: ${esc(alert.message)}${resolution}</li>`;
    }).join('') || '<li>Aucune alerte</li>';
  }
  const verify = document.getElementById('btnVerify');
  if (verify) verify.disabled = !canMarkVerified(food, item.alerts);
}

function renderResolutionSection(food, item) {
  const section = document.createElement('div');
  section.className = 'section';
  section.innerHTML = '<h2>Résolution documentée d’une alerte</h2>';
  const codes = [...new Set(item.alerts
    .filter((alert) => RESOLVABLE_CODES.has(alert.code) && alert.resolutionStatus !== 'resolved_documented')
    .map((alert) => alert.code))];
  if (!codes.length) {
    section.insertAdjacentHTML('beforeend', '<p class="muted">Aucune alerte résoluble ouverte.</p>');
    return section;
  }

  const form = document.createElement('div');
  form.className = 'grid';
  const values = { code: codes[0], reason: '', approvedBy: '', approvedAt: '', sourceReferenceId: '' };
  const add = (label, key, type = 'text', options = null) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    const caption = document.createElement('label');
    caption.textContent = label;
    const input = document.createElement(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
    if (type === 'select') {
      for (const option of options) {
        const node = document.createElement('option');
        node.value = option;
        node.textContent = option;
        input.appendChild(node);
      }
    } else {
      input.type = type;
      if (type === 'textarea') input.rows = 3;
    }
    input.addEventListener(type === 'select' ? 'change' : 'input', () => { values[key] = input.value; });
    wrapper.append(caption, input);
    form.appendChild(wrapper);
  };
  add('Code', 'code', 'select', codes);
  add('Raison', 'reason', 'textarea');
  add('Approuvé par', 'approvedBy');
  add('Date d’approbation', 'approvedAt', 'date');
  add('ID de référence source', 'sourceReferenceId');
  section.appendChild(form);

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Enregistrer la résolution';
  save.style.marginTop = '12px';
  save.onclick = () => {
    if (!values.reason.trim() || !values.approvedBy.trim() || !values.approvedAt || !values.sourceReferenceId.trim()) {
      alert('Tous les champs de résolution sont requis.');
      return;
    }
    food.auditResolutions.push({
      code: values.code,
      reason: values.reason.trim(),
      approvedBy: values.approvedBy.trim(),
      approvedAt: values.approvedAt,
      sourceReferenceId: values.sourceReferenceId.trim(),
      fieldsHash: resolutionSnapshotHash(values.code, food),
    });
    food.version = (food.version || 1) + 1;
    food.history.push({
      at: new Date().toISOString(),
      action: 'document_audit_resolution',
      code: values.code,
      by: values.approvedBy.trim(),
      version: food.version,
    });
    afterMutation(food);
    renderEditor();
  };
  section.appendChild(save);
  return section;
}

function renderEditor() {
  const food = selected();
  const item = selectedAudit();
  const main = document.getElementById('main');
  if (!food || !item) {
    main.innerHTML = '<div class="empty">Sélectionnez un aliment</div>';
    document.getElementById('btnVerify').disabled = true;
    return;
  }
  ensureShapes(food);
  main.innerHTML = `
    <div class="section">
      <h2>${esc(item.nameFr || food.id)}</h2>
      <div class="kcal-box" id="kcalInfo"></div>
      <ul class="alert-list" id="alertList" style="margin-top:12px"></ul>
    </div>`;

  const identity = document.createElement('div');
  identity.className = 'section';
  identity.innerHTML = '<h2>Identité</h2>';
  const identityGrid = document.createElement('div');
  identityGrid.className = 'grid';
  const id = field('ID (lecture seule)', food.id, () => {});
  id.querySelector('input').disabled = true;
  identityGrid.append(
    id,
    field('Statut (manuel)', MANUAL_STATUSES.includes(getFoodStatus(food)) ? getFoodStatus(food) : 'unverified', (value) => {
      setFoodStatus(food, value);
      food.history.push({ at: new Date().toISOString(), action: 'manual_status', status: value });
    }, 'select', MANUAL_STATUSES),
    field('Nom FR', food.names.fr, (value) => { food.names.fr = value; }),
    field('Nom EN', food.names.en, (value) => { food.names.en = value; }),
    field('Catégorie visible', food.displayCategory, (value) => { food.displayCategory = value; }, 'select', DISPLAY_CATEGORIES),
    field('Groupe calcul', food.calculationGroup, (value) => { food.calculationGroup = value; }, 'select', CALCULATION_GROUPS),
    field('exchangeProfileId', food.exchangeProfileId, (value) => { food.exchangeProfileId = value; }),
    field('classificationStatus', food.classificationStatus, (value) => { food.classificationStatus = value; }, 'select', CLASSIFICATION_STATUSES),
  );
  if (getFoodStatus(food) === 'verified') {
    identityGrid.insertAdjacentHTML('beforeend', '<p class="verified-note">Statut actuel: verified — utilisez les boutons pour le modifier.</p>');
  }
  identity.appendChild(identityGrid);
  main.appendChild(identity);

  const portion = document.createElement('div');
  portion.className = 'section';
  portion.innerHTML = `<h2>Portion canonique et aperçus analysés</h2>
    <div class="preview">
      <div>Canonique: <strong>amount=${esc(item.amount ?? '—')}, unit=${esc(item.unit ?? '—')}, grams=${esc(item.grams ?? '—')}</strong></div>
      <div>FR analysé: <strong>${esc(preview(item.parsedFr))}</strong></div>
      <div>EN analysé: <strong>${esc(preview(item.parsedEn))}</strong></div>
    </div>`;
  const portionGrid = document.createElement('div');
  portionGrid.className = 'grid';
  portionGrid.append(
    field('Label FR', food.portion.labelFr, (value) => { food.portion.labelFr = value; }),
    field('Label EN', food.portion.labelEn, (value) => { food.portion.labelEn = value; }),
    field('Quantité', food.portion.amount, (value) => { food.portion.amount = value; }, 'number'),
    field('Unité', food.portion.unit, (value) => { food.portion.unit = value; }, 'select', PORTION_UNITS),
    field('Grammes', food.portion.grams, (value) => { food.portion.grams = value; }, 'number'),
    field('État préparation', food.portion.preparationState, (value) => { food.portion.preparationState = value; }, 'select', [null, ...PREPARATION_STATES]),
    field('Marque', food.portion.brand, (value) => { food.portion.brand = value; }),
  );
  portion.appendChild(portionGrid);
  main.appendChild(portion);

  const nutrients = document.createElement('div');
  nutrients.className = 'section';
  nutrients.innerHTML = '<h2>Nutriments</h2>';
  const nutrientGrid = document.createElement('div');
  nutrientGrid.className = 'grid';
  nutrientGrid.append(
    field('Protéines (g)', food.nutrients.proteinG, (value) => { food.nutrients.proteinG = value; }, 'number'),
    field('Glucides (g)', food.nutrients.carbsG, (value) => { food.nutrients.carbsG = value; }, 'number'),
    field('Fibres (g)', food.nutrients.fiberG, (value) => { food.nutrients.fiberG = value; }, 'number'),
    field('Lipides totaux (g)', food.nutrients.fatG, (value) => { food.nutrients.fatG = value; }, 'number'),
    field('Saturés (g)', food.nutrients.saturatedFatG, (value) => { food.nutrients.saturatedFatG = value; }, 'number'),
    field('Poly (g)', food.nutrients.polyunsaturatedFatG, (value) => { food.nutrients.polyunsaturatedFatG = value; }, 'number'),
    field('Mono (g)', food.nutrients.monounsaturatedFatG, (value) => { food.nutrients.monounsaturatedFatG = value; }, 'number'),
    field('Calories déclarées', food.nutrients.declaredKcal, (value) => { food.nutrients.declaredKcal = value; }, 'number'),
  );
  nutrients.appendChild(nutrientGrid);
  main.appendChild(nutrients);

  const source = document.createElement('div');
  source.className = 'section';
  source.innerHTML = '<h2>Source authoritative (requise pour verified)</h2>';
  const sourceGrid = document.createElement('div');
  sourceGrid.className = 'grid';
  sourceGrid.append(
    field('source.type', food.source.type, (value) => { food.source.type = value; }, 'select', [null, ...SOURCE_TYPES]),
    field('source.name', food.source.name, (value) => { food.source.name = value; }),
    field('recordId', food.source.recordId, (value) => { food.source.recordId = value; }),
    field('url', food.source.url, (value) => { food.source.url = value; }),
    field('doi', food.source.doi, (value) => { food.source.doi = value; }),
    field('accessedAt', food.source.accessedAt, (value) => { food.source.accessedAt = value; }, 'date'),
    field('servingDescription', food.source.servingDescription, (value) => { food.source.servingDescription = value; }),
    field('nutrientsBasis', food.source.nutrientsBasis, (value) => { food.source.nutrientsBasis = value; }, 'select', [null, ...NUTRIENTS_BASIS]),
    field('notes', food.source.notes, (value) => { food.source.notes = value; }, 'textarea'),
    field('brand (étiquette)', food.source.brand, (value) => { food.source.brand = value; }),
    field('productName', food.source.productName, (value) => { food.source.productName = value; }),
    field('labelServingSize', food.source.labelServingSize, (value) => { food.source.labelServingSize = value; }),
    field('evidenceRef', food.source.evidenceRef, (value) => { food.source.evidenceRef = value; }),
  );
  source.appendChild(sourceGrid);
  source.insertAdjacentHTML('beforeend',
    `<p class="muted">legacySource: ${esc(food.legacySource?.reference || '—')} (${esc(food.legacySource?.referenceId || '')}) — ne permet pas verified</p>`);
  main.appendChild(source);
  main.appendChild(renderResolutionSection(food, item));
  refreshKcalAndAlerts();
}

function exportCheckpoint() {
  state.lastExportAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'food-equivalents.corrected.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  refreshHeader();
}

document.getElementById('search').oninput = renderList;
document.getElementById('filterCat').onchange = renderList;
document.getElementById('filterErr').onchange = renderList;
document.getElementById('filterStatus').onchange = renderList;
document.getElementById('btnExport').onclick = exportCheckpoint;

document.getElementById('importFile').onchange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.dirty.size > 0 && !confirm(`Importer remplacera ${state.dirty.size} modification(s) non exportée(s). Continuer?`)) {
    event.target.value = '';
    return;
  }
  try {
    initFrom(JSON.parse(await file.text()));
  } catch (error) {
    alert(`Import impossible: ${error.message}`);
  } finally {
    event.target.value = '';
  }
};

document.getElementById('btnReject').onclick = () => {
  const food = selected();
  if (!food) return;
  setFoodStatus(food, 'rejected');
  food.history.push({ at: new Date().toISOString(), action: 'reject' });
  afterMutation(food, { checkVerified: false });
  renderEditor();
};

document.getElementById('btnVerify').onclick = () => {
  const food = selected();
  const item = selectedAudit();
  if (!food || !item) return;
  if (!validateSource(food).ok || !canMarkVerified(food, item.alerts)) {
    alert('Impossible: une source authoritative complète et aucune ERROR ouverte sont requises.');
    return;
  }
  const approvedBy = prompt('Nom de la personne qui valide :');
  if (!approvedBy) return;
  setFoodStatus(food, 'verified');
  food.verification.verifiedAt = new Date().toISOString();
  food.verification.verifiedBy = approvedBy;
  food.verification.datasetVersion = window.FOOD_AUDIT_SUMMARY?.version?.version || null;
  food.version = (food.version || 1) + 1;
  food.history.push({
    at: food.verification.verifiedAt,
    action: 'verify',
    by: approvedBy,
    version: food.version,
  });
  afterMutation(food, { checkVerified: false });
  renderEditor();
};

window.addEventListener('beforeunload', (event) => {
  if (state.dirty.size === 0) return;
  event.preventDefault();
  event.returnValue = '';
});

window.__REVIEW_TEST__ = {
  auditDataset,
  getFoodStatus,
  setFoodStatus,
  MANUAL_STATUSES,
  getState: () => state,
  initFrom,
  refreshAudit,
};

if (window.FOOD_EQUIVALENTS_DATA) initFrom(window.FOOD_EQUIVALENTS_DATA);
else document.getElementById('headerMeta').textContent =
  'Aucune donnée embarquée. Lancez npm run data:audit, ou importez un JSON.';
