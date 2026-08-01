/**
 * Assemble KR_KINETICS_ELEVATE_DUAL_BRAND_OWNER_REVIEW.zip (local only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  REQUIRED_COACH_DATA_SHA256,
  REQUIRED_GUIDE_PDF_SHA256,
} from './coach-calculator-science-ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportsDir = path.join(root, 'reports', 'coach-calculator-dual-brand');
const artifactsDir = path.join(root, 'verify-elevate-dual-brand');
const staging = path.join(reportsDir, 'owner-package-staging');
const zipName = 'KR_KINETICS_ELEVATE_DUAL_BRAND_OWNER_REVIEW.zip';
const zipPath = path.join(root, zipName);

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else copyFile(from, to);
  }
}

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function main() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();

  rmrf(staging);
  ensureDir(staging);

  const start = `# KR Kinetics × Elevate Fitness — Dual Brand Owner Review

## Démarrage

\`\`\`bash
npm run coach:preview
\`\`\`

**http://127.0.0.1:4188/**

## Contenu

| Élément | Chemin |
|---|---|
| Application | \`coach-calculator/\` |
| PDF KR / Elevate FR-EN | \`generated-pdfs/\` |
| Captures 1440/768/390 | \`screenshots/\` |
| Aperçus contrôlés | \`review/\` |
| Rapport de validation | \`TEST_REPORT_DUAL_BRAND.md\` |
| Hashes protégés | \`protected-hashes.json\` |
| Commit | \`COMMIT.txt\` |

Branche : \`${branch}\`  
Commit : \`${commit}\`
`;
  fs.writeFileSync(path.join(staging, 'START_HERE.md'), start, 'utf8');
  fs.writeFileSync(path.join(staging, 'COMMIT.txt'), `${branch}\n${commit}\n`, 'utf8');

  copyDir(path.join(root, 'coach-calculator'), path.join(staging, 'coach-calculator'));

  for (const folder of ['screenshots', 'generated-pdfs', 'review']) {
    const src = path.join(artifactsDir, folder);
    if (fs.existsSync(src)) copyDir(src, path.join(staging, folder));
  }

  const coachDataHash = sha256File(path.join(root, 'coach-calculator', 'coach-data.json'));
  const guidePdfHash = sha256File(path.join(root, 'coach-calculator', 'guides', 'kr-kinetics-equivalents-client-fr.pdf'));
  fs.writeFileSync(
    path.join(staging, 'protected-hashes.json'),
    JSON.stringify({
      coachDataSha256: coachDataHash,
      guidePdfSha256: guidePdfHash,
      expected: {
        coachDataSha256: REQUIRED_COACH_DATA_SHA256,
        guidePdfSha256: REQUIRED_GUIDE_PDF_SHA256,
      },
      match:
        coachDataHash === REQUIRED_COACH_DATA_SHA256
        && guidePdfHash === REQUIRED_GUIDE_PDF_SHA256,
    }, null, 2),
    'utf8',
  );

  const changed = spawnSync('git', ['diff', '--name-only', 'origin/refactor/nutrition-source-of-truth...HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  const status = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
  fs.writeFileSync(
    path.join(staging, 'CHANGED_FILES_DUAL_BRAND.md'),
    `# Fichiers corrigés — double marque\n\n## Diff vs base\n\n\`\`\`\n${changed.stdout || '(none)'}\`\`\`\n\n## Working tree\n\n\`\`\`\n${status.stdout || '(clean)'}\`\`\`\n`,
    'utf8',
  );

  const reportSrc = path.join(reportsDir, 'TEST_REPORT_DUAL_BRAND.md');
  if (fs.existsSync(reportSrc)) {
    copyFile(reportSrc, path.join(staging, 'TEST_REPORT_DUAL_BRAND.md'));
  } else {
    fs.writeFileSync(
      path.join(staging, 'TEST_REPORT_DUAL_BRAND.md'),
      `# Rapport de validation — KR Kinetics × Elevate Fitness\n\nCommit: ${commit}\n\nVoir \`npm test\`, \`npm run test:browser\`, \`npm run nutrition:final-audit\` et \`npm run test:dual-brand\`.\n`,
      'utf8',
    );
  }

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const tar = spawnSync('tar', ['-a', '-cf', zipPath, '-C', staging, '.'], { cwd: root, encoding: 'utf8' });
  if (tar.status !== 0) {
    const ps = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path "${staging}\\*" -DestinationPath "${zipPath}" -Force`],
      { cwd: root, encoding: 'utf8' },
    );
    if (ps.status !== 0) throw new Error(`zip failed: ${tar.stderr || ''}\n${ps.stderr || ''}`);
  }

  const inventory = {
    zip: zipName,
    bytes: fs.statSync(zipPath).size,
    branch,
    commit,
    files: walk(staging).sort(),
  };
  ensureDir(reportsDir);
  fs.writeFileSync(path.join(reportsDir, 'owner-zip-inventory.json'), JSON.stringify(inventory, null, 2));
  console.log(JSON.stringify({ ok: true, zipPath, ...inventory, files: inventory.files.length }, null, 2));
}

main();
