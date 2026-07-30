/**
 * Central food mutation helper with history + verified invalidation.
 */

import { getFoodStatus, setFoodStatus, isVerifiedFood } from './food-status.mjs';

export const MATERIAL_FIELDS = [
  'names',
  'portion',
  'nutrients',
  'source',
  'displayCategory',
  'calculationGroup',
  'exchangeProfileId',
  'classificationStatus',
];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function topLevelMaterialKey(path) {
  const root = String(path).split('.')[0];
  return MATERIAL_FIELDS.includes(root) ? root : null;
}

function cloneJson(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Apply one or more field changes as a single logical transaction.
 *
 * @param {object} food
 * @param {object} change
 * @param {Array<{path:string,value:any,oldValue?:any}>|undefined} change.patches
 * @param {string} [change.path]
 * @param {any} [change.value]
 * @param {string} [change.action]
 * @param {string} [change.by]
 * @param {string} [change.reason]
 * @param {boolean} [change.administrative] - if true, does not unverify
 * @param {boolean} [change.valuesAlreadyApplied] - skip setPath; still write history
 */
export function applyFoodChange(food, change = {}) {
  if (!food || typeof food !== 'object') throw new Error('food required');
  food.history = Array.isArray(food.history) ? food.history : [];
  food.verification =
    food.verification && typeof food.verification === 'object'
      ? food.verification
      : {
          status: food.status || 'unverified',
          verifiedAt: null,
          verifiedBy: null,
          datasetVersion: null,
        };

  const patches =
    Array.isArray(change.patches) && change.patches.length
      ? change.patches
      : change.path != null
        ? [{ path: change.path, value: change.value }]
        : [];

  if (!patches.length && !change.forceHistory) {
    return { food, changed: false, unverified: false };
  }

  const versionBefore = Number.isInteger(food.version) ? food.version : 1;
  const entries = [];
  let materialTouched = false;
  const already = Boolean(change.valuesAlreadyApplied);

  for (const patch of patches) {
    const path = patch.path;
    const next = patch.value;
    const prev = already
      ? patch.oldValue !== undefined
        ? patch.oldValue
        : patch.previous
      : getPath(food, path);
    if (!already && deepEqual(prev, next)) continue;
    if (already && deepEqual(prev, next)) continue;
    if (!already) setPath(food, path, next);
    if (topLevelMaterialKey(path)) materialTouched = true;
    entries.push({
      path,
      oldValue: cloneJson(prev),
      newValue: cloneJson(next),
    });
  }

  if (!entries.length && !change.forceHistory) {
    return { food, changed: false, unverified: false };
  }

  const versionAfter = versionBefore + 1;
  food.version = versionAfter;
  const at = change.at || new Date().toISOString();
  const action = change.action || 'update';
  const by = change.by || 'coach';

  for (const entry of entries) {
    food.history.push({
      timestamp: at,
      by,
      action,
      ...(change.transactionId ? { transactionId: change.transactionId } : {}),
      path: entry.path,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      reason: change.reason || null,
      versionBefore,
      versionAfter,
    });
  }

  let unverified = false;
  if (materialTouched && !change.administrative && isVerifiedFood(food)) {
    const prevVerifiedAt = food.verification.verifiedAt;
    const prevVerifiedBy = food.verification.verifiedBy;
    const prevDatasetVersion = food.verification.datasetVersion;
    setFoodStatus(food, 'unverified');
    food.history.push({
      timestamp: at,
      by: 'system',
      action: 'auto_unverify',
      path: 'verification.status',
      oldValue: 'verified',
      newValue: 'unverified',
      reason: change.reason || 'Material field changed — verified status revoked',
      previousVerification: {
        verifiedAt: prevVerifiedAt,
        verifiedBy: prevVerifiedBy,
        datasetVersion: prevDatasetVersion,
      },
      versionBefore: versionAfter,
      versionAfter,
    });
    unverified = true;
  }

  if (food.verification?.status && food.status !== food.verification.status) {
    if (!entries.some((e) => e.path === 'status' || e.path === 'verification.status')) {
      food.status = getFoodStatus(food);
    }
  }

  return { food, changed: true, unverified, versionBefore, versionAfter };
}

export function beginPendingEdits() {
  return { patches: [], baselines: {}, startedAt: Date.now() };
}

export function queuePendingEdit(pending, path, value, currentFood) {
  if (!pending) return pending;
  if (!(path in pending.baselines) && currentFood) {
    pending.baselines[path] = cloneJson(getPath(currentFood, path));
  }
  const idx = pending.patches.findIndex((p) => p.path === path);
  if (idx >= 0) pending.patches[idx].value = value;
  else pending.patches.push({ path, value });
  return pending;
}

/**
 * Commit queued UI edits: values are already on the food; write one history transaction.
 */
export function commitPendingEdits(food, pending, meta = {}) {
  if (!pending?.patches?.length) return { food, changed: false, unverified: false };
  const patches = pending.patches.map((p) => ({
    path: p.path,
    value: p.value,
    oldValue: pending.baselines[p.path],
  }));
  pending.patches = [];
  pending.baselines = {};
  return applyFoodChange(food, {
    ...meta,
    patches,
    valuesAlreadyApplied: true,
  });
}

export { getPath, setPath, deepEqual };
