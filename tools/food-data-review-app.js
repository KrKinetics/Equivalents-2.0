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
  applyFoodChange,
  beginPendingEdits,
  commitPendingEdits,
  queuePendingEdit,
  getPath,
  setPath,
} from '../src/lib/food-change.mjs';
import { validateReviewImport } from '../src/lib/review-import.mjs';
import {
  isMeaningfulString,
  knownSourceReferenceIds,
} from '../src/lib/source-validators.mjs';
import { stableStringify } from '../src/lib/data-hash-lite.mjs';
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
  lastExportHash: null,
  baseDataHash: null,
  sourceDatasetVersion: null,
  pendingByFood: new Map(),
  commitTimers: new Map(),
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

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashFoods(list) {
  const normalized = clone(list || []).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sha256Hex(stableStringify(normalized));
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
  if (!Number.isInteger(food.version)) food.version = 1;
}

function refreshHeader() {
  const header = document.getElementById('headerMeta');
  if (!header || !state.data) return;
  const sinceLoad = state.dirty.size;
  const exported = state.lastExportAt
    ? ` · dernier export ${new Date(state.lastExportAt).toLocaleString('fr-CA')}`
    : ' · jamais exporté';
  const hash = state.lastExportHash ? ` · hash ${state.lastExportHash.slice(0, 12)}` : '';
  header.textContent =
    `${foods().length} aliments · schema ${state.data.meta?.schemaVersion ?? '?'} · ` +
    `${sinceLoad} modification(s) depuis chargement/export` +
    `${exported}${hash}`;
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

function afterMutation(food) {
  ensureShapes(food);
  refreshAudit();
  updateDirty(food);
  renderList();
  refreshKcalAndAlerts();
}

function getPending(food) {
  let pending = state.pendingByFood.get(food.id);
  if (!pending) {
    pending = beginPendingEdits();
    state.pendingByFood.set(food.id, pending);
  }
  return pending;
}

function scheduleCommit(food) {
  const existing = state.commitTimers.get(food.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => commitFood(food), 600);
  state.commitTimers.set(food.id, timer);
}

function commitFood(food, meta = {}) {
  const timer = state.commitTimers.get(food.id);
  if (timer) {
    clearTimeout(timer);
    state.commitTimers.delete(food.id);
  }
  const pending = state.pendingByFood.get(food.id);
  if (!pending?.patches?.length) {
    afterMutation(food);
    return;
  }
  commitPendingEdits(food, pending, {
    by: meta.by || 'coach',
    action: meta.action || 'update',
    reason: meta.reason || null,
  });
  afterMutation(food);
}

function applyLiveEdit(food, path, value) {
  const pending = getPending(food);
  if (!(path in pending.baselines)) {
    pending.baselines[path] = clone(getPath(food, path));
  }
  queuePendingEdit(pending, path, value);
  setPath(food, path, value);
  scheduleCommit(food);
  updateDirty(food);
  refreshAudit();
  refreshKcalAndAlerts();
}

function initFrom(payload, options = {}) {
  const candidateData = clone(payload);
  const gate = validateReviewImport(candidateData);
  if (!gate.ok) {
    throw new Error(gate.message || 'Import refusé');
  }
  const duplicateAudit = auditDataset(candidateData.foods);
  if (
    duplicateAudit.items.some((item) =>
      item.alerts.some((alert) => alert.code === 'DUPLICATE_ID')
    )
  ) {
    throw new Error('Import refusé: identifiant(s) dupliqué(s)');
  }

  // Everything below is prepared off-state. Any rejection leaves the current
  // session, dirty changes, originals, and selection untouched.
  return hashFoods(candidateData.foods).then((contentHash) => {
    const meta = candidateData.meta || {};
    const hasExportMeta = meta.exportDataHash != null || meta.baseDataHash != null;
    let candidateBaseDataHash;
    if (hasExportMeta) {
      if (!meta.exportDataHash) {
        throw new Error('EXPORT_HASH_MISMATCH: meta.exportDataHash manquant');
      }
      if (meta.exportDataHash !== contentHash) {
        throw new Error(
          'EXPORT_HASH_MISMATCH: meta.exportDataHash ne correspond pas au hash des foods importés'
        );
      }
      if (!meta.baseDataHash) {
        throw new Error('EXPORT_HASH_MISMATCH: meta.baseDataHash manquant pour une reprise d’export');
      }
      candidateBaseDataHash = options.baseDataHash || meta.baseDataHash;
    } else {
      candidateBaseDataHash = options.baseDataHash || contentHash;
    }

    const candidateOriginals = new Map();
    for (const food of candidateData.foods) {
      ensureShapes(food);
      candidateOriginals.set(food.id, JSON.stringify(food));
    }
    const candidateAudit = auditDataset(candidateData.foods);
    const candidateSourceDatasetVersion =
      options.sourceDatasetVersion ||
      window.FOOD_AUDIT_SUMMARY?.version?.version ||
      candidateData.meta?.sourceDatasetVersion ||
      null;

    state.commitTimers.forEach((timer) => clearTimeout(timer));
    state.data = candidateData;
    state.audit = candidateAudit;
    state.selectedId = null;
    state.dirty = new Set();
    state.originals = candidateOriginals;
    state.pendingByFood = new Map();
    state.commitTimers = new Map();
    state.baseDataHash = candidateBaseDataHash;
    state.sourceDatasetVersion = candidateSourceDatasetVersion;
    if (!options.preserveExportMeta) {
      state.lastExportAt = null;
      state.lastExportHash = null;
    }

    const categories = [...new Set(foods().map((food) => food.displayCategory))].sort();
    document.getElementById('filterCat').innerHTML =
      '<option value="">Toutes catégories</option>' +
      categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
    renderList();
    renderEditor();
    return state;
  });
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
      if (state.selectedId && state.selectedId !== food.id) {
        const prev = foods().find((f) => f.id === state.selectedId);
        if (prev) commitFood(prev);
      }
      state.selectedId = food.id;
      renderList();
      renderEditor();
    };
    list.appendChild(element);
  }
}

