/**
 * Generic per-batch scope guard.
 * Captures protected foods outside a batch and verifies they remain unchanged.
 */
import { computeFoodsDataHash, stableStringify } from './data-hash.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sortIds(ids) {
  return [...(ids || [])].map(String).sort((a, b) => a.localeCompare(b));
}

export function buildBatchScopeBaseline(currentPayload, batch) {
  const foods = currentPayload?.foods || [];
  const allowedUpdateIds = sortIds(
    (batch?.foods || []).filter((f) => f.operation === 'update').map((f) => f.id)
  );
  const allowedAddIds = sortIds(
    (batch?.foods || []).filter((f) => f.operation === 'add').map((f) => f.id)
  );
  const allowed = new Set([...allowedUpdateIds, ...allowedAddIds]);
  const existingIds = sortIds(foods.map((f) => f.id));
  const protectedFoods = foods
    .filter((food) => !allowed.has(food.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return {
    batchId: batch?.batchId || null,
    capturedAt: new Date().toISOString(),
    existingFoodCount: foods.length,
    existingIds,
    allowedUpdateIds,
    allowedAddIds,
    protectedFoodCount: protectedFoods.length,
    protectedFoodIds: protectedFoods.map((f) => f.id),
    protectedFoodsDataHash: computeFoodsDataHash(protectedFoods),
    scope: clone(batch?.scope || null),
  };
}

export function checkBatchScope(baseline, candidatePayload, batch) {
  const errors = [];
  const divergences = [];
  const foods = candidatePayload?.foods || [];
  const byId = new Map(foods.map((f) => [f.id, f]));
  const allowedUpdate = new Set(baseline.allowedUpdateIds || []);
  const allowedAdd = new Set(baseline.allowedAddIds || []);
  const allowed = new Set([...allowedUpdate, ...allowedAdd]);
  const baselineExisting = new Set(baseline.existingIds || []);

  for (const id of baselineExisting) {
    if (allowedUpdate.has(id)) continue;
    if (allowedAdd.has(id)) continue;
    if (!byId.has(id)) {
      errors.push(`Protected food removed: ${id}`);
      divergences.push({ id, kind: 'removed' });
    }
  }

  for (const food of foods) {
    const id = food.id;
    if (baselineExisting.has(id)) continue;
    if (allowedAdd.has(id)) continue;
    errors.push(`Food added outside batch scope: ${id}`);
    divergences.push({ id, kind: 'added-outside-scope' });
  }

  for (const id of allowedUpdate) {
    if (!baselineExisting.has(id)) {
      errors.push(`Update target missing from baseline: ${id}`);
      divergences.push({ id, kind: 'update-missing-baseline' });
    }
  }

  const protectedFoods = foods
    .filter((food) => !allowed.has(food.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const protectedHash = computeFoodsDataHash(protectedFoods);
  if (protectedHash !== baseline.protectedFoodsDataHash) {
    // Find which protected foods changed by comparing against baseline ids set.
    const baselineProtected = new Set(baseline.protectedFoodIds || []);
    for (const food of protectedFoods) {
      if (!baselineProtected.has(food.id)) {
        divergences.push({ id: food.id, kind: 'protected-unexpected' });
      }
    }
    errors.push(
      `Protected foods hash mismatch: baseline=${baseline.protectedFoodsDataHash} actual=${protectedHash}`
    );
  }

  const expectedFinal = Number(batch?.scope?.expectedFinalFoodCount);
  if (Number.isFinite(expectedFinal) && foods.length !== expectedFinal) {
    errors.push(`Final food count ${foods.length} != expected ${expectedFinal}`);
    divergences.push({ kind: 'count', actual: foods.length, expected: expectedFinal });
  }

  return {
    ok: errors.length === 0,
    errors,
    divergences,
    protectedFoodCount: protectedFoods.length,
    protectedFoodsDataHash: protectedHash,
    foodCount: foods.length,
    checkedAt: new Date().toISOString(),
    batchId: batch?.batchId || baseline.batchId || null,
  };
}

export function assertBatchScopeOrThrow(baseline, candidatePayload, batch) {
  const result = checkBatchScope(baseline, candidatePayload, batch);
  if (!result.ok) {
    const error = new Error(result.errors.join('; '));
    error.scopeCheck = result;
    throw error;
  }
  return result;
}

export { stableStringify };
