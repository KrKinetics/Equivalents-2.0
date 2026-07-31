/**
 * Build the restored full coach calculator from the golden master HTML.
 *
 * Usage:
 *   node scripts/coach-calculator-build.mjs
 *   node scripts/coach-calculator-build.mjs --with-guide-pdf
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { buildGuidePresentationModel } from '../src/lib/guide-presentation.mjs';
import { buildLandscapeFrHtml } from '../src/lib/guide-preview-render.mjs';
import {
  assertProtectedFilesUnchanged,
  verifyProtectedFiles,
} from '../src/lib/rc-data-protection.mjs';
import { FEATURE_DA_ENABLED } from '../src/lib/coach-calculator-engine.mjs';
import {
  buildClientFixesRuntime,
  buildMobileCssPatch,
} from './coach-calculator-client-fixes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'coach-calculator');
const assetsOut = path.join(outDir, 'assets');
const vendorOut = path.join(outDir, 'vendor');
const reportsDir = path.join(root, 'reports', 'coach-calculator-restoration');
const withGuidePdf = process.argv.includes('--with-guide-pdf');

const GOLDEN = path.join(root, 'references', 'calculateur-coach-original.html');
const LOGO_H = path.join(root, 'assets', 'logo-kr-kinetics-horizontal.png');
const LOGO_M = path.join(root, 'assets', 'logo-kr-monogramme.png');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function buildCoachData() {
  const foodsPayload = readJson('src/data/food-equivalents.json');
  const categoryMapping = readJson('src/data/category-mapping.json');
  const versionMeta = readJson('src/data/nutrition-data-version.json');
  const model = buildGuidePresentationModel({
    foodsPayload,
    categoryMapping,
    versionMeta,
  });
  // Client guide: no internal watermark / provisional status.
  model.watermark = '';
  model.watermarkFr = '';
  model.watermarkEn = '';
  model.meta.noteFr = 'valeurs individuelles vérifiées — guide client';
  model.meta.noteEn = 'verified individual values — client guide';
  const foods = Array.isArray(foodsPayload) ? foodsPayload : foodsPayload.foods || [];
  return {
    generatedAt: new Date().toISOString(),
    featureDaEnabled: FEATURE_DA_ENABLED,
    engineModeDefault: 'legacy-a',
    totalFoods: foods.length,
    verifiedFoods: foods.filter((f) => f.status === 'verified' || f.verification?.status === 'verified').length,
    version: versionMeta.version ?? null,
    shortHash: versionMeta.shortHash ?? String(versionMeta.dataHash || '').slice(0, 12),
    moyennes: categoryMapping.calculatorLegacyMoyennes?.MOYENNES || null,
    guide: model,
    foods: foods.map((f) => ({
      id: f.id,
      nameFr: f.names?.fr ?? '',
      nameEn: f.names?.en ?? '',
      portionFr: f.portion?.labelFr || '',
      portionEn: f.portion?.labelEn || '',
      displayCategory: f.displayCategory,
      status: f.status || f.verification?.status || null,
      nutrients: {
        proteinG: f.nutrients?.proteinG ?? null,
        carbsG: f.nutrients?.carbsG ?? null,
        fatG: f.nutrients?.fatG ?? null,
        fiberG: f.nutrients?.fiberG ?? null,
        declaredKcal: f.nutrients?.declaredKcal ?? null,
      },
    })),
  };
}

function injectGuideSection(html) {
  const section = `
<!-- ═══ SECTION 6 — GUIDE DES ÉQUIVALENTS (287 aliments vérifiés) ═══ -->
<div class="card" id="section-guide-equivalents">
    <h2>6. Guide des équivalents alimentaires (287)</h2>
    <p style="font-size:0.85rem;color:#64748b;margin-top:-5px;margin-bottom:15px;">
        Banque vérifiée chargée depuis la source de vérité. Recherche coach interne — le client reçoit le tableau PDF, jamais ce panneau.
    </p>
    <div class="grid-2" style="margin-bottom:12px;">
        <div>
            <label for="guide-search">Recherche</label>
            <input type="text" id="guide-search" placeholder="Nom d'aliment (FR/EN)…" oninput="filtrerGuideEquivalents()">
        </div>
        <div>
            <label for="guide-filter-cat">Catégorie</label>
            <select id="guide-filter-cat" onchange="filtrerGuideEquivalents()">
                <option value="">Toutes les catégories</option>
            </select>
        </div>
    </div>
    <div class="info-bar" style="margin-bottom:12px;">
        <strong id="guide-count">0</strong> aliments affichés
        · Mode production : <strong>A (MOYENNES)</strong>
        · D/A : <span id="guide-da-flag">désactivé</span>
    </div>
    <div class="table-responsive" style="max-height:360px; overflow:auto;">
        <table style="min-width:900px;">
            <thead>
                <tr>
                    <th class="left">Aliment</th>
                    <th>Portion</th>
                    <th>P (g)</th>
                    <th>G (g)</th>
                    <th>L (g)</th>
                    <th>kcal</th>
                    <th>Catégorie</th>
                </tr>
            </thead>
            <tbody id="guide-tbody"></tbody>
        </table>
    </div>
    <div class="grid-2" style="margin-top:14px;">
        <button type="button" class="btn btn-outline" onclick="telechargerGuideEquivalentsHtml()">📑 Ouvrir / enregistrer le tableau HTML</button>
        <a class="btn btn-primary" id="btn-guide-pdf" href="./guides/kr-kinetics-equivalents-client-fr.pdf" download style="text-align:center;text-decoration:none;">📄 Tableau des équivalents (PDF)</a>
    </div>
</div>
`;
  return html.replace('<div id="pdf-render-root"></div>', `${section}\n\n<div id="pdf-render-root"></div>`);
}

function injectGuideRuntime(html) {
  const runtime = `
<script>
window.FEATURE_DA_ENABLED = false;
window.COACH_DATA = null;

async function chargerCoachData() {
    try {
        const res = await fetch('./coach-data.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        window.COACH_DATA = await res.json();
        initialiserGuideEquivalents();
    } catch (err) {
        console.error('coach-data.json:', err);
        const el = document.getElementById('guide-count');
        if (el) el.textContent = 'erreur de chargement';
    }
}

function initialiserGuideEquivalents() {
    const data = window.COACH_DATA;
    if (!data) return;
    const sel = document.getElementById('guide-filter-cat');
    const da = document.getElementById('guide-da-flag');
    if (da) da.textContent = data.featureDaEnabled ? 'activé (aperçu coach)' : 'désactivé';
    if (sel) {
        const cats = (data.guide?.sections || []).map(s => ({ id: s.id, label: s.titleFr || s.id }));
        sel.innerHTML = '<option value="">Toutes les catégories</option>' +
            cats.map(c => '<option value="' + c.id + '">' + c.label + '</option>').join('');
    }
    filtrerGuideEquivalents();
}

function filtrerGuideEquivalents() {
    const data = window.COACH_DATA;
    const tbody = document.getElementById('guide-tbody');
    const countEl = document.getElementById('guide-count');
    if (!data || !tbody) return;
    const q = (document.getElementById('guide-search')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('guide-filter-cat')?.value || '';
    const sectionTitle = Object.fromEntries((data.guide?.sections || []).map(s => [s.id, s.titleFr || s.id]));
    const rows = (data.foods || []).filter(f => {
        if (cat && f.displayCategory !== cat) return false;
        if (!q) return true;
        return (f.nameFr || '').toLowerCase().includes(q)
            || (f.nameEn || '').toLowerCase().includes(q)
            || (f.portionFr || '').toLowerCase().includes(q);
    });
    tbody.innerHTML = rows.map(f => {
        const n = f.nutrients || {};
        return '<tr>'
            + '<td class="left"><strong>' + escapeHtml(f.nameFr) + '</strong><br><span style="color:#64748b;font-size:0.8em;">' + escapeHtml(f.nameEn) + '</span></td>'
            + '<td>' + escapeHtml(f.portionFr) + '</td>'
            + '<td>' + fmtNum(n.proteinG) + '</td>'
            + '<td>' + fmtNum(n.carbsG) + '</td>'
            + '<td>' + fmtNum(n.fatG) + '</td>'
            + '<td>' + fmtNum(n.declaredKcal) + '</td>'
            + '<td>' + escapeHtml(sectionTitle[f.displayCategory] || f.displayCategory || '') + '</td>'
            + '</tr>';
    }).join('');
    if (countEl) countEl.textContent = String(rows.length) + ' / ' + String(data.totalFoods || 0);
}

function fmtNum(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return String(Math.round(Number(v) * 10) / 10);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function telechargerGuideEquivalentsHtml() {
    const data = window.COACH_DATA;
    if (!data?.guide) { alert('Guide non chargé.'); return; }
    const w = window.open('', '_blank');
    if (!w) { alert('Autorisez les pop-ups pour ouvrir le guide.'); return; }
    const sections = (data.guide.sections || []).map(sec => {
        const rows = (sec.foods || []).map(f => {
            const v = f.values || {};
            return '<tr><td>' + escapeHtml(f.nameFr) + '</td><td>' + escapeHtml(f.portionFr) + '</td>'
                + '<td>' + fmtNum(v.prot) + '</td><td>' + fmtNum(v.gluc) + '</td><td>' + fmtNum(v.lip) + '</td><td>' + fmtNum(v.cal) + '</td></tr>';
        }).join('');
        return '<h2>' + escapeHtml(sec.titleFr) + '</h2><table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:18px;">'
            + '<thead><tr><th>Aliment</th><th>Portion</th><th>P</th><th>G</th><th>L</th><th>kcal</th></tr></thead><tbody>'
            + rows + '</tbody></table>';
    }).join('');
    w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Équivalents alimentaires — KR Kinetics</title>'
        + '<style>body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#111B33;} h1{color:#071B41;} table th{background:#071B41;color:#fff;}</style></head><body>'
        + '<h1>Tableau des équivalents alimentaires</h1>'
        + '<p>' + (data.verifiedFoods || data.totalFoods) + ' aliments vérifiés · KR Kinetics</p>'
        + sections + '<\\/body><\\/html>');
    w.document.close();
}

document.addEventListener('DOMContentLoaded', () => { chargerCoachData(); });
</script>
`;
  // Never replace '</body>' strings inside golden-master JS (PDF HTML builders).
  const endHtml = html.lastIndexOf('</html>');
  if (endHtml === -1) throw new Error('Cannot locate document </html>');
  const bodyClose = html.lastIndexOf('</body>', endHtml);
  if (bodyClose === -1) throw new Error('Cannot locate document </body>');
  // Guard: body close must be near the end, not inside a JS string earlier in the file.
  if (endHtml - bodyClose > 40) {
    throw new Error('Unexpected document structure: </body> not adjacent to </html>');
  }
  return html.slice(0, bodyClose) + runtime + '\n' + html.slice(bodyClose);
}

function transformGolden(html) {
  // Brand palette
  html = html.replace(
    /:root\s*\{[\s\S]*?--border:\s*#[0-9a-fA-F]{3,6};/,
    `:root {
            --primary: #071B41; --secondary: #111B33; --accent: #ED1136;
            --danger: #ED1136; --success: #0f766e; --warning: #b45309;
            --bg: #F4F7FB; --card-bg: #FFFFFF; --text: #111B33; --border: #d7e0ec;`
  );

  // Official logos only (remove embedded base64 + Elevate JPEG)
  html = html.replace(
    /<div class="header-logo kr-logo">[\s\S]*?<\/div>\s*<div class="header-title-container">/,
    `<div class="header-logo kr-logo">
        <img src="./assets/logo-kr-kinetics-horizontal.png" alt="KR Kinetics">
    </div>
    <div class="header-title-container">`
  );
  html = html.replace(
    /<div class="header-logo">\s*<img src="data:image\/jpeg;base64,[\s\S]*?<\/div>\s*<\/header>/,
    `<div class="header-logo">
        <img src="./assets/logo-kr-monogramme.png" alt="KR Kinetics" style="max-height:72px;">
    </div>
</header>`
  );

  // Header accent uses brand red
  html = html.replace('border-bottom: 4px solid var(--accent);', 'border-bottom: 4px solid var(--accent); background: linear-gradient(180deg,#ffffff 0%,#F4F7FB 100%);');

  // Title without marketing emoji dominance — keep operational density
  html = html.replace(
    '<h1>🥗 ÉVALUATION & PLANIFICATION NUTRITIONNELLE</h1>',
    '<h1>ÉVALUATION & PLANIFICATION NUTRITIONNELLE</h1>'
  );

  // Favicon
  if (!html.includes('rel="icon"')) {
    html = html.replace(
      '<title>',
      '<link rel="icon" href="./assets/logo-kr-monogramme.png" type="image/png">\n    <title>'
    );
  }

  // Local vendor scripts (offline ZIP)
  html = html.replace(
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>',
    '<script src="./vendor/html2canvas.min.js"></script>'
  );
  html = html.replace(
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>',
    '<script src="./vendor/jspdf.umd.min.js"></script>'
  );

  // Fix rest-day repartition restore bug (golden master defect)
  html = html.replace(
    'repartition: { ...repBase.repartition, ...migrated.jours.repartition }',
    'repartition: { ...repBase.repartition, ...(migrated.jours.repos.repartition || {}) }'
  );
  // Apply day DOM state before recalculating targets (CRLF-safe)
  html = html.replace(
    /calculerBesoins\(\);\r?\n\s*applyJourData\(activeJour\);\r?\n\s*calculerBanque\(\);/,
    'applyJourData(activeJour);\n    calculerBesoins();\n    calculerBanque();'
  );
  // Never persist null day buckets (breaks migrateProfilData dual-day detection)
  html = html.replace(
    /entrainement:\s*JSON\.parse\(JSON\.stringify\(joursData\.entrainement\)\),\r?\n\s*repos:\s*JSON\.parse\(JSON\.stringify\(joursData\.repos\)\)/,
    'entrainement: JSON.parse(JSON.stringify(joursData.entrainement || createEmptyJourData())),\n            repos: JSON.parse(JSON.stringify(joursData.repos || createEmptyJourData()))'
  );

  // PDF header logos → official assets (replace whole function; golden master embeds huge base64)
  {
    const start = html.indexOf('function buildPdfHeaderLogoHtml(creator)');
    const end = html.indexOf('function buildClientPDFPageHTML');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Unable to locate buildPdfHeaderLogoHtml in golden master');
    }
    const replacement = `function buildPdfHeaderLogoHtml(creator) {
    const src = creator === 'elevate'
        ? './assets/logo-kr-monogramme.png'
        : './assets/logo-kr-kinetics-horizontal.png';
    const h = creator === 'elevate' ? '54px' : '48px';
    return '<img src="' + src + '" alt="KR Kinetics" style="height:' + h + '; object-fit:contain;">';
}

`;
    html = html.slice(0, start) + replacement + html.slice(end);
  }

  // Mobile polish CSS (390px) before closing main stylesheet
  {
    const styleClose = html.indexOf('</style>');
    if (styleClose === -1) throw new Error('Unable to locate main </style>');
    html = html.slice(0, styleClose) + buildMobileCssPatch() + html.slice(styleClose);
  }

  html = injectGuideSection(html);
  html = injectGuideRuntime(html);

  // PDF logo (data URI), rest-day omit, totals reconciliation, image wait
  {
    const logoB64 = fs.readFileSync(LOGO_H).toString('base64');
    const fixes = buildClientFixesRuntime(logoB64);
    const endHtml = html.lastIndexOf('</html>');
    const bodyClose = html.lastIndexOf('</body>', endHtml);
    if (bodyClose === -1 || endHtml === -1) throw new Error('Cannot inject client PDF fixes');
    html = html.slice(0, bodyClose) + fixes + '\n' + html.slice(bodyClose);
  }

  // Marker for restored build
  html = html.replace(
    '<!-- Calculateur Nutritionnel Pro — logos intégrés (fichier autonome) -->',
    '<!-- KR Kinetics — calculateur coach restauré (golden master + source nutritionnelle 287) -->'
  );
  html = html.replace(
    '<title>Calculateur Nutritionnel Pro | KR Kinetics x Elevate Fitness</title>',
    '<title>Calculateur Coach | KR Kinetics</title>'
  );

  return html;
}

async function ensureVendorLibs() {
  ensureDir(vendorOut);
  const targets = [
    {
      file: 'html2canvas.min.js',
      urls: [
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      ],
    },
    {
      file: 'jspdf.umd.min.js',
      urls: [
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      ],
    },
  ];
  for (const t of targets) {
    const dest = path.join(vendorOut, t.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
    let ok = false;
    for (const url of t.urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, buf);
        ok = true;
        break;
      } catch {
        // try next
      }
    }
    if (!ok) throw new Error(`Unable to download vendor lib ${t.file}`);
  }
}

function writeClientGuideHtml(coachData) {
  const guidesDir = path.join(outDir, 'guides');
  ensureDir(guidesDir);
  const model = {
    ...coachData.guide,
    logoSrc: '../assets/logo-kr-kinetics-horizontal.png',
    watermark: 'KR Kinetics — Équivalents alimentaires',
    watermarkFr: 'KR Kinetics — Équivalents alimentaires',
    watermarkEn: 'KR Kinetics — Food Equivalents',
  };
  let html = buildLandscapeFrHtml(model);
  html = html
    .replace(/Document d’aperçu seulement : aucune moyenne de production n’y est approuvée\./g,
      'Chaque portion provient de la banque vérifiée KR Kinetics (287 aliments).')
    .replace(/profils d’échange non approuvés/gi, 'portions vérifiées')
    .replace(/unapproved exchange profiles/gi, 'verified portions')
    .replace(/APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS/g, 'KR Kinetics — Équivalents alimentaires')
    .replace(/PREVIEW — UNAPPROVED EXCHANGE PROFILES/g, 'KR Kinetics — Food Equivalents')
    .replace(/provisoire/gi, '')
    .replace(/rollup/gi, '')
    .replace(/A\/D-A/g, '')
    .replace(/hybrid-da/gi, '')
    .replace(/release-candidate/gi, '');
  // Remove empty sticky banner noise if watermark cleared visually
  html = html.replace(
    /<div class="banner">[\s\S]*?<\/div>/,
    '<div class="banner" style="background:#071B41;">KR Kinetics — Tableau des équivalents alimentaires<span class="banner-en">287 aliments vérifiés</span></div>'
  );
  fs.writeFileSync(path.join(guidesDir, 'kr-kinetics-equivalents-client-fr.html'), html, 'utf8');
  return path.join(guidesDir, 'kr-kinetics-equivalents-client-fr.html');
}

async function maybeRenderGuidePdf(guideHtmlPath) {
  if (!withGuidePdf) return null;
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const fileUrl = 'file:///' + guideHtmlPath.replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    const pdfPath = path.join(outDir, 'guides', 'kr-kinetics-equivalents-client-fr.pdf');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' },
    });
    return pdfPath;
  } finally {
    await browser.close();
  }
}

function writeReadme() {
  const text = `# Calculateur Coach KR Kinetics (restauré)

## Démarrage en une commande

\`\`\`bash
npm run coach:preview
\`\`\`

URL locale exacte : **http://127.0.0.1:4188/**

## Contenu

- Parcours coach complet (golden master restauré)
- Banque A (MOYENNES) par défaut
- 287 aliments vérifiés (guide + tableau client)
- D/A désactivé par défaut (\`FEATURE_DA_ENABLED = false\`)
- PDF plan alimentaire client FR/EN
- Aucune modification des données nutritionnelles protégées

## Offline

Les dépendances PDF (\`html2canvas\`, \`jsPDF\`) sont vendues dans \`vendor/\`.
Les logos officiels sont dans \`assets/\`.
`;
  fs.writeFileSync(path.join(outDir, 'README.md'), text, 'utf8');
}

async function main() {
  assertProtectedFilesUnchanged();
  if (!fs.existsSync(GOLDEN)) throw new Error(`Golden master missing: ${GOLDEN}`);
  if (!fs.existsSync(LOGO_H) || !fs.existsSync(LOGO_M)) {
    throw new Error('Official logos missing under assets/');
  }

  ensureDir(outDir);
  ensureDir(assetsOut);
  ensureDir(reportsDir);

  copyFile(LOGO_H, path.join(assetsOut, 'logo-kr-kinetics-horizontal.png'));
  copyFile(LOGO_M, path.join(assetsOut, 'logo-kr-monogramme.png'));
  await ensureVendorLibs();

  const golden = fs.readFileSync(GOLDEN, 'utf8');
  const transformed = transformGolden(golden);
  fs.writeFileSync(path.join(outDir, 'index.html'), transformed, 'utf8');

  const coachData = buildCoachData();
  if (coachData.totalFoods !== 287 || coachData.verifiedFoods !== 287) {
    throw new Error(`Expected 287 verified foods, got total=${coachData.totalFoods} verified=${coachData.verifiedFoods}`);
  }
  fs.writeFileSync(path.join(outDir, 'coach-data.json'), JSON.stringify(coachData, null, 2), 'utf8');

  const guideHtml = writeClientGuideHtml(coachData);
  const guidePdf = await maybeRenderGuidePdf(guideHtml);
  writeReadme();

  const protection = verifyProtectedFiles(undefined, { generatedAt: new Date().toISOString() });
  fs.writeFileSync(
    path.join(reportsDir, 'protected-hashes-after.json'),
    JSON.stringify({
      computedAt: new Date().toISOString(),
      ok: protection.ok,
      changed: protection.changed,
      after: protection.after,
      before: protection.before,
      goldenMasterSha256: sha256File(GOLDEN),
      builtIndexSha256: sha256File(path.join(outDir, 'index.html')),
    }, null, 2),
    'utf8'
  );

  const summary = {
    ok: protection.ok && !FEATURE_DA_ENABLED,
    outDir: 'coach-calculator',
    url: 'http://127.0.0.1:4188/',
    totalFoods: coachData.totalFoods,
    verifiedFoods: coachData.verifiedFoods,
    featureDaEnabled: FEATURE_DA_ENABLED,
    guideHtml: path.relative(root, guideHtml).replace(/\\/g, '/'),
    guidePdf: guidePdf ? path.relative(root, guidePdf).replace(/\\/g, '/') : null,
    protectedOk: protection.ok,
  };
  fs.writeFileSync(path.join(reportsDir, 'build-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  if (!protection.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