function field(label, pathOrValue, onChange, type = 'text', options = null) {
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

  const value = typeof pathOrValue === 'function' ? null : pathOrValue;
  input.value = value == null ? '' : value;

  const emit = () => {
    let next = input.value;
    if (type === 'number') next = next === '' ? null : Number(next);
    else if (type === 'select' && next === '') next = null;
    onChange(next);
    wrapper.classList.add('changed');
  };

  if (type === 'select') {
    input.addEventListener('change', () => {
      emit();
      const food = selected();
      if (food) commitFood(food);
    });
  } else {
    input.addEventListener('input', emit);
    input.addEventListener('blur', () => {
      const food = selected();
      if (food) commitFood(food);
    });
  }
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
      let resolution = '';
      if (alert.resolutionStatus === 'resolved_documented') resolution = ' — résolue et documentée';
      else if (alert.resolutionStatus === 'stale') resolution = ' — résolution périmée (stale)';
      else if (alert.resolutionStatus === 'invalid') resolution = ' — résolution invalide';
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

  const refs = knownSourceReferenceIds(food);
  if (!refs.length) {
    section.insertAdjacentHTML(
      'beforeend',
      '<p class="muted">Aucune référence authoritative admissible (recordId, evidenceRef, url ou doi). Complétez la source avant de documenter une résolution.</p>'
    );
    return section;
  }

  const form = document.createElement('div');
  form.className = 'grid';
  const values = {
    code: codes[0],
    reason: '',
    approvedBy: '',
    approvedAt: '',
    sourceReferenceId: refs[0],
  };
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
      input.value = values[key] ?? options[0];
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
  add('Référence source authoritative', 'sourceReferenceId', 'select', refs);
  section.appendChild(form);

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Enregistrer la résolution';
  save.style.marginTop = '12px';
  save.disabled = false;
  save.onclick = () => {
    commitFood(food);
    if (!values.reason.trim() || !values.approvedBy.trim() || !values.approvedAt || !values.sourceReferenceId.trim()) {
      alert('Tous les champs de résolution sont requis (fieldsHash sera calculé automatiquement).');
      return;
    }
    if (!validateSource(food).authoritative) {
      alert('Une source authoritative complète est requise avant de documenter une résolution.');
      return;
    }
    const resolution = {
      code: values.code,
      reason: values.reason.trim(),
      approvedBy: values.approvedBy.trim(),
      approvedAt: values.approvedAt,
      sourceReferenceId: values.sourceReferenceId.trim(),
      fieldsHash: resolutionSnapshotHash(values.code, food),
      createdAt: new Date().toISOString(),
      version: 1,
    };
    applyFoodChange(food, {
      path: 'auditResolutions',
      value: [...(food.auditResolutions || []), resolution],
      by: values.approvedBy.trim(),
      action: 'document_audit_resolution',
      reason: values.reason.trim(),
      administrative: true,
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
      commitFood(food);
      applyFoodChange(food, {
        patches: [
          { path: 'status', value },
          { path: 'verification.status', value },
        ],
        by: 'coach',
        action: 'manual_status',
        administrative: value === 'rejected' ? false : true,
      });
      setFoodStatus(food, value);
      afterMutation(food);
    }, 'select', MANUAL_STATUSES),
    field('Nom FR', food.names.fr, (value) => applyLiveEdit(food, 'names.fr', value)),
    field('Nom EN', food.names.en, (value) => applyLiveEdit(food, 'names.en', value)),
    field('Catégorie visible', food.displayCategory, (value) => applyLiveEdit(food, 'displayCategory', value), 'select', DISPLAY_CATEGORIES),
    field('Groupe calcul', food.calculationGroup, (value) => applyLiveEdit(food, 'calculationGroup', value), 'select', CALCULATION_GROUPS),
    field('exchangeProfileId', food.exchangeProfileId, (value) => applyLiveEdit(food, 'exchangeProfileId', value)),
    field('classificationStatus', food.classificationStatus, (value) => applyLiveEdit(food, 'classificationStatus', value), 'select', CLASSIFICATION_STATUSES),
  );
  if (getFoodStatus(food) === 'verified') {
    identityGrid.insertAdjacentHTML('beforeend', '<p class="verified-note">Statut actuel: verified — toute modification matérielle repasse à unverified.</p>');
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
    field('Label FR', food.portion.labelFr, (value) => applyLiveEdit(food, 'portion.labelFr', value)),
    field('Label EN', food.portion.labelEn, (value) => applyLiveEdit(food, 'portion.labelEn', value)),
    field('Quantité', food.portion.amount, (value) => applyLiveEdit(food, 'portion.amount', value), 'number'),
    field('Unité', food.portion.unit, (value) => applyLiveEdit(food, 'portion.unit', value), 'select', PORTION_UNITS),
    field('Grammes', food.portion.grams, (value) => applyLiveEdit(food, 'portion.grams', value), 'number'),
    field('État préparation', food.portion.preparationState, (value) => applyLiveEdit(food, 'portion.preparationState', value), 'select', [null, ...PREPARATION_STATES]),
    field('Marque', food.portion.brand, (value) => applyLiveEdit(food, 'portion.brand', value)),
  );
  portion.appendChild(portionGrid);
  main.appendChild(portion);

  const nutrients = document.createElement('div');
  nutrients.className = 'section';
  nutrients.innerHTML = '<h2>Nutriments</h2>';
  const nutrientGrid = document.createElement('div');
  nutrientGrid.className = 'grid';
  nutrientGrid.append(
    field('Protéines (g)', food.nutrients.proteinG, (value) => applyLiveEdit(food, 'nutrients.proteinG', value), 'number'),
    field('Glucides (g)', food.nutrients.carbsG, (value) => applyLiveEdit(food, 'nutrients.carbsG', value), 'number'),
    field('Fibres (g)', food.nutrients.fiberG, (value) => applyLiveEdit(food, 'nutrients.fiberG', value), 'number'),
    field('Lipides totaux (g)', food.nutrients.fatG, (value) => applyLiveEdit(food, 'nutrients.fatG', value), 'number'),
    field('Saturés (g)', food.nutrients.saturatedFatG, (value) => applyLiveEdit(food, 'nutrients.saturatedFatG', value), 'number'),
    field('Poly (g)', food.nutrients.polyunsaturatedFatG, (value) => applyLiveEdit(food, 'nutrients.polyunsaturatedFatG', value), 'number'),
    field('Mono (g)', food.nutrients.monounsaturatedFatG, (value) => applyLiveEdit(food, 'nutrients.monounsaturatedFatG', value), 'number'),
    field('Calories déclarées', food.nutrients.declaredKcal, (value) => applyLiveEdit(food, 'nutrients.declaredKcal', value), 'number'),
  );
  nutrients.appendChild(nutrientGrid);
  main.appendChild(nutrients);

  const source = document.createElement('div');
  source.className = 'section';
  source.innerHTML = '<h2>Source authoritative (requise pour verified)</h2>';
  const sourceGrid = document.createElement('div');
  sourceGrid.className = 'grid';
  sourceGrid.append(
    field('source.type', food.source.type, (value) => applyLiveEdit(food, 'source.type', value), 'select', [null, ...SOURCE_TYPES]),
    field('source.name', food.source.name, (value) => applyLiveEdit(food, 'source.name', value)),
    field('recordId', food.source.recordId, (value) => applyLiveEdit(food, 'source.recordId', value)),
    field('url', food.source.url, (value) => applyLiveEdit(food, 'source.url', value)),
    field('doi', food.source.doi, (value) => applyLiveEdit(food, 'source.doi', value)),
    field('accessedAt', food.source.accessedAt, (value) => applyLiveEdit(food, 'source.accessedAt', value), 'date'),
    field('servingDescription', food.source.servingDescription, (value) => applyLiveEdit(food, 'source.servingDescription', value)),
    field('nutrientsBasis', food.source.nutrientsBasis, (value) => applyLiveEdit(food, 'source.nutrientsBasis', value), 'select', [null, ...NUTRIENTS_BASIS]),
    field('notes', food.source.notes, (value) => applyLiveEdit(food, 'source.notes', value), 'textarea'),
    field('brand (étiquette)', food.source.brand, (value) => applyLiveEdit(food, 'source.brand', value)),
    field('productName', food.source.productName, (value) => applyLiveEdit(food, 'source.productName', value)),
    field('labelServingSize', food.source.labelServingSize, (value) => applyLiveEdit(food, 'source.labelServingSize', value)),
    field('evidenceRef', food.source.evidenceRef, (value) => applyLiveEdit(food, 'source.evidenceRef', value)),
  );
  source.appendChild(sourceGrid);
  source.insertAdjacentHTML('beforeend',
    `<p class="muted">legacySource: ${esc(food.legacySource?.reference || '—')} (${esc(food.legacySource?.referenceId || '')}) — ne permet pas verified</p>`);
  main.appendChild(source);
  main.appendChild(renderResolutionSection(food, item));
  refreshKcalAndAlerts();
}

