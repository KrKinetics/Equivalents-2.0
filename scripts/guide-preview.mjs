import fs from 'node:fs/promises';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { PDFParse } from 'pdf-parse';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { buildGuidePresentationModel } from '../src/lib/guide-presentation.mjs';
import { buildLandscapeEnHtml, buildLandscapeFrHtml, buildMobileBilingualHtml } from '../src/lib/guide-preview-render.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src', 'data');
const outDir = path.join(root, 'reports', 'guide-preview');
const localAssetsDir = path.join(outDir, 'assets');
const screenshotsDir = path.join(outDir, 'screenshots');
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));

// Prefer opaque full logo (transparent PNG can render as grey checkerboard in PDF viewers).
const LOGO_CANDIDATES = [
  path.join(root, 'assets', 'kinetics-logo.svg'),
  path.join(root, 'assets', 'kinetics-logo-full.png'),
  path.join(root, 'assets', 'kinetics-logo-transparent.png'),
];

function resolveLogoAsset() {
  for (const candidate of LOGO_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`KR Kinetics logo not found. Tried: ${LOGO_CANDIDATES.join(', ')}`);
}

function prepareLocalLogo() {
  const source = resolveLogoAsset();
  mkdirSync(localAssetsDir, { recursive: true });
  const ext = path.extname(source);
  const destName = `kinetics-logo${ext}`;
  const dest = path.join(localAssetsDir, destName);
  copyFileSync(source, dest);
  if (!existsSync(dest) || readFileSync(dest).length === 0) {
    throw new Error(`Failed to stage logo asset at ${dest}`);
  }
  // Relative URL from HTML files in reports/guide-preview/ — same directory tree (Chromium file:// safe).
  return {
    sourcePath: source,
    stagedPath: dest,
    relativeUrl: `./assets/${destName}`,
    absoluteFileUrl: pathToFileURL(dest).href,
  };
}

const [foodsPayload, categoryMapping, versionMeta] = await Promise.all([
  readJson('food-equivalents.json'),
  readJson('category-mapping.json'),
  readJson('nutrition-data-version.json'),
]);
const i18n = require(path.join(root, 'i18n.js'));
const logo = prepareLocalLogo();
const model = buildGuidePresentationModel({
  foodsPayload,
  categoryMapping,
  versionMeta,
  sectionMetaFromI18n: i18n.SECTIONS,
});
model.logoSrc = logo.relativeUrl;
model.logoAbsoluteUrl = logo.absoluteFileUrl;
if (model.meta.totalFoods !== 287 || model.meta.verifiedFoods !== 287) {
  throw new Error(`Guide requires 287 verified foods; found ${model.meta.totalFoods}/${model.meta.verifiedFoods}`);
}

await fs.mkdir(screenshotsDir, { recursive: true });
const htmlFiles = {
  'kr-kinetics-landscape-fr.html': buildLandscapeFrHtml(model),
  'kr-kinetics-landscape-en.html': buildLandscapeEnHtml(model),
  'kr-kinetics-mobile-bilingual.html': buildMobileBilingualHtml(model),
};
await Promise.all(Object.entries(htmlFiles).map(([name, html]) => fs.writeFile(path.join(outDir, name), html, 'utf8')));
for (const name of ['landscape-fr.html', 'landscape-en.html', 'mobile-bilingual.html', 'landscape-fr.pdf', 'mobile-bilingual.pdf']) {
  rmSync(path.join(outDir, name), { force: true });
}

