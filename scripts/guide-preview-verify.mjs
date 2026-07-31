import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { buildGuidePresentationModel } from '../src/lib/guide-presentation.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src', 'data');
const outDir = path.join(root, 'reports', 'guide-preview');
const readJson = async (name, base = dataDir) => JSON.parse(await fs.readFile(path.join(base, name), 'utf8'));

const [foodsPayload, mapping, version, manifest, visualQa] = await Promise.all([
  readJson('food-equivalents.json'),
  readJson('category-mapping.json'),
  readJson('nutrition-data-version.json'),
  readJson('guide-data-manifest.json', outDir),
  readJson('visual-qa.json', outDir),
]);

const i18n = require(path.join(root, 'i18n.js'));
const model = buildGuidePresentationModel({
  foodsPayload,
  categoryMapping: mapping,
  versionMeta: version,
  sectionMetaFromI18n: i18n.SECTIONS,
});

const names = [
  'kr-kinetics-landscape-fr.html',
  'kr-kinetics-landscape-en.html',
  'kr-kinetics-mobile-bilingual.html',
];
const html = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await fs.readFile(path.join(outDir, name), 'utf8')])));
const expectedOutputs = [
  ...names,
  'kr-kinetics-landscape-fr.pdf',
  'kr-kinetics-mobile-bilingual.pdf',
  'guide-data-manifest.json',
  'visual-qa.json',
];
const failures = [];
let passed = 0;
const check = (number, label, condition) => {
  if (condition) passed += 1;
  else failures.push(`${number}. ${label}`);
};

const idsFrom = (text) => [...text.matchAll(/data-food-id="([^"]+)"/g)].map((match) => match[1]);
const valuesFrom = (text) => [...text.matchAll(/data-food-id="([^"]+)"([\s\S]*?)(?=data-food-id="|<\/section>|$)/g)].map((match) => ({
  id: match[1],
  values: [...match[2].matchAll(/data-value-key="([^"]+)" data-raw="([^"]*)"/g)].map((value) => [value[1], value[2]]),
}));

const outputStats = await Promise.all(expectedOutputs.map(async (name) => fs.stat(path.join(outDir, name)).catch(() => null)));
const expectedIds = foodsPayload.foods.map((food) => food.id).sort();
const modelIds = model.sections.flatMap((section) => section.foods.map((food) => food.id));
const expectedCounts = Object.fromEntries(
  mapping.displayCategories.map((category) => [
    category.id,
    foodsPayload.foods.filter((food) => food.displayCategory === category.id).length,
  ]),
);
const frIds = idsFrom(html['kr-kinetics-landscape-fr.html']);
const enIds = idsFrom(html['kr-kinetics-landscape-en.html']);
const mobileIds = idsFrom(html['kr-kinetics-mobile-bilingual.html']);
const frRows = valuesFrom(html['kr-kinetics-landscape-fr.html']);
const enRows = valuesFrom(html['kr-kinetics-landscape-en.html']);
const forbiddenCounts = /\b(?:207|267|277)\s+(?:aliments?|foods?)\b/i;
const allHtml = Object.values(html);

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const byId = Object.fromEntries(foodsPayload.foods.map((food) => [food.id, food]));
const presentationSource = readFileSync(path.join(root, 'src', 'lib', 'guide-presentation.mjs'), 'utf8')
  + readFileSync(path.join(root, 'src', 'lib', 'guide-preview-render.mjs'), 'utf8');