async function exportCheckpoint() {
  for (const food of foods()) commitFood(food);
  const exportDataHash = await hashFoods(foods());
  const exportedAt = new Date().toISOString();
  const exportedBy = window.prompt('Exporté par (nom ou rôle) :', 'coach') || 'coach';
  state.data.meta = state.data.meta || {};
  state.data.meta.baseDataHash = state.baseDataHash;
  state.data.meta.exportDataHash = exportDataHash;
  state.data.meta.exportedAt = exportedAt;
  state.data.meta.exportedBy = exportedBy;
  state.data.meta.sourceDatasetVersion = state.sourceDatasetVersion;
  state.data.meta.totalFoods = foods().length;

  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'food-equivalents.corrected.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);

  state.lastExportAt = exportedAt;
  state.lastExportHash = exportDataHash;
  state.dirty.clear();
  state.originals.clear();
  for (const food of foods()) {
    state.originals.set(food.id, JSON.stringify(food));
  }
  // After export, subsequent edits are relative to exported content; base hash for next apply cycle
  // remains the hash of the dataset that was originally loaded for stale detection of THIS export.
  refreshHeader();
}

document.getElementById('search').oninput = renderList;
document.getElementById('filterCat').onchange = renderList;
document.getElementById('filterErr').onchange = renderList;
document.getElementById('filterStatus').onchange = renderList;
document.getElementById('btnExport').onclick = () => {
  exportCheckpoint().catch((error) => alert(`Export impossible: ${error.message}`));
};

