/**
 * Assemble KR_KINETICS_FULL_COACH_CALCULATOR_OWNER_REVIEW.zip
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportsDir = path.join(root, 'reports', 'coach-calculator-restoration');
const staging = path.join(reportsDir, 'owner-package-staging');
const zipName = 'KR_KINETICS_FULL_COACH_CALCULATOR_OWNER_REVIEW.zip';
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

function main() {
  rmrf(staging);
  ensureDir(staging);

  const start = `# Calculateur coach KR Kinetics — examen propriétaire

## Démarrage (une commande)

Depuis la racine du dépôt (après \`npm install\`) :

\`\`\`bash
npm run coach:preview
\`\`\`

Puis ouvrir exactement :

**http://127.0.0.1:4188/**

Le dossier \`coach-calculator/\` de ce ZIP contient l'application déjà buildée. Vous pouvez aussi servir ce dossier avec n'importe quel serveur statique sur le port 4188.

## Contenu de ce paquet

| Élément | Chemin |
|---|---|
| Application | \`coach-calculator/\` |
| Capture desktop 1440 | \`screenshots/desktop-1440.png\` |
| Capture tablette 768 | \`screenshots/tablet-768.png\` |
| Capture mobile 390 | \`screenshots/mobile-390.png\` |
| Profil Xavier (JSON) | \`xavier-profile-export.json\` |
| Plan texte | \`xavier-plan-text.txt\` |
| PDF client FR | \`xavier-plan-client-fr.pdf\` |
| PDF client EN | \`xavier-plan-client-en.pdf\` |
| Tableau équivalents 287 | \`equivalents-client-287.pdf\` |
| Rapport de parité | \`parity-report.md\` |
| Checklist P0 | \`CHECKLIST_PARITE_FONCTIONNELLE.md\` |
| Rapport des tests | \`test-report.md\` |
| Hashes avant | \`protected-hashes-before.json\` |
| Hashes après | \`protected-hashes-after.json\` |
| Capture summary | \`capture-summary.json\` |

## Notes produit

- Outil privé coach — le client ne reçoit que le PDF portions + le tableau des équivalents.
- Mode A (production) par défaut ; D/A désactivé (\`FEATURE_DA_ENABLED = false\`).
- Source nutritionnelle : 287 aliments vérifiés, hashes protégés inchangés.
`;
  fs.writeFileSync(path.join(staging, 'START_HERE.md'), start, 'utf8');

  copyDir(path.join(root, 'coach-calculator'), path.join(staging, 'coach-calculator'));
  copyDir(path.join(reportsDir, 'screenshots'), path.join(staging, 'screenshots'));

  for (const rel of [
    'xavier-profile-export.json',
    'xavier-plan-text.txt',
    'xavier-plan-client-fr.pdf',
    'xavier-plan-client-en.pdf',
    'equivalents-client-287.pdf',
    'parity-report.md',
    'PR13-CORRECTIONS.md',
    'CHECKLIST_PARITE_FONCTIONNELLE.md',
    'test-report.md',
    'parity-baseline.md',
    'protected-hashes-before.json',
    'protected-hashes-after.json',
    'capture-summary.json',
    'build-summary.json',
  ]) {
    const src = path.join(reportsDir, rel);
    if (!fs.existsSync(src)) throw new Error(`Missing artifact: ${rel}`);
    copyFile(src, path.join(staging, rel));
  }

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Prefer tar (available on modern Windows) for portable zip
  const tar = spawnSync('tar', ['-a', '-cf', zipPath, '-C', staging, '.'], { cwd: root, encoding: 'utf8' });
  if (tar.status !== 0) {
    // Fallback: PowerShell Compress-Archive
    const ps = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path "${staging}\\*" -DestinationPath "${zipPath}" -Force`],
      { cwd: root, encoding: 'utf8' }
    );
    if (ps.status !== 0) {
      throw new Error(`zip failed: ${tar.stderr || ''}\n${ps.stderr || ''}`);
    }
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

  const inventory = {
    zip: zipName,
    bytes: fs.statSync(zipPath).size,
    url: 'http://127.0.0.1:4188/',
    files: walk(staging).sort(),
  };
  fs.writeFileSync(path.join(reportsDir, 'owner-zip-inventory.json'), JSON.stringify(inventory, null, 2));
  console.log(JSON.stringify({ ok: true, zipPath, files: inventory.files.length, bytes: inventory.bytes }, null, 2));
}

main();
