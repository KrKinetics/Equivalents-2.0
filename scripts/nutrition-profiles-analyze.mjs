import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAllLevels, buildDecisionsMarkdown, buildProfileCandidates, NUTRIENT_KEYS } from '../src/lib/exchange-profile-analysis.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src', 'data');
const outDir = path.join(root, 'reports', 'exchange-profile-decision');
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));
const csvEscape = (value) => {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (rows, columns) => `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')).join('\n')}\n`;

function statisticsRows(collection) {
  return Object.values(collection).map((cohort) => {
    const row = { level: cohort.level, id: cohort.id, totalCount: cohort.totalCount, verifiedCount: cohort.verifiedCount, medoidId: cohort.medoid?.id ?? null };
    for (const nutrient of NUTRIENT_KEYS) {
      for (const field of ['numericCount', 'nullCount', 'mean', 'median', 'p25', 'p75', 'min', 'max', 'stddev', 'mad']) {
        row[`${nutrient}_${field}`] = cohort.nutrients[nutrient][field];
      }
    }
    return row;
  });
}

const statColumns = ['level', 'id', 'totalCount', 'verifiedCount', 'medoidId',
  ...NUTRIENT_KEYS.flatMap((nutrient) => ['numericCount', 'nullCount', 'mean', 'median', 'p25', 'p75', 'min', 'max', 'stddev', 'mad'].map((field) => `${nutrient}_${field}`))];

function htmlTable(title, rows) {
  if (!rows.length) return `<section><h2>${title}</h2><p>Aucune donnée</p></section>`;
  const columns = Object.keys(rows[0]);
  return `<section><h2>${title}</h2><input class="filter" placeholder="Filtrer ${title}" aria-label="Filtrer ${title}">
  <table><thead><tr>${columns.map((column) => `<th data-sort>${column}</th>`).join('')}</tr></thead><tbody>
  ${rows.map((row) => `<tr>${columns.map((column) => `<td>${row[column] == null ? '—' : String(row[column]).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</td>`).join('')}</tr>`).join('')}
  </tbody></table></section>`;
}

function overviewHtml(analysis, groupRows, categoryRows, profileRows, outliers) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Analyse des profils d’échange</title><style>
  body{font:14px Arial;margin:20px;color:#172033}.watermark{background:#991b1b;color:#fff;padding:12px;font-weight:bold;position:sticky;top:0}
  section{margin:26px 0;overflow:auto}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccd5e1;padding:5px;text-align:right}
  th:first-child,td:first-child{text-align:left}th{background:#e2e8f0;cursor:pointer;position:sticky;top:40px}.filter{padding:8px;width:320px;max-width:90%}
  </style></head><body><div class="watermark">APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS</div>
  <h1>Analyse descriptive</h1><p>${analysis.meta.totalFoods} aliments · ${analysis.meta.verifiedFoods} vérifiés · ${analysis.meta.exchangeProfileCount} profils</p>
  ${htmlTable('Groupes', groupRows)}${htmlTable('Catégories', categoryRows)}${htmlTable('Profils d’échange', profileRows)}${htmlTable('Valeurs éloignées', outliers)}
  <script>document.querySelectorAll('section').forEach(s=>{const f=s.querySelector('.filter');if(f)f.addEventListener('input',()=>s.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(f.value.toLowerCase())));s.querySelectorAll('th').forEach((h,i)=>h.onclick=()=>{const b=s.querySelector('tbody'),rows=[...b.rows],asc=h.dataset.asc!=='1';rows.sort((a,c)=>{const x=a.cells[i].textContent,y=c.cells[i].textContent,nx=Number(x),ny=Number(y);return (Number.isFinite(nx)&&Number.isFinite(ny)?nx-ny:x.localeCompare(y,'fr'))*(asc?1:-1)}).forEach(r=>b.appendChild(r));h.dataset.asc=asc?'1':'0'})})</script>
  </body></html>`;
}

const foodsPayload = await readJson('food-equivalents.json');
const [categoryMapping, groupsDoc, versionMeta] = await Promise.all([
  readJson('category-mapping.json'), readJson('calculation-groups.json'), readJson('nutrition-data-version.json'),
]);
const analysis = analyzeAllLevels(foodsPayload.foods, categoryMapping, groupsDoc);
const candidates = buildProfileCandidates(analysis);
const groups = statisticsRows(analysis.calculationGroup);
const categories = statisticsRows(analysis.displayCategory);
const profiles = statisticsRows(analysis.exchangeProfileId);
const legacyRows = Object.values(analysis.calculationGroup).filter((cohort) => cohort.legacyComparison).flatMap((cohort) =>
  ['mean', 'median', 'medoid'].flatMap((basis) => NUTRIENT_KEYS.map((nutrient) => ({
    calculationGroup: cohort.id, basis, nutrient, reference: cohort.legacyComparison.ref[nutrient],
    delta: cohort.legacyComparison.deltas[basis][nutrient], outsideToleranceCount: cohort.foodsOutsideLegacyTolerance.count,
  }))));
const outliers = [...Object.values(analysis.calculationGroup), ...Object.values(analysis.displayCategory), ...Object.values(analysis.exchangeProfileId)]
  .flatMap((cohort) => cohort.fiveFurthest.map((food, rank) => ({ level: cohort.level, cohortId: cohort.id, rank: rank + 1, ...food })));

await fs.mkdir(outDir, { recursive: true });
const files = new Map([
  ['overview.json', `${JSON.stringify({ generatedAt: versionMeta.lastModifiedAt, version: versionMeta.version, dataHash: versionMeta.dataHash, ...analysis }, null, 2)}\n`],
  ['overview.html', overviewHtml(analysis, groups, categories, profiles, outliers)],
  ['group-statistics.csv', toCsv(groups, statColumns)],
  ['category-statistics.csv', toCsv(categories, statColumns)],
  ['exchange-profile-statistics.csv', toCsv(profiles, statColumns)],
  ['legacy-comparison.csv', toCsv(legacyRows, ['calculationGroup', 'basis', 'nutrient', 'reference', 'delta', 'outsideToleranceCount'])],
  ['outliers.csv', toCsv(outliers, ['level', 'cohortId', 'rank', 'id', 'nameFr', 'distanceScore'])],
  ['profile-candidates.json', `${JSON.stringify(candidates, null, 2)}\n`],
  ['DECISIONS_REQUIRED.md', buildDecisionsMarkdown(analysis, candidates)],
]);
await Promise.all([...files].map(([name, contents]) => fs.writeFile(path.join(outDir, name), contents, 'utf8')));
console.log(`Exchange profile analysis: ${analysis.meta.totalFoods} foods, ${analysis.meta.verifiedFoods} verified, ${analysis.meta.exchangeProfileCount} profiles; wrote ${files.size} files.`);