document.getElementById('importFile').onchange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.dirty.size > 0 && !confirm(`Importer remplacera ${state.dirty.size} modification(s) non exportée(s). Continuer?`)) {
    event.target.value = '';
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const gate = validateReviewImport(payload);
    if (!gate.ok) {
      alert(gate.message);
      return;
    }
    // Audit before init — refuse DUPLICATE_ID explicitly
    const preAudit = auditDataset(payload.foods || []);
    const dupes = [...new Set(
      preAudit.items
        .filter((item) => item.alerts.some((a) => a.code === 'DUPLICATE_ID'))
        .map((item) => item.id)
    )];
    if (dupes.length) {
      alert(`Import refusé: identifiant(s) dupliqué(s): ${dupes.join(', ')}`);
      return;
    }
    await initFrom(payload);
  } catch (error) {
    alert(`Import impossible: ${error.message}`);
  } finally {
    event.target.value = '';
  }
};

document.getElementById('btnReject').onclick = () => {
  const food = selected();
  if (!food) return;
  commitFood(food);
  applyFoodChange(food, {
    patches: [
      { path: 'status', value: 'rejected' },
      { path: 'verification.status', value: 'rejected' },
    ],
    by: 'coach',
    action: 'reject',
  });
  setFoodStatus(food, 'rejected');
  afterMutation(food);
  renderEditor();
};

