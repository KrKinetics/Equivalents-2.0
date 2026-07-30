/**
 * Write manufacturer evidence for NOW Foods MCT Oil from the approved fats batch.
 * Optionally fetches the official page when network is available.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { convertManufacturerLabelToCanonicalPortion } from '../src/lib/nutrition-batch-math.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'fats-complete-individual-validation-23-foods.json'
);
const SCHEMA_PATH = path.join(ROOT, 'src', 'data', 'manufacturer-evidence.schema.json');
const OUT_PATH = path.join(
  ROOT,
  'src',
  'sources',
  'manufacturer',
  'now-foods-mct-oil-liquid.json'
);
const SNAP_DIR = path.join(ROOT, 'src', 'sources', 'snapshots');
const REPORT_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'fats-complete-individual-validation-23-foods',
  'manufacturer-evidence.json'
);

function evidenceHash(payload) {
  const { evidenceHash: _omit, networkComparison: _n, ...rest } = payload;
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

async function tryFetch(url, outName) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'KR-Kinetics-nutrition-batch/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return {
        attempted: true,
        matched: null,
        snapshotPath: null,
        snapshotSha256: null,
        notes: `HTTP ${res.status}; network comparison not completed. Approved specification values used.`,
      };
    }
    const text = await res.text();
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    const snapPath = path.join(SNAP_DIR, outName);
    fs.writeFileSync(snapPath, text, 'utf8');
    const sha = crypto.createHash('sha256').update(text).digest('hex');
    const hasMct = /mct/i.test(text);
    const has130 = /\b130\b/.test(text);
    const has14 = /\b14\b/.test(text);
    return {
      attempted: true,
      matched: hasMct && has130 && has14 ? true : null,
      snapshotPath: path.relative(ROOT, snapPath).replaceAll('\\', '/'),
      snapshotSha256: sha,
      notes:
        'Snapshot archived. Numeric page extraction is heuristic; approved spec values remain authoritative.',
    };
  } catch (error) {
    return {
      attempted: true,
      matched: null,
      snapshotPath: null,
      snapshotSha256: null,
      notes: `Network unavailable or fetch failed (${error.message}); approved specification values used without network comparison.`,
    };
  }
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
  const entry = batch.foods.find((f) => f.id === 'matieres-grasses-mct-oil');
  if (!entry?.manufacturerLabel) {
    throw new Error('MCT manufacturer label missing from approved fats batch');
  }
  const label = entry.manufacturerLabel;
  const conversion = convertManufacturerLabelToCanonicalPortion(
    label.labelNutrients,
    label.labelServing.amount,
    entry.canonicalPortion.amount
  );
  const networkComparison = await tryFetch(label.url, 'now-foods-mct-oil-liquid.html');
  const evidence = {
    evidenceId: 'now-foods-matieres-grasses-mct-oil',
    brand: label.brand || 'NOW Foods',
    product: label.productName || 'MCT Oil Liquid',
    flavor: 'unflavored',
    market: label.market || 'North America',
    officialUrl: label.url,
    accessedAt: label.accessedAt,
    labelServing: label.labelServing,
    originalLabelValues: { ...label.labelNutrients },
    conversion: {
      formula: conversion.formula,
      targetBasis: `${entry.canonicalPortion.amount} ${entry.canonicalPortion.unit}`,
      bottleMl: label.labelServing.amount,
    },
    derivedUnrounded: { ...label.derivedUnroundedForCanonicalPortion },
    storedRounded: { ...label.storedForCanonicalPortion },
    networkComparison,
    linkedFoodId: entry.id,
    batchId: batch.batchId,
  };
  evidence.evidenceHash = evidenceHash(evidence);

  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(evidence)) {
    throw new Error(`MCT evidence schema invalid: ${JSON.stringify(validate.errors)}`);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        batchId: batch.batchId,
        generatedAt: new Date().toISOString(),
        evidence,
      },
      null,
      2
    )}\n`
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        evidencePath: path.relative(ROOT, OUT_PATH).replaceAll('\\', '/'),
        reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
        networkComparison,
        storedRounded: evidence.storedRounded,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
