/**
 * Assemble a static Coach portal tree for Vercel Preview.
 *
 * Output: dist/coach-vercel/
 *   /                  ← coach-portal
 *   /workspace/        ← coach-calculator + injected bootstrap
 *   /src/coach/...     ← browser modules used by dashboard/workspace
 *   /config.js         ← publishable Supabase values only
 *
 * Env (required): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
 * Local convenience: loads .env.local when present (never commits it).
 * Never logs secret values. Never reads SERVICE_ROLE for this build.
 *
 * Usage:
 *   npm run coach:vercel:build
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDeployTreeSafe,
  buildConfigJsSource,
  copyTree,
  injectWorkspaceBootstrap,
  requirePublicSupabaseBuildEnv,
  rmrf,
  stripClientNutritionFormulas,
  htmlContainsEnergyFormulaIp,
} from './coach-portal-deploy-lib.mjs';
import { mergeEnvLocalIntoProcess } from './load-env-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portalDir = path.join(root, 'coach-portal');
const calcDir = path.join(root, 'coach-calculator');
const outDir = path.join(root, 'dist', 'coach-vercel');

const REQUIRED_CALC = [
  'index.html',
  'coach-data.json',
  'assets/logo-kr-kinetics-horizontal.png',
  'vendor/html2canvas.min.js',
  'vendor/jspdf.umd.min.js',
];

function calculatorReady() {
  return REQUIRED_CALC.every((rel) => fs.existsSync(path.join(calcDir, rel)));
}

function ensureCalculatorBuilt() {
  if (calculatorReady()) return;
  const result = spawnSync(process.execPath, ['scripts/coach-calculator-build.mjs'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('coach-calculator-build failed');
  if (!calculatorReady()) throw new Error('coach-calculator incomplete after build');
}

function writeFile(abs, contents) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents, 'utf8');
}

export function buildCoachVercelBundle(options = {}) {
  const env = options.env || process.env;
  const targetDir = options.outDir || outDir;
  const { url, publishableKey } = requirePublicSupabaseBuildEnv(env);
  // Preview Draft PRs enable the server nutrition path by default.
  // Production stays OFF unless COACH_FEATURE_SERVER_NUTRITION=1.
  // Explicit COACH_FEATURE_SERVER_NUTRITION=0 forces OFF even on Preview.
  const flag = String(env.COACH_FEATURE_SERVER_NUTRITION || '').trim();
  const vercelEnv = String(env.VERCEL_ENV || '').trim();
  const serverNutritionEngine = flag === '1'
    || (flag !== '0' && vercelEnv === 'preview');

  if (!fs.existsSync(portalDir)) throw new Error('coach-portal/ missing');
  ensureCalculatorBuilt();

  rmrf(targetDir);
  fs.mkdirSync(targetDir, { recursive: true });

  copyTree(portalDir, targetDir);

  const workspaceDir = path.join(targetDir, 'workspace');
  copyTree(calcDir, workspaceDir);
  // Never publish coach-data.json as a static asset.
  // Legacy path: authenticated clients may still use /api/coach-data when the feature flag is off.
  // Server nutrition path: UI must use minimal /api/coach-* routes only.
  const leakedCoachData = path.join(workspaceDir, 'coach-data.json');
  if (fs.existsSync(leakedCoachData)) fs.unlinkSync(leakedCoachData);

  const workspaceIndex = path.join(workspaceDir, 'index.html');
  let workspaceHtml = fs.readFileSync(workspaceIndex, 'utf8');
  if (serverNutritionEngine) {
    workspaceHtml = stripClientNutritionFormulas(workspaceHtml);
  }
  const injected = injectWorkspaceBootstrap(workspaceHtml, { serverNutritionEngine });
  writeFile(workspaceIndex, injected);

  copyTree(
    path.join(root, 'src', 'coach', 'workspace'),
    path.join(targetDir, 'src', 'coach', 'workspace'),
  );
  copyTree(
    path.join(root, 'src', 'coach', 'services'),
    path.join(targetDir, 'src', 'coach', 'services'),
  );
  if (serverNutritionEngine) {
    copyTree(
      path.join(root, 'src', 'coach', 'client'),
      path.join(targetDir, 'src', 'coach', 'client'),
    );
  }

  const configJs = buildConfigJsSource({ url, publishableKey, serverNutritionEngine });
  writeFile(path.join(targetDir, 'config.js'), configJs);

  // Required route entry points
  for (const rel of [
    'index.html',
    'login.html',
    'dashboard.html',
    'workspace/index.html',
    'config.js',
    'assets/workspace-bootstrap.mjs',
    'assets/login.js',
    'assets/dashboard.js',
    'src/coach/workspace/workspace-access.mjs',
    'src/coach/services/storage/dossier-schema.mjs',
  ]) {
    if (!fs.existsSync(path.join(targetDir, rel))) {
      throw new Error(`Deploy tree missing required file: ${rel}`);
    }
  }

  if (!injected.includes('workspace-bootstrap.mjs')) {
    throw new Error('workspace/index.html missing bootstrap injection');
  }
  if (!injected.includes('action="/dashboard.html"')) {
    throw new Error('workspace/index.html missing dashboard return form');
  }
  if (serverNutritionEngine) {
    if (!injected.includes('server-nutrition-bridge.mjs')) {
      throw new Error('server nutrition path missing bridge injection');
    }
    if (!injected.includes('data-coach-server-nutrition="1"')) {
      throw new Error('server nutrition path missing strip marker');
    }
    if (htmlContainsEnergyFormulaIp(injected)) {
      throw new Error('server nutrition path still embeds energy formula coefficients');
    }
    if (!fs.existsSync(path.join(targetDir, 'src/coach/client/server-nutrition-bridge.mjs'))) {
      throw new Error('server nutrition client bridge missing from deploy tree');
    }
  }

  assertDeployTreeSafe(targetDir);
  return {
    outDir: targetDir,
    urlHost: new URL(url).host,
    serverNutritionEngine,
  };
}

function main() {
  mergeEnvLocalIntoProcess(root);
  const { outDir: built, urlHost, serverNutritionEngine } = buildCoachVercelBundle();
  // Log only non-secret facts.
  console.log(`Coach Vercel bundle ready: ${path.relative(root, built)}`);
  console.log(`Public Supabase host configured: ${urlHost}`);
  console.log(`Server nutrition engine feature: ${serverNutritionEngine ? 'ON' : 'OFF'}`);
  console.log('config.js written (values not printed).');
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    main();
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}