const importsI18nFoods = /\bI18N\.FOODS\b|\bFOODS\s*\[/.test(presentationSource);
const frNameOk = frIds.every((id) => {
  const expected = byId[id]?.portion?.labelFr || byId[id]?.names?.fr || '';
  return html['kr-kinetics-landscape-fr.html'].includes(`data-food-id="${id}"`)
    && html['kr-kinetics-landscape-fr.html'].includes(esc(expected));
});
const enNameOk = enIds.every((id) => {
  const expected = byId[id]?.portion?.labelEn || byId[id]?.names?.en || '';
  return html['kr-kinetics-landscape-en.html'].includes(esc(expected));
});

const nullCoercionLeak = model.sections.some((section) => section.foods.some((food) => {
  for (const column of section.columns) {
    if (column.key === 'aliment') continue;
    const value = food.values?.[column.key];
    if (value != null) continue;
    // Landscape only (tables); mobile may omit null nutrient tags.
    const frCell = html['kr-kinetics-landscape-fr.html'].match(
      new RegExp(`data-food-id="${food.id}"[\\s\\S]*?data-value-key="${column.key}" data-raw="([^"]*)"[^>]*>([^<]*)`),
    );
    if (!frCell) return true;
    const raw = frCell[1];
    const shown = frCell[2].trim();
    if (raw !== '' && raw !== 'null') return true;
    if (shown === '0' || shown === '0,0' || shown === '0.0') return true;
    if (shown !== '—') return true;
  }
  return false;
}));

const rebuild = buildGuidePresentationModel({
  foodsPayload,
  categoryMapping: mapping,
  versionMeta: version,
  sectionMetaFromI18n: i18n.SECTIONS,
});
const reproducible = JSON.stringify(rebuild.sections.map((s) => ({
  id: s.id,
  foods: s.foods.map((f) => ({ id: f.id, values: f.values })),
}))) === JSON.stringify(model.sections.map((s) => ({
  id: s.id,
  foods: s.foods.map((f) => ({ id: f.id, values: f.values })),
})));

const logoStaged = manifest.logo?.stagedPath
  ? existsSync(path.join(root, manifest.logo.stagedPath))
  : false;
const logoOkInHtml = allHtml.every((text) =>
  text.includes('class="brand-logo"')
  && (
    text.includes('./assets/logo-kr-kinetics-horizontal.png')
    || text.includes('./assets/kinetics-logo.png')
    || text.includes('./assets/kinetics-logo.svg')
  ));
const frHtml = html['kr-kinetics-landscape-fr.html'];
const enHtml = html['kr-kinetics-landscape-en.html'];
const mobileHtml = html['kr-kinetics-mobile-bilingual.html'];
const coverCopyOk =
  frHtml.includes('287 aliments vérifiés')
  && frHtml.includes('Mise à jour : 30 juillet 2026')
  && enHtml.includes('287 verified foods')
  && enHtml.includes('Updated: July 30, 2026')
  && mobileHtml.includes('287 aliments vérifiés')
  && mobileHtml.includes('287 verified foods')
  && mobileHtml.includes('Mise à jour : 30 juillet 2026')
  && mobileHtml.includes('Updated: July 30, 2026')
  && allHtml.every((text) =>
    text.includes('APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS')
    && text.includes('PREVIEW — UNAPPROVED EXCHANGE PROFILES'));
const mobileUsesCards = html['kr-kinetics-mobile-bilingual.html'].includes('class="item-list"')
  && html['kr-kinetics-mobile-bilingual.html'].includes('class="item-tags"')
  && !/<table[\s>]/i.test(html['kr-kinetics-mobile-bilingual.html']);
const imagesQaOk = Array.isArray(visualQa.images)
  && visualQa.images.length >= 2
  && visualQa.images.every((entry) => entry.images?.every((img) => img.complete === true && img.naturalWidth > 0));
const orphanQaOk = visualQa.pdfOrphans?.mobile?.failures?.length === 0
  && visualQa.pdfOrphans?.landscape?.failures?.length === 0;
const headerQaOk = visualQa.headerReadability?.every((entry) => entry.pass);

check(1, 'exactly 287 IDs in the manifest', manifest.foodIds?.length === 287 && new Set(manifest.foodIds).size === 287);
check(2, 'each ID appears exactly once per linguistic edition', frIds.length === 287 && new Set(frIds).size === 287 && enIds.length === 287 && new Set(enIds).size === 287 && mobileIds.length === 287 && new Set(mobileIds).size === 287);
check(3, 'category counts are exact', JSON.stringify(manifest.categoryCounts) === JSON.stringify(expectedCounts));
check(4, 'no food is missing from the model/HTML', expectedIds.every((id) => modelIds.includes(id) && frIds.includes(id) && enIds.includes(id) && mobileIds.includes(id)));
check(5, 'no extra food appears', modelIds.length === 287 && frIds.every((id) => expectedIds.includes(id)) && enIds.every((id) => expectedIds.includes(id)));
check(6, 'required preview outputs exist', outputStats.every((stat) => stat?.size > 0));
check(7, 'no food names come from I18N.FOODS arrays', !importsI18nFoods && frNameOk && enNameOk);
check(8, 'null nutrients are shown as — and never coerced to zero', !nullCoercionLeak);
check(9, 'no unapproved average row is displayed', allHtml.every((text) => !/class="average"|class="average-row"|>\s*(?:Moyenne|Average)\s*</i.test(text)));
check(10, 'obsolete food-count texts 207/267/277 are absent', allHtml.every((text) => !forbiddenCounts.test(text)));
check(11, 'coverage labels show 287 verified foods in FR and EN', coverCopyOk && model.meta.totalFoods === 287);
check(12, 'no horizontal overflow (visual QA)', visualQa.sections.every((entry) => entry.checks?.overflow?.pass));
check(13, 'no truncated cells/tags (visual QA)', visualQa.sections.every((entry) => entry.checks?.truncatedCells?.pass));
check(14, 'section lead keeps title with first content (CSS avoid)', visualQa.sections.every((entry) => entry.checks?.orphanHeader?.pass));
check(15, 'PDF orphan category titles absent', orphanQaOk);
check(16, 'logo staged locally and images load (complete && naturalWidth>0)', logoStaged && logoOkInHtml && imagesQaOk);
check(17, 'internal TOC anchors resolve in HTML', model.sections.every((section) => allHtml.every((text) => text.includes(`href="#section-${section.legacyKey}"`) && text.includes(`id="section-${section.legacyKey}"`))));
check(18, 'FR and EN share the same IDs and numeric values', JSON.stringify(frIds) === JSON.stringify(enIds) && JSON.stringify(frRows) === JSON.stringify(enRows));
check(19, 'manifest keeps the dataset hash', manifest.dataHash === computeFoodsDataHash(foodsPayload.foods) && manifest.shortHash === shortHash(manifest.dataHash) && manifest.version === version.version);
check(20, 'build reproducible, mobile cards, header readability, visual QA green', reproducible && mobileUsesCards && headerQaOk && visualQa.overall === 'PASS' && visualQa.sections.length === model.sections.length * 2);

if (failures.length) {
  console.error(`Guide preview verification failed (${passed}/20 passed):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Guide preview verification: PASS (20/20 checks).');
}