const dataHash = computeFoodsDataHash(foodsPayload.foods);
const ids = foodsPayload.foods.map((food) => food.id).sort();
const categoryCounts = Object.fromEntries(categoryMapping.displayCategories.map((category) => [
  category.id, foodsPayload.foods.filter((food) => food.displayCategory === category.id).length,
]));
const manifest = {
  foodIds: ids,
  categoryCounts,
  dataHash,
  shortHash: shortHash(dataHash),
  version: versionMeta.version,
  generatedAt: versionMeta.lastModifiedAt || new Date().toISOString(),
  logo: {
    sourcePath: path.relative(root, logo.sourcePath).replace(/\\/g, '/'),
    stagedPath: path.relative(root, logo.stagedPath).replace(/\\/g, '/'),
    htmlSrc: logo.relativeUrl,
  },
  sourcePaths: {
    foods: 'src/data/food-equivalents.json',
    categoryMapping: 'src/data/category-mapping.json',
    version: 'src/data/nutrition-data-version.json',
    i18n: 'i18n.js',
  },
};
await fs.writeFile(path.join(outDir, 'guide-data-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

async function assertImagesLoaded(page) {
  const result = await page.evaluate(async () => {
    const images = [...document.images];
    await Promise.all(images.map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))));
    return images.map((img) => ({
      src: img.getAttribute('src'),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      ok: img.complete === true && img.naturalWidth > 0,
    }));
  });
  const broken = result.filter((img) => !img.ok);
  if (!result.length) throw new Error('No images found in preview HTML');
  if (broken.length) {
    throw new Error(`Broken preview image(s): ${JSON.stringify(broken)}`);
  }
  return result;
}

