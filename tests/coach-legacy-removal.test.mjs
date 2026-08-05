/**
 * Bloc 2 — legacy coach-data removal and permanent server nutrition deploy proofs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDeployTreeSafe,
  htmlContainsEnergyFormulaIp,
} from '../scripts/coach-portal-deploy-lib.mjs';
import { buildCoachVercelBundle } from '../scripts/coach-vercel-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FAKE_PUBLIC = Object.freeze({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_real',
});

test('api/coach-data.js file does not exist', () => {
  assert.equal(fs.existsSync(path.join(root, 'api', 'coach-data.js')), false);
});

test('vercel.json has no coach-data function or rewrite', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(cfg.functions?.['api/coach-data.js'], undefined);
  assert.equal(
    cfg.rewrites.some((r) => r.source === '/workspace/coach-data.json' || r.destination === '/api/coach-data'),
    false,
  );
  assert.ok(cfg.functions?.['api/coach-generate-pdf.js']);
});

test('buildCoachVercelBundle deploy tree has no coach-data.json and no service_role', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-legacy-'));
  const { outDir, serverNutritionEngine } = buildCoachVercelBundle({ outDir: tmp, env: FAKE_PUBLIC });
  assert.equal(serverNutritionEngine, true);
  assert.equal(fs.existsSync(path.join(outDir, 'workspace', 'coach-data.json')), false);
  assertDeployTreeSafe(outDir);

  const config = fs.readFileSync(path.join(outDir, 'config.js'), 'utf8');
  assert.match(config, /serverNutritionEngine":true/);
  assert.doesNotMatch(config, /service_role|SERVICE_ROLE/);

  const html = fs.readFileSync(path.join(outDir, 'workspace', 'index.html'), 'utf8');
  assert.match(html, /data-coach-server-nutrition="1"/);
  assert.match(html, /server-nutrition-bridge\.mjs/);
  assert.equal(htmlContainsEnergyFormulaIp(html), false);
  assert.doesNotMatch(html, /pro:\s*\{\s*p:\s*9,\s*g:\s*0,\s*l:\s*2\s*\}/);
  assert.doesNotMatch(html, /\/api\/coach-data/);
});

test('source coach-portal/ has no coach-data.json', () => {
  assert.equal(fs.existsSync(path.join(root, 'coach-portal', 'coach-data.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'coach-portal', 'workspace', 'coach-data.json')), false);
});
