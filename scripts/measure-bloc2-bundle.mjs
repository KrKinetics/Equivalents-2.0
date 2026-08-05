import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'coach-vercel');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

const files = walk(out);
const total = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const js = files.filter((f) => /\.(js|mjs)$/i.test(f));
const jsSize = js.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const htmlPath = path.join(out, 'workspace', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const cfg = fs.readFileSync(path.join(out, 'config.js'), 'utf8');
const sourceBank = fs.statSync(path.join(root, 'coach-calculator', 'coach-data.json')).size;

const markers = {
  nameFr_count: (html.match(/"nameFr"/g) || []).length,
  MOYENNES_real: /pro:\s*\{\s*p:\s*9,\s*g:\s*0,\s*l:\s*2/.test(html),
  NASEM_COEFFICIENTS_matrix: /1004\.82/.test(html),
  IOM_male: /662\s*-\s*\(9\.53/.test(html),
  api_coach_data: html.includes('/api/coach-data'),
  coach_data_json: html.includes('coach-data.json'),
  service_role: /service_role/i.test(`${html}\n${cfg}`),
};

const report = {
  totalBytes: total,
  totalKiB: Math.round(total / 1024),
  jsBytes: jsSize,
  jsKiB: Math.round(jsSize / 1024),
  workspaceHtmlKiB: Math.round(fs.statSync(htmlPath).size / 1024),
  workspaceCoachDataPresent: fs.existsSync(path.join(out, 'workspace', 'coach-data.json')),
  sourceBankKiB: Math.round(sourceBank / 1024),
  serverNutritionEngine: /"serverNutritionEngine":true/.test(cfg),
  stripMarker: html.includes('data-coach-server-nutrition="1"'),
  bridgePresent: html.includes('server-nutrition-bridge.mjs'),
  markers,
};

console.log(JSON.stringify(report, null, 2));