async function detectOrphanCategoryTitles(pdfPath, sectionTitles) {
  const buffer = readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const pages = textResult.pages || [];
    // Fallback: split full text by form feed if pages array absent
    const pageTexts = pages.length
      ? pages.map((page) => String(page.text || page.contents || ''))
      : String(textResult.text || '').split('\f');
    const failures = [];
    for (let i = 0; i < pageTexts.length; i += 1) {
      const raw = pageTexts[i].replace(/\r/g, '').trim();
      if (!raw) {
        failures.push({ page: i + 1, reason: 'unexpected_blank_page' });
        continue;
      }
      const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) continue;
      const last = lines[lines.length - 1];
      const prev = lines[lines.length - 2] || '';
      for (const title of sectionTitles) {
        const titleFr = title.split(' · ')[0];
        // Orphan: page ends with category title (optionally followed only by subtitle fragment) and no food-like line after.
        if (last === title || last === titleFr || (prev === titleFr && last.length < 80 && !/\d/.test(last))) {
          // Allow if page also contains a food portion pattern / digit-heavy nutrition line earlier after title
          const titleIdx = lines.findIndex((line) => line === title || line === titleFr);
          const after = titleIdx >= 0 ? lines.slice(titleIdx + 1) : [];
          const hasFoodish = after.some((line) => /\d/.test(line) && line.length > 8);
          if (!hasFoodish) {
            failures.push({ page: i + 1, reason: 'orphan_category_title', title: titleFr, lastLines: lines.slice(-3) });
          }
        }
      }
    }
    return { pageCount: pageTexts.length, failures };
  } finally {
    await parser.destroy();
  }
}

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const qa = {
  generatedAt: manifest.generatedAt,
  images: [],
  sections: [],
  pdfOrphans: {},
  headerReadability: [],
  overall: 'PASS',
};
try {
  const landscape = await browser.newPage();
  await landscape.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await landscape.goto(pathToFileURL(path.join(outDir, 'kr-kinetics-landscape-fr.html')).href, { waitUntil: 'networkidle0' });
  qa.images.push({ page: 'landscape-fr', images: await assertImagesLoaded(landscape) });

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
  await mobile.goto(pathToFileURL(path.join(outDir, 'kr-kinetics-mobile-bilingual.html')).href, { waitUntil: 'networkidle0' });
  qa.images.push({ page: 'mobile-bilingual', images: await assertImagesLoaded(mobile) });

  // Header readability: mobile must not use narrow multi-column tables; th text shouldn't be single-letter wraps.
  const mobileHeaderCheck = await mobile.evaluate(() => {
    const tables = [...document.querySelectorAll('table')];
    const ths = [...document.querySelectorAll('th')];
    const narrow = ths.filter((th) => {
      const style = getComputedStyle(th);
      return th.scrollHeight > 48 && th.clientWidth < 36;
    }).length;
    return {
      tableCount: tables.length,
      thinHeaderCount: narrow,
      pass: tables.length === 0 && narrow === 0,
    };
  });
  qa.headerReadability.push({ mode: 'mobile', ...mobileHeaderCheck });
  if (!mobileHeaderCheck.pass) qa.overall = 'FAIL';

  const pdfHeader = `
    <div style="font-size:8px;width:100%;padding:0 10mm;color:#64748b;font-family:Arial,sans-serif;">
      <span>KR Kinetics — Aperçu guide (non approuvé)</span>
    </div>`;
  const pdfFooter = `
    <div style="font-size:8px;width:100%;padding:0 10mm;color:#64748b;font-family:Arial,sans-serif;display:flex;justify-content:space-between;">
      <span>Profils d’échange non approuvés</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;
  await landscape.pdf({
    path: path.join(outDir, 'kr-kinetics-landscape-fr.pdf'),
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: pdfHeader,
    footerTemplate: pdfFooter,
    margin: { top: '14mm', right: '8mm', bottom: '14mm', left: '8mm' },
  });
  await mobile.pdf({
    path: path.join(outDir, 'kr-kinetics-mobile-bilingual.pdf'),
    format: 'A4',
    landscape: false,
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: pdfHeader,
    footerTemplate: pdfFooter,
    margin: { top: '14mm', right: '10mm', bottom: '16mm', left: '10mm' },
  });

  const sectionTitles = model.sections.map((section) => `${section.titleFr} · ${section.titleEn}`);
  qa.pdfOrphans.mobile = await detectOrphanCategoryTitles(
    path.join(outDir, 'kr-kinetics-mobile-bilingual.pdf'),
    sectionTitles,
  );
  qa.pdfOrphans.landscape = await detectOrphanCategoryTitles(
    path.join(outDir, 'kr-kinetics-landscape-fr.pdf'),
    model.sections.map((section) => section.titleFr),
  );
  if (qa.pdfOrphans.mobile.failures.length || qa.pdfOrphans.landscape.failures.length) {
    qa.overall = 'FAIL';
  }

  for (const section of model.sections) {
    for (const [mode, page] of [['landscape', landscape], ['mobile', mobile]]) {
      const selector = `#section-${section.legacyKey}`;
      const element = await page.$(selector);
      if (!element) throw new Error(`Missing section ${selector}`);
      await element.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: path.join(screenshotsDir, `${mode}-${section.legacyKey}.png`) });
      const checks = await page.$eval(selector, (node, isMobile) => {
        const cells = [...node.querySelectorAll(isMobile ? '.item-name, .tag, .item-kcal' : 'td,th')];
        const header = node.querySelector('.section-header');
        const lead = node.querySelector('.section-lead');
        const headerStyle = header ? getComputedStyle(header) : null;
        const leadStyle = lead ? getComputedStyle(lead) : null;
        const overflowNodes = isMobile
          ? [node, ...node.querySelectorAll('.item-name, .tag')]
          : [node, ...node.querySelectorAll('td,th')];
        return {
          overflow: {
            pass: overflowNodes.every((el) => el.scrollWidth <= el.clientWidth + 1),
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          },
          truncatedCells: {
            pass: cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 2),
            count: cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 2).length,
          },
          orphanHeader: {
            pass: Boolean(leadStyle)
              && (leadStyle.breakInside === 'avoid' || leadStyle.pageBreakInside === 'avoid')
              && Boolean(headerStyle)
              && (headerStyle.breakAfter === 'avoid' || headerStyle.pageBreakAfter === 'avoid'),
          },
          logoInDocument: {
            pass: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
          },
        };
      }, mode === 'mobile');
      const pass = Object.values(checks).every((check) => check.pass);
      qa.sections.push({ section: section.legacyKey, mode, checks, status: pass ? 'PASS' : 'FAIL' });
      if (!pass) qa.overall = 'FAIL';
    }
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(outDir, 'visual-qa.json'), `${JSON.stringify(qa, null, 2)}\n`, 'utf8');
if (qa.overall !== 'PASS') {
  console.error('Guide preview visual QA FAILED', JSON.stringify(qa.pdfOrphans, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Guide preview: ${model.meta.totalFoods} foods, ${model.sections.length} sections, visual QA PASS, logo ${logo.relativeUrl}.`);
}