document.getElementById('btnVerify').onclick = () => {
  const food = selected();
  const item = selectedAudit();
  if (!food || !item) return;
  commitFood(food);
  if (!validateSource(food).ok || !canMarkVerified(food, item.alerts)) {
    alert('Impossible: une source authoritative complète et aucune ERROR ouverte sont requises.');
    return;
  }
  const approvedBy = String(prompt('Nom de la personne qui valide :') || '').trim();
  if (!isMeaningfulString(approvedBy)) {
    alert('Impossible: le nom du validateur doit être significatif.');
    return;
  }
  const datasetVersion =
    window.FOOD_AUDIT_SUMMARY?.version?.version || state.sourceDatasetVersion || null;
  if (!isMeaningfulString(datasetVersion, { minLength: 1 })) {
    alert('Impossible: une version de dataset significative est requise.');
    return;
  }
  const at = new Date().toISOString();
  const transactionId = crypto.randomUUID();
  applyFoodChange(food, {
    patches: [
      { path: 'status', value: 'verified' },
      { path: 'verification.status', value: 'verified' },
      { path: 'verification.verifiedAt', value: at },
      { path: 'verification.verifiedBy', value: approvedBy },
      {
        path: 'verification.datasetVersion',
        value: datasetVersion,
      },
    ],
    by: approvedBy,
    action: 'verify',
    transactionId,
    administrative: true,
  });
  setFoodStatus(food, 'verified');
  food.verification.verifiedAt = at;
  food.verification.verifiedBy = approvedBy;
  afterMutation(food);
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
  validateReviewImport,
  validateSource,
  canMarkVerified,
  applyFoodChange,
  knownSourceReferenceIds,
  getState: () => state,
  initFrom,
  refreshAudit,
  commitFood,
  applyLiveEdit,
  exportCheckpoint,
  hashFoods,
};

const boot = window.FOOD_EQUIVALENTS_DATA
  ? initFrom(window.FOOD_EQUIVALENTS_DATA)
  : Promise.resolve(null);

boot.then(() => {
  if (!state.data) {
    document.getElementById('headerMeta').textContent =
      'Aucune donnée embarquée. Lancez npm run data:audit, ou importez un JSON.';
  }
}).catch((error) => {
  document.getElementById('headerMeta').textContent = `Chargement impossible: ${error.message}`;
});
