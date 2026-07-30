/**
 * Apply a corrected food-equivalents JSON exported from the review UI.
 * Never reimports generate.js / i18n.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { backupFile } from '../src/lib/backup.mjs';
import { validateFoodEquivalentsPayload } from '../src/lib/schema-validate.mjs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const VERSION_PATH = path.join(ROOT, 'src', 'data', 'nutrition-data-version.json');
const BACKUPS = path.join(ROOT, 'backups');

function usage() {
  console.error('Usage: npm run data:apply -- path/to/food-equivalents.corrected.json');
  process.exit(1);
}

function main() {
  const input = process.argv[2];
  if (!input) usage();
  const inputPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(inputPath)) {
    console.error('File not found:', inputPath);
    process.exit(1);
  }

  const incoming = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const validation = validateFoodEquivalentsPayload(incoming);
  if (!validation.ok) {
    console.error('Invalid JSON — apply aborted:');
    for (const e of validation.errors.slice(0, 50)) {
      console.error(` - ${e.path}: ${e.message}`);
    }
    if (validation.errors.length > 50) console.error(` ... +${validation.errors.length - 50} more`);
    process.exit(2);
  }

  // Preserve IDs: require same ID set as current if current exists
  if (fs.existsSync(TARGET)) {
    const current = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
    const curIds = new Set((current.foods || []).map((f) => f.id));
    const newIds = new Set((incoming.foods || []).map((f) => f.id));
    for (const id of curIds) {
      if (!newIds.has(id)) {
        console.error(`Apply refused: missing existing id ${id}`);
        process.exit(3);
      }
    }
    const backupPath = backupFile(TARGET, BACKUPS, 'pre-apply');
    console.log('Backup created:', backupPath);
  }

  incoming.meta = incoming.meta || {};
  incoming.meta.totalFoods = incoming.foods.length;
  incoming.meta.lastAppliedAt = new Date().toISOString();
  incoming.meta.schemaVersion = incoming.meta.schemaVersion || 2;

  fs.writeFileSync(TARGET, JSON.stringify(incoming, null, 2), 'utf8');

  const hash = computeFoodsDataHash(incoming.foods);
  let version = {
    version: '1.0.0',
    status: 'draft',
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
    previousVersion: null,
    changeSummary: 'Applied corrected dataset via data:apply',
  };
  if (fs.existsSync(VERSION_PATH)) {
    version = { ...version, ...JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8')) };
  }
  if (version.status === 'approved') {
    version.previousVersion = version.version;
    version.status = 'review';
    version.approvedAt = null;
    version.approvedBy = null;
    version.changeSummary = 'Dataset modified after approval — returned to review';
  }
  version.dataHash = hash;
  version.shortHash = shortHash(hash);
  version.lastModifiedAt = new Date().toISOString();
  version.totalFoods = incoming.foods.length;
  version.verifiedFoods = incoming.foods.filter((f) => f.status === 'verified').length;
  version.unverifiedFoods = version.totalFoods - version.verifiedFoods;
  fs.writeFileSync(VERSION_PATH, JSON.stringify(version, null, 2), 'utf8');

  console.log('Applied:', inputPath, '→', TARGET);
  console.log('dataHash:', shortHash(hash));

  const audit = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'audit-food-equivalents.mjs')], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  process.exit(audit.status ?? 1);
}

main();
