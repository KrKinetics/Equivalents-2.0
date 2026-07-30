/**
 * Generic approved-nutrition batch engine.
 * Works for CNF generic foods and manufacturer label products.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { applyFoodChange } from './food-change.mjs';
import { setFoodStatus, isVerifiedFood } from './food-status.mjs';
import {
  auditFood,
  canMarkVerified,
  resolutionSnapshotHash,
  RESOLVABLE_CODES,
} from './food-audit-core.mjs';
import { validateVerificationEligibility } from './verification-eligibility.mjs';
import { validateSource } from './food-audit-core.mjs';
import { computeFoodsDataHash, stableStringify } from './data-hash.mjs';
import { checkPilotCandidateScope, isPilotGuardActive } from './nutrition-pilot-scope.mjs';
import { selectCnfRecord, getCnfFoodByRecordId } from './cnf-selection.mjs';
import {
  buildBatchScopeBaseline,
  checkBatchScope,
} from './nutrition-batch-scope.mjs';
import {
  convertCnfPer100gToPortion,
  convertManufacturerBottleTo100ml,
  roundMacro,
  roundKcal,
} from './nutrition-batch-math.mjs';

const LEGACY_BATCHES_WITHOUT_EXPECTED_RECORD = new Set([
  'pilot-nutrition-validation-6-foods',
]);

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CNF_FOODS_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');

let batchSchemaValidate = null;
function getBatchSchemaValidate() {
  if (batchSchemaValidate) return batchSchemaValidate;
  try {
    const mod = require('../generated/approved-nutrition-batch-validator.cjs');
    batchSchemaValidate = mod.default || mod;
  } catch {
    const Ajv2020 = require('ajv/dist/2020.js');
    const addFormats = require('ajv-formats');
    const schema = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src', 'data', 'approved-nutrition-batch.schema.json'), 'utf8')
    );
    const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
    addFormats(ajv);
    batchSchemaValidate = ajv.compile(schema);
  }
  return batchSchemaValidate;
}

function loadCnfFoods() {
  if (!fs.existsSync(CNF_FOODS_PATH)) {
    throw new Error(`CNF normalized foods missing: ${CNF_FOODS_PATH}. Run npm run sources:cnf:sync`);
  }
  return JSON.parse(fs.readFileSync(CNF_FOODS_PATH, 'utf8')).foods || [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptySource() {
  return {
    type: null,
    name: null,
    recordId: null,
    url: null,
    doi: null,
    accessedAt: null,
    servingDescription: null,
    nutrientsBasis: null,
    notes: null,
    brand: null,
    productName: null,
    labelServingSize: null,
    evidenceRef: null,
  };
}

function createShellFood(entry) {
  return {
    id: entry.id,
    displayCategory: entry.classification.displayCategory,
    calculationGroup: entry.classification.calculationGroup,
    exchangeProfileId: entry.classification.exchangeProfileId,
    classificationStatus: 'pending',
    names: {
      fr: entry.lockedIdentity.fr,
      en: entry.lockedIdentity.en,
    },
    portion: {
      labelFr: entry.canonicalPortion.labelFr,
      labelEn: entry.canonicalPortion.labelEn,
      amount: entry.canonicalPortion.amount,
      unit: entry.canonicalPortion.unit,
      grams: entry.canonicalPortion.grams ?? null,
      preparationState: entry.lockedIdentity.preparationState,
      brandSpecific: Boolean(entry.lockedIdentity.brand),
      brand: entry.lockedIdentity.brand || null,
    },
    nutrients: {
      proteinG: 0,
      carbsG: 0,
      fiberG: null,
      fatG: null,
      saturatedFatG: null,
      polyunsaturatedFatG: null,
      monounsaturatedFatG: null,
      declaredKcal: 0,
    },
    legacySource: {
      reference: 'Approved nutrition batch add',
      referenceId: entry.id,
      notes: 'Created by nutrition batch engine',
    },
    source: emptySource(),
    status: 'unverified',
    version: 1,
    verification: {
      status: 'unverified',
      verifiedAt: null,
      verifiedBy: null,
      datasetVersion: null,
    },
    auditResolutions: [],
    history: [
      {
        timestamp: new Date().toISOString(),
        by: 'nutrition-batch-engine',
        action: 'create',
        path: 'id',
        oldValue: null,
        newValue: entry.id,
        reason: 'Approved batch add',
        versionBefore: 1,
        versionAfter: 1,
      },
    ],
  };
}

function buildCnfSource(record, accessedAt) {
  return {
    type: 'canadian_nutrient_file',
    name: 'Canadian Nutrient File 2026',
    recordId: String(record.recordId),
    url: 'https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109',
    doi: null,
    accessedAt,
    servingDescription: `100 g as consumed (${record.descriptionEn})`,
    nutrientsBasis: 'as_consumed',
    notes: record.descriptionFr || null,
    brand: null,
    productName: null,
    labelServingSize: '100 g',
    evidenceRef: `CNF-2026:${record.recordId}`,
  };
}

function buildManufacturerSource(label, identity) {
  return {
    type: 'manufacturer_website',
    name: identity.brand || 'fairlife',
    recordId: label.url,
    url: label.url,
    doi: null,
    accessedAt: label.accessedAt,
    servingDescription: `${label.labelServing.amount} ${label.labelServing.unit} bottle`,
    nutrientsBasis: 'as_consumed',
    notes: identity.marketNote || null,
    brand: identity.brand || 'fairlife',
    productName: identity.en,
    labelServingSize: `${label.labelServing.amount} ${label.labelServing.unit}`,
    evidenceRef: label.url,
  };
}

function nutrientsEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function appendResolution(food, code, sourceReferenceId, approvedBy, reason) {
  const fieldsHash = resolutionSnapshotHash(code, food);
  const now = new Date().toISOString();
  const previous = Array.isArray(food.auditResolutions) ? clone(food.auditResolutions) : [];
  const next = [
    ...previous,
    {
      code,
      sourceReferenceId,
      fieldsHash,
      approvedAt: now.slice(0, 10),
      approvedBy,
      createdAt: now,
      version: (Number.isInteger(food.version) ? food.version : 1) + 1,
      reason,
    },
  ];
  applyFoodChange(food, {
    path: 'auditResolutions',
    value: next,
    by: approvedBy,
    action: 'resolution',
    administrative: true,
    at: now,
  });
}

function markVerifiedComplete(food, approvedBy, datasetVersion, at = new Date().toISOString()) {
  const transactionId = crypto.randomUUID();
  applyFoodChange(food, {
    patches: [
      { path: 'status', value: 'verified' },
      { path: 'verification.status', value: 'verified' },
      { path: 'verification.verifiedAt', value: at },
      { path: 'verification.verifiedBy', value: approvedBy },
      { path: 'verification.datasetVersion', value: datasetVersion },
    ],
    by: approvedBy,
    action: 'verify',
    transactionId,
    administrative: true,
    at,
  });
  setFoodStatus(food, 'verified');
  food.verification.verifiedAt = at;
  food.verification.verifiedBy = approvedBy;
  food.verification.datasetVersion = datasetVersion;
  return transactionId;
}

function resolveEntryNutrients(entry, cnfFoods, accessedAt, options = {}) {
  if (entry.sourcePlan?.adapter === 'cnf_2026') {
    const requireExpectedRecordId =
      options.requireExpectedRecordId ??
      !LEGACY_BATCHES_WITHOUT_EXPECTED_RECORD.has(options.batchId);
    if (requireExpectedRecordId && !entry.sourcePlan.expectedRecordId) {
      return {
        ok: false,
        errors: [
          `EXPECTED_CNF_RECORD_MISSING: ${entry.id} requires sourcePlan.expectedRecordId`,
        ],
        selection: {
          ok: false,
          code: 'EXPECTED_CNF_RECORD_MISSING',
          expectedRecordId: null,
          selectedRecordId: null,
        },
      };
    }
    const selection = selectCnfRecord(cnfFoods, entry.sourcePlan, {
      requireExpectedRecordId: false,
    });
    if (!selection.ok) {
      return {
        ok: false,
        errors: [
          `${selection.code || 'CNF_SELECTION_FAILED'}: ${entry.id}: ${selection.message}`,
        ],
        selection,
      };
    }
    if (
      entry.sourcePlan.expectedRecordId &&
      String(selection.selectedRecordId) !== String(entry.sourcePlan.expectedRecordId)
    ) {
      return {
        ok: false,
        errors: [
          `EXPECTED_CNF_RECORD_MISMATCH: ${entry.id}: expected ${entry.sourcePlan.expectedRecordId} selected ${selection.selectedRecordId}`,
        ],
        selection: {
          ...selection,
          ok: false,
          code: 'EXPECTED_CNF_RECORD_MISMATCH',
        },
      };
    }
    const record = getCnfFoodByRecordId(cnfFoods, selection.selected.recordId);
    const conversion = convertCnfPer100gToPortion(record.per100g, entry.canonicalPortion.grams);
    return {
      ok: true,
      adapter: 'cnf_2026',
      selection,
      record,
      conversion,
      source: buildCnfSource(record, accessedAt),
      nutrients: conversion.storedRounded,
      sourceReferenceId: String(record.recordId),
      expectedRecordId: selection.expectedRecordId,
      selectedRecordId: selection.selectedRecordId,
    };
  }

  if (entry.manufacturerLabel) {
    const label = entry.manufacturerLabel;
    const conversion = convertManufacturerBottleTo100ml(
      label.labelNutrients,
      label.labelServing.amount
    );
    const nutrients = {
      declaredKcal: label.storedPer100Ml.declaredKcal,
      proteinG: label.storedPer100Ml.proteinG,
      carbsG: label.storedPer100Ml.carbsG,
      fiberG: label.storedPer100Ml.fiberG,
      fatG: label.storedPer100Ml.fatG,
      saturatedFatG: label.storedPer100Ml.saturatedFatG,
      polyunsaturatedFatG: label.storedPer100Ml.polyunsaturatedFatG ?? null,
      monounsaturatedFatG: label.storedPer100Ml.monounsaturatedFatG ?? null,
    };
    return {
      ok: true,
      adapter: 'manufacturer',
      selection: null,
      record: null,
      conversion: {
        ...conversion,
        storedRounded: nutrients,
        approvedStored: label.storedPer100Ml,
      },
      source: buildManufacturerSource(label, entry.lockedIdentity),
      nutrients,
      sourceReferenceId: label.url,
      expectedRecordId: null,
      selectedRecordId: label.url,
    };
  }

  return { ok: false, errors: [`No source adapter for ${entry.id}`] };
}

export function validateApprovedBatch(batch, currentPayload, options = {}) {
  const errors = [];
  const validate = getBatchSchemaValidate();
  const schemaOk = validate(batch);
  if (!schemaOk) {
    for (const err of validate.errors || []) {
      errors.push(`${err.instancePath || '/'} ${err.message}`);
    }
  }

  const foods = batch?.foods || [];
  const ids = foods.map((f) => f.id);
  if (new Set(ids).size !== ids.length) errors.push('Duplicate food ids in batch');
  const allowed = new Set(batch?.scope?.allowedFoodIds || []);
  for (const id of ids) {
    if (!allowed.has(id)) errors.push(`Food id outside allowed scope: ${id}`);
  }

  const currentById = new Map((currentPayload?.foods || []).map((f) => [f.id, f]));
  let addCount = 0;
  for (const entry of foods) {
    if (entry.operation === 'update') {
      if (!currentById.has(entry.id)) errors.push(`Update target missing: ${entry.id}`);
    } else if (entry.operation === 'add') {
      addCount += 1;
      if (currentById.has(entry.id)) errors.push(`Add target already exists: ${entry.id}`);
    }
  }
  if (addCount !== Number(batch?.scope?.newFoodCount ?? addCount)) {
    errors.push(
      `newFoodCount mismatch: scope=${batch?.scope?.newFoodCount} actualAdds=${addCount}`
    );
  }
  if (options.pilotConfig && isPilotGuardActive(options.pilotConfig) && options.pilotConfig?.pendingAllowedAdds) {
    const pending = new Set(options.pilotConfig.pendingAllowedAdds);
    for (const entry of foods) {
      if (entry.operation !== 'add') continue;
      if (currentById.has(entry.id)) continue;
      if (pending.size > 0 && !pending.has(entry.id)) {
        errors.push(`Add not listed in pilot pendingAllowedAdds: ${entry.id}`);
      }
    }
  }
  if (
    Number(batch?.scope?.expectedFinalFoodCount) !==
    Number(batch?.scope?.existingFoodCount) + Number(batch?.scope?.newFoodCount)
  ) {
    errors.push('expectedFinalFoodCount must equal existingFoodCount + newFoodCount');
  }
  if ((currentPayload?.foods || []).length !== Number(batch?.scope?.existingFoodCount)) {
    errors.push(
      `existingFoodCount mismatch: scope=${batch.scope.existingFoodCount} actual=${currentPayload.foods.length}`
    );
  }

  const scopeBaseline = buildBatchScopeBaseline(currentPayload, batch);
  let cnfFoods = options.cnfFoods;
  try {
    if (!cnfFoods) cnfFoods = loadCnfFoods();
  } catch (error) {
    errors.push(error.message);
  }

  const resolved = [];
  const perFoodErrors = [];
  if (cnfFoods) {
    for (const entry of foods) {
      const result = resolveEntryNutrients(entry, cnfFoods, batch.approvedAt, {
        batchId: batch.batchId,
        requireExpectedRecordId: options.requireExpectedRecordId,
      });
      if (!result.ok) {
        const msgs = result.errors || [`resolve failed: ${entry.id}`];
        errors.push(...msgs);
        perFoodErrors.push({ id: entry.id, errors: msgs, selection: result.selection || null });
      } else {
        resolved.push({ entry, result });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    resolved,
    cnfFoods,
    scopeBaseline,
    perFoodErrors,
  };
}

function projectFoodState(before, entry, resolvedNutrients, approvedBy) {
  const food = before ? clone(before) : createShellFood(entry);
  const patches = [
    { path: 'names.fr', value: entry.lockedIdentity.fr },
    { path: 'names.en', value: entry.lockedIdentity.en },
    { path: 'portion.labelFr', value: entry.canonicalPortion.labelFr },
    { path: 'portion.labelEn', value: entry.canonicalPortion.labelEn },
    { path: 'portion.amount', value: entry.canonicalPortion.amount },
    { path: 'portion.unit', value: entry.canonicalPortion.unit },
    { path: 'portion.grams', value: entry.canonicalPortion.grams ?? null },
    { path: 'portion.preparationState', value: entry.lockedIdentity.preparationState },
    {
      path: 'portion.brandSpecific',
      value: Boolean(entry.lockedIdentity.brand || entry.manufacturerLabel),
    },
    {
      path: 'portion.brand',
      value: entry.lockedIdentity.brand || (entry.manufacturerLabel ? 'fairlife' : null),
    },
    { path: 'displayCategory', value: entry.classification.displayCategory },
    { path: 'calculationGroup', value: entry.classification.calculationGroup },
    { path: 'exchangeProfileId', value: entry.classification.exchangeProfileId },
    { path: 'classificationStatus', value: entry.classification.classificationStatus },
    { path: 'source', value: resolvedNutrients.source },
    { path: 'nutrients.proteinG', value: resolvedNutrients.nutrients.proteinG },
    { path: 'nutrients.carbsG', value: resolvedNutrients.nutrients.carbsG },
    { path: 'nutrients.fiberG', value: resolvedNutrients.nutrients.fiberG },
    { path: 'nutrients.fatG', value: resolvedNutrients.nutrients.fatG },
    { path: 'nutrients.saturatedFatG', value: resolvedNutrients.nutrients.saturatedFatG },
    {
      path: 'nutrients.polyunsaturatedFatG',
      value: resolvedNutrients.nutrients.polyunsaturatedFatG,
    },
    {
      path: 'nutrients.monounsaturatedFatG',
      value: resolvedNutrients.nutrients.monounsaturatedFatG,
    },
    { path: 'nutrients.declaredKcal', value: resolvedNutrients.nutrients.declaredKcal },
  ];
  applyFoodChange(food, {
    patches,
    by: approvedBy,
    action: before ? 'update' : 'update',
    reason: `Approved batch ${entry.operation}`,
  });
  return food;
}

function documentOpenResolutions(food, sourceReferenceId, approvedBy) {
  const item = auditFood(food);
  const openResolvable = item.alerts.filter(
    (alert) =>
      alert.severity === 'ERROR' &&
      alert.resolutionStatus !== 'resolved_documented' &&
      RESOLVABLE_CODES.has(alert.code)
  );
  for (const alert of openResolvable) {
    appendResolution(
      food,
      alert.code,
      sourceReferenceId,
      approvedBy,
      `Différence documentée contre source authoritative ${sourceReferenceId}`
    );
  }
  return auditFood(food);
}

export function previewApprovedBatch(batch, currentPayload, options = {}) {
  const validation = validateApprovedBatch(batch, currentPayload, options);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      foods: [],
      scopeBaseline: validation.scopeBaseline,
      perFoodErrors: validation.perFoodErrors || [],
    };
  }

  const currentById = new Map((currentPayload.foods || []).map((f) => [f.id, f]));
  const foods = [];
  for (const { entry, result } of validation.resolved) {
    const before = currentById.get(entry.id) || null;
    const after = projectFoodState(before, entry, result, batch.approvedBy);
    const beforeAudit = before ? auditFood(before) : null;
    const afterProjected = clone(after);
    documentOpenResolutions(afterProjected, result.sourceReferenceId, batch.approvedBy);
    const afterAudit = auditFood(afterProjected);
    foods.push({
      id: entry.id,
      operation: entry.operation,
      before,
      after: afterProjected,
      identity: entry.lockedIdentity,
      recordId: result.source.recordId,
      expectedRecordId: result.expectedRecordId ?? entry.sourcePlan?.expectedRecordId ?? null,
      selectedRecordId: result.selectedRecordId ?? result.source.recordId,
      cnfDescription: result.record
        ? { en: result.record.descriptionEn, fr: result.record.descriptionFr }
        : null,
      source: result.source,
      conversion: result.conversion,
      selection: result.selection,
      alertsBefore: beforeAudit?.alerts || [],
      alertsAfter: afterAudit.alerts,
      projectedCanVerify: canMarkVerified(afterProjected, afterAudit.alerts),
      projectedResolutions: afterProjected.auditResolutions || [],
    });
  }

  // Projected payload for scope check
  const projectedPayload = clone(currentPayload);
  const indexById = new Map(projectedPayload.foods.map((f, i) => [f.id, i]));
  for (const row of foods) {
    if (row.operation === 'add') projectedPayload.foods.push(row.after);
    else projectedPayload.foods[indexById.get(row.id)] = row.after;
  }
  const scopeCheck = checkBatchScope(validation.scopeBaseline, projectedPayload, batch);

  return {
    ok: scopeCheck.ok,
    errors: scopeCheck.ok ? [] : scopeCheck.errors,
    foods,
    batchId: batch.batchId,
    scopeBaseline: validation.scopeBaseline,
    scopeCheck,
  };
}

export function applyApprovedBatch(batch, currentPayload, options = {}) {
  const preview = previewApprovedBatch(batch, currentPayload, options);
  if (!preview.ok) return { ok: false, errors: preview.errors, preview };

  const nextPayload = clone(currentPayload);
  nextPayload.foods = Array.isArray(nextPayload.foods) ? [...nextPayload.foods] : [];
  const indexById = new Map(nextPayload.foods.map((f, i) => [f.id, i]));
  const datasetVersion = options.datasetVersion || batch.batchId || 'batch';
  const approvedBy = batch.approvedBy || 'KR Kinetics';
  const applied = [];
  const applyErrors = [];

  for (const row of preview.foods) {
    const entry = batch.foods.find((f) => f.id === row.id);
    const resolved = resolveEntryNutrients(
      entry,
      options.cnfFoods || loadCnfFoods(),
      batch.approvedAt,
      { batchId: batch.batchId, requireExpectedRecordId: options.requireExpectedRecordId }
    );
    if (!resolved.ok) {
      applyErrors.push(...(resolved.errors || [`resolve failed: ${entry.id}`]));
      continue;
    }
    let food =
      row.operation === 'add'
        ? createShellFood(entry)
        : clone(nextPayload.foods[indexById.get(entry.id)]);
    // Preserve create-unverified path for adds: project then verify only after audit.
    const createdUnverified = row.operation === 'add' ? food.status === 'unverified' : null;
    food = projectFoodState(food, entry, resolved, approvedBy);
    if (row.operation === 'add' && createdUnverified && food.status !== 'unverified') {
      // projectFoodState should not verify; ensure we still start unverified before markVerified.
    }
    let audited = documentOpenResolutions(food, resolved.sourceReferenceId, approvedBy);
    const eligibility = validateVerificationEligibility(food, audited, {
      sourceAuthoritative: validateSource(food).authoritative,
    });
    if (!eligibility.ok || !canMarkVerified(food, audited.alerts)) {
      applyErrors.push(
        `Cannot verify ${food.id}: open codes ${eligibility.codes.join(', ') || 'unknown'}`
      );
      continue;
    }
    const transactionId = markVerifiedComplete(food, approvedBy, datasetVersion);
    audited = auditFood(food);
    if (audited.errorCount > 0) {
      applyErrors.push(
        `${food.id} still has open ERROR after verify: ${audited.alerts
          .filter((a) => a.severity === 'ERROR')
          .map((a) => a.code)
          .join(', ')}`
      );
      continue;
    }
    if (row.operation === 'add') nextPayload.foods.push(food);
    else nextPayload.foods[indexById.get(entry.id)] = food;
    applied.push({
      id: food.id,
      operation: row.operation,
      recordId: resolved.source.recordId,
      expectedRecordId: resolved.expectedRecordId,
      selectedRecordId: resolved.selectedRecordId,
      transactionId,
      nutrients: food.nutrients,
      version: food.version,
      startedUnverified: row.operation === 'add' ? true : undefined,
    });
  }

  if (applyErrors.length || applied.length !== (batch.foods || []).length) {
    return {
      ok: false,
      errors: applyErrors.length
        ? applyErrors
        : [`Only ${applied.length}/${batch.foods.length} foods applied successfully`],
      applied,
      preview,
    };
  }

  nextPayload.meta = nextPayload.meta || {};
  nextPayload.meta.totalFoods = nextPayload.foods.length;
  nextPayload.meta.schemaVersion = nextPayload.meta.schemaVersion || 2;
  const hash = computeFoodsDataHash(nextPayload.foods);
  nextPayload.meta.exportDataHash = hash;

  if (options.pilotConfig && isPilotGuardActive(options.pilotConfig)) {
    const scope = checkPilotCandidateScope(currentPayload, nextPayload, options.pilotConfig);
    if (!scope.ok) return { ok: false, errors: scope.errors, applied, preview };
  }

  const scopeCheck = checkBatchScope(preview.scopeBaseline, nextPayload, batch);
  if (!scopeCheck.ok) {
    return { ok: false, errors: scopeCheck.errors, applied, preview, scopeCheck };
  }

  if (nextPayload.foods.length !== Number(batch.scope.expectedFinalFoodCount)) {
    return {
      ok: false,
      errors: [
        `Final food count ${nextPayload.foods.length} != expected ${batch.scope.expectedFinalFoodCount}`,
      ],
      applied,
      preview,
    };
  }

  return {
    ok: true,
    errors: [],
    payload: nextPayload,
    applied,
    dataHash: hash,
    preview,
    scopeBaseline: preview.scopeBaseline,
    scopeCheck,
  };
}

export {
  roundMacro,
  roundKcal,
  convertCnfPer100gToPortion,
  convertManufacturerBottleTo100ml,
  buildBatchScopeBaseline,
  checkBatchScope,
};
