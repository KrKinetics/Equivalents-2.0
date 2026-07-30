import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { buildGuidePresentationModel } from '../src/lib/guide-presentation.mjs';
import { buildLandscapeEnHtml, buildLandscapeFrHtml, buildMobileBilingualHtml } from '../src/lib/guide-preview-render.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src', 'data');
const outDir = path.join(root, 'reports', 'guide-preview');
const screenshotsDir = path.join(outDir, 'screenshots');
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));

const [foodsPayload, categoryMapping, versionMeta] = await Promise.all([
  readJson('food-equivalents.json'), readJson('category-mapping.json'), readJson('nutrition-data-version.json'),
]);
const i18n = require(path.join(root, 'i18n.js'));
const model = buildGuidePresentationModel({ foodsPayload, categoryMapping, versionMeta, sectionMetaFromI18n: i18n.SECTIONS });
if (model.meta.totalFoods !== 287 || model.meta.verifiedFoods !== 287) throw new Error(`Guide requires 287 verified foods; found ${model.meta.totalFoods}/${model.meta.verifiedFoods}`);

await fs.mkdir(screenshotsDir, { recursive: true });
const htmlFiles = {
  'kr-kinetics-landscape-fr.html': buildLandscapeFrHtml(model),
  'kr-kinetics-landscape-en.html': buildLandscapeEnHtml(model),
  'kr-kinetics-mobile-bilingual.html': buildMobileBilingualHtml(model),
};
await Promise.all(Object.entries(htmlFiles).map(([name, html]) => fs.writeFile(path.join(outDir, name), html, 'utf8')));
// Remove legacy short names if present from earlier drafts.
await Promise.all(['landscape-fr.html', 'landscape-en.html', 'mobile-bilingual.html', 'landscape-fr.pdf', 'mobile-bilingual.pdf']
  .map((name) => fs.rm(path.join(outDir, name), { force: true })));

const dataHash = computeFoodsDataHash(foodsPayload.foods);
const ids = foodsPayload.foods.map((food) => food.id).sort();
const categoryCounts = Object.fromEntries(categoryMapping.displayCategories.map((category) => [
  category.id, foodsPayload.foods.filter((food) => food.displayCategory === category.id).length,
]));
const manifest = {
  foodIds: ids, categoryCounts, dataHash, shortHash: shortHash(dataHash), version: versionMeta.version,
  generatedAt: versionMeta.lastModifiedAt || new Date().toISOString(),
  sourcePaths: {
    foods: 'src/data/food-equivalents.json',
    categoryMapping: 'src/data/category-mapping.json',
    version: 'src/data/nutrition-data-version.json',
    i18n: 'i18n.js',
  },
};
await fs.writeFile(path.join(outDir, 'guide-data-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 180000 });
const qa = { generatedAt: manifest.generatedAt, sections: [], overall: 'PASS' };
try {
  const landscape = await browser.newPage();
  await landscape.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await landscape.goto(pathToFileURL(path.join(outDir, 'kr-kinetics-landscape-fr.html')).href, { waitUntil: 'load' });
  await landscape.pdf({ path: path.join(outDir, 'kr-kinetics-landscape-fr.pdf'), format: 'A4', landscape: true, printBackground: true, margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' } });

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 420, height: 760, deviceScaleFactor: 1 });
  await mobile.goto(pathToFileURL(path.join(outDir, 'kr-kinetics-mobile-bilingual.html')).href, { waitUntil: 'load' });
  await mobile.pdf({ path: path.join(outDir, 'kr-kinetics-mobile-bilingual.pdf'), width: '420px', height: '760px', printBackground: true, margin: { top: '8mm', right: '6mm', bottom: '8mm', left: '6mm' } });

  for (const section of model.sections) {
    for (const [mode, page] of [['landscape', landscape], ['mobile', mobile]]) {
      const selector = `#section-${section.legacyKey}`;
      const element = await page.$(selector);
      if (!element) throw new Error(`Missing section ${selector}`);
      await element.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: path.join(screenshotsDir, `${mode}-${section.legacyKey}.png`) });
      const checks = await page.$eval(selector, (node) => {
        const cells = [...node.querySelectorAll('td,th')];
        const header = node.querySelector('.section-header');
        const firstRow = node.querySelector('tbody tr');
        const headerStyle = header ? getComputedStyle(header) : null;
        const rowStyle = firstRow ? getComputedStyle(firstRow) : null;
        return {
          overflow: { pass: node.scrollWidth <= node.clientWidth + 1, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth },
          truncatedCells: { pass: cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 1), count: cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1).length },
          orphanHeader: {
            pass: (!headerStyle || headerStyle.breakAfter === 'avoid' || headerStyle.pageBreakAfter === 'avoid')
              && (!rowStyle || rowStyle.breakInside === 'avoid' || rowStyle.pageBreakInside === 'avoid'),
          },
        };
      });
      const pass = Object.values(checks).every((check) => check.pass);
      qa.sections.push({ section: section.legacyKey, mode, checks, status: pass ? 'PASS' : 'FAIL' });
      if (!pass) qa.overall = 'FAIL';
    }
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(outDir, 'visual-qa.json'), `${JSON.stringify(qa, null, 2)}\n`, 'utf8');
console.log(`Guide preview: ${model.meta.totalFoods} foods, ${model.sections.length} sections, visual QA ${qa.overall}.`);
