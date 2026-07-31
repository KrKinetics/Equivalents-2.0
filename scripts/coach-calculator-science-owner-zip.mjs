/**
 * Assemble KR_KINETICS_SCIENCE_UI_OWNER_REVIEW.zip
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportsDir = path.join(root, 'reports', 'coach-calculator-science-ui');
const restorationDir = path.join(root, 'reports', 'coach-calculator-restoration');
const staging = path.join(reportsDir, 'owner-package-staging');
const zipName = 'KR_KINETICS_SCIENCE_UI_OWNER_REVIEW.zip';
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

  const start = `# KR Kinetics — Science/UI Owner Review

## Démarrage

\`\`\`bash
npm run coach:preview
\`\`\`

**http://127.0.0.1:4188/**

## Contenu

| Élément | Chemin |
|---|---|
| Application | \`coach-calculator/\` |
| PDF FR/EN | \`generated-pdfs/\` |
| Captures 1440/768/390 | \`screenshots/\` |
| Rapport de tests | \`TEST_REPORT_SCIENCE_UI.md\` |
| Hashes protégés | \`protected-hashes.json\` |
| Fichiers modifiés | \`CHANGED_FILES.md\` |
| Commit | \`COMMIT.txt\` |

Branche : \`${branch}\`  
Commit : \`${commit}\`
`;
  fs.writeFileSync(path.join(staging, 'START_HERE.md'), start, 'utf8');
  fs.writeFileSync(path.join(staging, 'COMMIT.txt'), `${branch}\n${commit}\n`, 'utf8');

  copyDir(path.join(root, 'coach-calculator'), path.join(staging, 'coach-calculator'));

  const screenshotsSrc = path.join(reportsDir, 'screenshots');
  if (fs.existsSync(screenshotsSrc)) copyDir(screenshotsSrc, path.join(staging, 'screenshots'));
  const pdfsSrc = path.join(reportsDir, 'generated-pdfs');
  if (fs.existsSync(pdfsSrc)) copyDir(pdfsSrc, path.join(staging, 'generated-pdfs'));

  // Fallback to restoration artifacts if science reports missing some PDFs
  for (const [from, to] of [
    [path.join(restorationDir, 'xavier-plan-client-fr.pdf'), path.join(staging, 'generated-pdfs', 'xavier-plan-client-fr-science-ui.pdf')],
    [path.join(restorationDir, 'xavier-plan-client-en.pdf'), path.join(staging, 'generated-pdfs', 'xavier-plan-client-en-science-ui.pdf')],
  ]) {
    if (!fs.existsSync(to) && fs.existsSync(from)) copyFile(from, to);
  }

  const coachDataHash = sha256File(path.join(root, 'coach-calculator', 'coach-data.json'));
  const guidePdfHash = sha256File(path.join(root, 'coach-calculator', 'guides', 'kr-kinetics-equivalents-client-fr.pdf'));
  fs.writeFileSync(
    path.join(staging, 'protected-hashes.json'),
    JSON.stringify({
      coachDataSha256: coachDataHash,
      guidePdfSha256: guidePdfHash,
      expected: {
        coachDataSha256: '0ec66324b5aabf59266d6a1a16c15e1804adc9bc5ce6c445e2396fa480c9e978',
        guidePdfSha256: 'f4527bef880a6d0c19af00c98a98cb7c46aad0db8df19dde218f980979bd7f4d',
      },
      match:
        coachDataHash === '0ec66324b5aabf59266d6a1a16c15e1804adc9bc5ce6c445e2396fa480c9e978'
        && guidePdfHash === 'f4527bef880a6d0c19af00c98a98cb7c46aad0db8df19dde218f980979bd7f4d',
    }, null, 2),
    'utf8',
  );

  const changed = spawnSync('git', ['diff', '--name-only', 'origin/refactor/nutrition-source-of-truth...HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  const status = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
  fs.writeFileSync(
    path.join(staging, 'CHANGED_FILES.md'),
    `# Fichiers modifiés — Science/UI\n\n## Diff vs base\n\n\`\`\`\n${changed.stdout || '(none)'}\`\`\`\n\n## Working tree\n\n\`\`\`\n${status.stdout || '(clean)'}\`\`\`\n`,
    'utf8',
  );

  const testReportSrc = path.join(reportsDir, 'TEST_REPORT_SCIENCE_UI.md');
  if (fs.existsSync(testReportSrc)) {
    copyFile(testReportSrc, path.join(staging, 'TEST_REPORT_SCIENCE_UI.md'));
  } else {
    fs.writeFileSync(
      path.join(staging, 'TEST_REPORT_SCIENCE_UI.md'),
      `# Rapport de tests — Science/UI\n\nVoir sortie CI / \`npm test\` + \`npm run test:browser\` + audit science.\n\nCommit: ${commit}\n`,
      'utf8',
    );
  }

  const auditSrc = path.join(
    root,
    '_science_ui_extract',
    'KR_KINETICS_SCIENCE_UI_REVIEW_2026-07-31',
    'AUDIT_SCIENTIFIQUE_ET_PRODUIT_2026-07-31.md',
  );
  if (fs.existsSync(auditSrc)) {
    copyFile(auditSrc, path.join(staging, 'AUDIT_SCIENTIFIQUE_ET_PRODUIT_2026-07-31.md'));
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
