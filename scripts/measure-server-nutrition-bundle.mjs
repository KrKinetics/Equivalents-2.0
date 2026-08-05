/**
 * Local measurement helper for server-nutrition deploy tree (no secrets logged).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlContainsEnergyFormulaIp } from './coach-portal-deploy-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'coach-vercel');
const htmlPath = path.join(out, 'workspace', 'index.html');
const cfgPath = path.join(out, 'config.js');

function bytes(p) {
  try { return fs.statSync(p).size; } catch { return null; }
}

if (!fs.existsSync(htmlPath)) {
  console.error('Missing dist/coach-vercel — run coach:vercel:build first');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const cfg = fs.readFileSync(cfgPath, 'utf8');

const report = {
  serverNutritionMarker: html.includes('data-coach-server-nutrition="1"'),
  bridgeInjected: html.includes('server-nutrition-bridge.mjs'),
  featureFlagOn: /"serverNutritionEngine":true/.test(cfg),
  featureFlagOff: /"serverNutritionEngine":false/.test(cfg),
  workspaceCoachDataPresent: fs.existsSync(path.join(out, 'workspace', 'coach-data.json')),
  bridgeFilePresent: fs.existsSync(path.join(out, 'src', 'coach', 'client', 'server-nutrition-bridge.mjs')),
  engineInDeployTree: fs.existsSync(path.join(out, 'src', 'lib', 'coach-calculator-engine.mjs')),
  workspaceHtmlBytes: bytes(htmlPath),
  configBytes: bytes(cfgPath),
  sourceCoachDataBytes: bytes(path.join(root, 'coach-calculator', 'coach-data.json')),
  hasEnergyFormulaIp: htmlContainsEnergyFormulaIp(html),
  hasServiceRole: /service_role/i.test(`${html}${cfg}`),
  coachSharedStub: html.includes('Client engine disabled'),
  hasKrNasemImpl: /function krNasem2023Eer\([\s\S]{80,}1004\.82/.test(html),
};

console.log(JSON.stringify(report, null, 2));
