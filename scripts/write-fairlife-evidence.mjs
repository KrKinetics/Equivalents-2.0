/**
 * Write manufacturer evidence files for fairlife Core Power Elite (chocolate + vanilla)
 * from the approved batch specification. Optionally fetch official pages when network works.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'pilot-nutrition-validation-6-foods.json'
);
const SCHEMA_PATH = path.join(ROOT, 'src', 'data', 'manufacturer-evidence.schema.json');
const OUT_DIR = path.join(ROOT, 'src', 'sources', 'manufacturer');
const SNAP_DIR = path.join(ROOT, 'src', 'sources', 'snapshots');

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
        notes: `HTTP ${res.status}; network comparison not completed`,
      };
    }
    const text = await res.text();
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    const snapPath = path.join(SNAP_DIR, outName);
    fs.writeFileSync(snapPath, text, 'utf8');
    const sha = crypto.createHash('sha256').update(text).digest('hex');
    return {
      attempted: true,
      matched: null,
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

function buildEvidence(entry, networkComparison) {
  const label = entry.manufacturerLabel;
  const evidence = {
    evidenceId: `fairlife-${entry.id}`,
    brand: entry.lockedIdentity.brand || 'fairlife',
    product: 'Core Power Elite',
    flavor: /vanilla/i.test(entry.lockedIdentity.en) ? 'vanilla' : 'chocolate',
    market: 'US manufacturer label (fairlife.com)',
    officialUrl: label.url,
    accessedAt: label.accessedAt,
    labelServing: { ...label.labelServing },
    originalLabelValues: { ...label.labelNutrients },
    conversion: {
      formula: `valuePer100ml = valueBottle × 100 / ${label.labelServing.amount}`,
      targetBasis: '100 ml',
      bottleMl: label.labelServing.amount,
    },
    derivedUnrounded: { ...label.derivedUnroundedPer100Ml },
    storedRounded: { ...label.storedPer100Ml },
    networkComparison,
    linkedFoodId: entry.id,
    batchId: 'pilot-nutrition-validation-6-foods',
    evidenceHash: '',
  };
  evidence.evidenceHash = evidenceHash(evidence);
  return evidence;
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const foods = batch.foods.filter((f) => f.manufacturerLabel);
  const written = [];
  for (const entry of foods) {
    const flavor = /vanilla/i.test(entry.id) ? 'vanilla' : 'chocolate';
    const network = await tryFetch(entry.manufacturerLabel.url, `fairlife-core-power-elite-${flavor}.html`);
    const evidence = buildEvidence(entry, network);
    if (!validate(evidence)) {
      console.error(validate.errors);
      process.exitCode = 1;
      return;
    }
    const outPath = path.join(OUT_DIR, `fairlife-core-power-elite-${flavor}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    written.push({ path: outPath, evidenceHash: evidence.evidenceHash, network });
  }
  console.log(JSON.stringify({ ok: true, written }, null, 2));
}

main();
