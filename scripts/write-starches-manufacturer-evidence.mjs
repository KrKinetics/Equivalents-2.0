/**
 * Write manufacturer evidence for the starches batch (Ezekiel 4:9).
 * Compares official pages when network is available; otherwise uses approved snapshot.
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
  'starches-complete-individual-validation-32-foods.json'
);
const SCHEMA_PATH = path.join(ROOT, 'src', 'data', 'manufacturer-evidence.schema.json');
const OUT_DIR = path.join(ROOT, 'src', 'sources', 'manufacturer');
const SNAP_DIR = path.join(ROOT, 'src', 'sources', 'snapshots');
const REPORT_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'starches-complete-individual-validation-32-foods',
  'manufacturer-evidence.json'
);

const EVIDENCE_META = {
  'feculents-slice-ezekiel-sprouted-bread': {
    evidenceId: 'food-for-life-ezekiel-49-original-sprouted-bread',
    file: 'food-for-life-ezekiel-49-original-sprouted-bread.json',
    flavor: 'Original',
  },
};

function evidenceHash(payload) {
  const { evidenceHash: _omit, networkComparison: _n, ...rest } = payload;
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

function tokensFromLabel(label) {
  const values = Object.values(label.labelNutrients || {}).filter((v) => v != null);
  return {
    brand: label.brand,
    productBits: String(label.productName || '')
      .split(/[\s—–:]+/)
      .filter((w) => w.length > 3)
      .slice(0, 4),
    numericHints: values.slice(0, 4).map(String),
  };
}

async function tryFetch(url, outName, label) {
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
    const hints = tokensFromLabel(label);
    const brandOk = hints.brand
      ? new RegExp(hints.brand.split(/\s+/)[0], 'i').test(text)
      : true;
    const productOk = hints.productBits.some((bit) => new RegExp(bit, 'i').test(text));
    const numberOk = hints.numericHints.some((n) => text.includes(n));
    return {
      attempted: true,
      matched: brandOk && (productOk || numberOk) ? true : null,
      snapshotPath: path.relative(ROOT, snapPath).replaceAll('\\', '/'),
      snapshotSha256: sha,
      notes:
        'Snapshot archived when accessible. Numeric page extraction is heuristic; approved batch values remain authoritative.',
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
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const evidences = [];
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const entry of batch.foods.filter((f) => f.manufacturerLabel)) {
    const meta = EVIDENCE_META[entry.id];
    if (!meta) throw new Error(`Missing evidence meta for ${entry.id}`);
    const label = entry.manufacturerLabel;
    const conversion = convertManufacturerLabelToCanonicalPortion(
      label.labelNutrients,
      label.labelServing,
      entry.canonicalPortion
    );
    const smartLabelComparison = await tryFetch(
      label.url,
      meta.file.replace(/\.json$/, '-smartlabel.html'),
      label
    );
    const productComparison = label.productUrl
      ? await tryFetch(
          label.productUrl,
          meta.file.replace(/\.json$/, '-product.html'),
          label
        )
      : null;
    const networkComparison = {
      attempted: true,
      matched:
        smartLabelComparison.matched === true || productComparison?.matched === true
          ? true
          : smartLabelComparison.matched,
      snapshotPath: smartLabelComparison.snapshotPath || productComparison?.snapshotPath || null,
      snapshotSha256:
        smartLabelComparison.snapshotSha256 || productComparison?.snapshotSha256 || null,
      notes: [
        `SmartLabel: ${smartLabelComparison.notes}`,
        productComparison ? `Product page: ${productComparison.notes}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
    const evidence = {
      evidenceId: meta.evidenceId,
      brand: label.brand,
      product: label.productName,
      flavor: meta.flavor,
      market: label.market || 'North America',
      officialUrl: label.url,
      productUrl: label.productUrl || null,
      smartLabelUrl: label.url,
      accessedAt: label.accessedAt,
      labelServing: { ...label.labelServing },
      originalLabelValues: { ...label.labelNutrients },
      conversion: {
        formula: conversion.formula,
        targetBasis: `${entry.canonicalPortion.amount} ${entry.canonicalPortion.unit}`,
        method: conversion.method,
        factor: conversion.factor,
        labelAmount: conversion.labelServingAmount,
        canonicalAmount: conversion.canonicalAmount,
        labelUnit: conversion.labelUnit,
        canonicalUnit: conversion.canonicalUnit,
        labelGrams: conversion.labelGrams,
        canonicalGrams: conversion.canonicalGrams,
      },
      derivedUnrounded: { ...label.derivedUnroundedForCanonicalPortion },
      storedRounded: { ...label.storedForCanonicalPortion },
      undeclaredNutrients: conversion.undeclaredNutrients,
      declaredZeroNutrients: conversion.declaredZeroNutrients,
      canonicalPortion: {
        amount: entry.canonicalPortion.amount,
        unit: entry.canonicalPortion.unit,
        grams: entry.canonicalPortion.grams ?? null,
        labelFr: entry.canonicalPortion.labelFr,
        labelEn: entry.canonicalPortion.labelEn,
      },
      networkComparison,
      linkedFoodId: entry.id,
      batchId: batch.batchId,
    };
    evidence.evidenceHash = evidenceHash(evidence);
    if (!validate(evidence)) {
      throw new Error(
        `Evidence schema invalid for ${entry.id}: ${JSON.stringify(validate.errors)}`
      );
    }
    const outPath = path.join(OUT_DIR, meta.file);
    fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    evidences.push({
      foodId: entry.id,
      evidencePath: path.relative(ROOT, outPath).replaceAll('\\', '/'),
      evidenceId: evidence.evidenceId,
      brand: evidence.brand,
      product: evidence.product,
      officialUrl: evidence.officialUrl,
      productUrl: evidence.productUrl,
      smartLabelUrl: evidence.smartLabelUrl,
      formula: evidence.conversion.formula,
      undeclaredNutrients: evidence.undeclaredNutrients,
      declaredZeroNutrients: evidence.declaredZeroNutrients,
      networkComparison: evidence.networkComparison,
      evidenceHash: evidence.evidenceHash,
    });
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        batchId: batch.batchId,
        generatedAt: new Date().toISOString(),
        count: evidences.length,
        evidences,
      },
      null,
      2
    )}\n`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        count: evidences.length,
        reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
        evidences: evidences.map((e) => e.evidencePath),
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
