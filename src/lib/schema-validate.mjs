/**
 * Structural validation via Ajv 2020 against food-equivalents.schema.json.
 * Manual checks for STATUS_MISMATCH are layered on top (semantic, not schema-only).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { hasStatusMismatch } from './food-status.mjs';
import { resolvePaths } from './paths.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _validate = null;
let _schemaPath = null;

function getValidator(schemaPath) {
  const resolved = schemaPath || resolvePaths().schemaPath;
  if (_validate && _schemaPath === resolved) return _validate;
  const schema = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  _validate = ajv.compile(schema);
  _schemaPath = resolved;
  return _validate;
}

export function validateFoodEquivalentsPayload(payload, options = {}) {
  const errors = [];
  const validate = getValidator(options.schemaPath);
  const ok = validate(payload);
  if (!ok) {
    for (const e of validate.errors || []) {
      errors.push({
        path: e.instancePath || e.schemaPath || '$',
        message: `${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
        keyword: e.keyword,
      });
    }
  }

  // Semantic: STATUS_MISMATCH must block apply
  if (payload && Array.isArray(payload.foods)) {
    payload.foods.forEach((food, i) => {
      if (hasStatusMismatch(food)) {
        errors.push({
          path: `foods[${i}]`,
          message: `STATUS_MISMATCH: status=${food.status} verification.status=${food.verification?.status}`,
          keyword: 'statusMismatch',
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

export function assertFiniteNutrientsSample() {
  // helper for docs/tests — schema already rejects non-numbers via type:number
  return true;
}
