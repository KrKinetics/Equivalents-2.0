/**
 * Download official CNF 2026 ZIP (if needed) and normalize relational CSVs.
 *
 * Usage: npm run sources:cnf:sync
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATASET_ID = '1b6139bd-ed7e-4043-bc28-ff00e10f3109';
const ZIP_URL =
  'https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip';
const OUT_DIR = path.join(ROOT, 'src', 'sources', 'cnf-2026');
const ZIP_PATH = path.join(OUT_DIR, 'cnf_fcen_all-files-data_2026.zip');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const SNAPSHOT_DIR = path.join(ROOT, 'src', 'sources', 'snapshots');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function ensureZip() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(ZIP_PATH) && fs.statSync(ZIP_PATH).size > 1_000_000) {
    console.log('Reusing existing CNF ZIP', ZIP_PATH);
    return;
  }
  console.log('Downloading CNF 2026 ZIP…');
  const result = spawnSync(
    'curl',
    ['-L', '--fail', '--retry', '3', '-o', ZIP_PATH, ZIP_URL],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`CNF download failed: ${result.stderr || result.stdout}`);
  }
}

function extractZip() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${ZIP_PATH.replaceAll("'", "''")}' -DestinationPath '${RAW_DIR.replaceAll("'", "''")}' -Force`,
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`CNF extract failed: ${result.stderr || result.stdout}`);
  }
}

function writeDownloadManifest(zipHash) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const manifest = {
    datasetId: DATASET_ID,
    title: 'Canadian Nutrient File, 2026',
    publisher: 'Health Canada',
    portalPage: `https://open.canada.ca/data/en/dataset/${DATASET_ID}`,
    downloadedAt: new Date().toISOString(),
    zipUrl: ZIP_URL,
    zipPath: path.relative(ROOT, ZIP_PATH).replaceAll('\\', '/'),
    zipSha256: zipHash,
    rawDirectory: path.relative(ROOT, RAW_DIR).replaceAll('\\', '/'),
  };
  const out = path.join(SNAPSHOT_DIR, 'cnf-2026-download.json');
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return out;
}

function main() {
  ensureZip();
  const zipHash = sha256File(ZIP_PATH);
  extractZip();
  const manifestPath = writeDownloadManifest(zipHash);
  const normalize = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'normalize-cnf-2026.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  process.stdout.write(normalize.stdout || '');
  process.stderr.write(normalize.stderr || '');
  if (normalize.status !== 0) process.exitCode = normalize.status || 1;
  else console.log('Download manifest:', manifestPath);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
