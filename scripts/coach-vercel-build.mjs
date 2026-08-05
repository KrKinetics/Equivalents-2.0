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

  if (!fs.existsSync(portalDir)) throw new Error('coach-portal/ missing');
  ensureCalculatorBuilt();

  rmrf(targetDir);
  fs.mkdirSync(targetDir, { recursive: true });

  copyTree(portalDir, targetDir);

  const workspaceDir = path.join(targetDir, 'workspace');
  copyTree(calcDir, workspaceDir);
  // Phase 1 containment: never publish coach-data.json as a static asset.
  // Authenticated clients load it via /api/coach-data (still full bank — Phase 2 will minimize).
  const leakedCoachData = path.join(workspaceDir, 'coach-data.json');
  if (fs.existsSync(leakedCoachData)) fs.unlinkSync(leakedCoachData);

  const workspaceIndex = path.join(workspaceDir, 'index.html');
  const injected = injectWorkspaceBootstrap(fs.readFileSync(workspaceIndex, 'utf8'));
  writeFile(workspaceIndex, injected);

  copyTree(
    path.join(root, 'src', 'coach', 'workspace'),
    path.join(targetDir, 'src', 'coach', 'workspace'),
  );
  copyTree(
    path.join(root, 'src', 'coach', 'services'),
    path.join(targetDir, 'src', 'coach', 'services'),
  );

  const configJs = buildConfigJsSource({ url, publishableKey });
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

  assertDeployTreeSafe(targetDir);
  return { outDir: targetDir, urlHost: new URL(url).host };
}

function main() {
  mergeEnvLocalIntoProcess(root);
  const { outDir: built, urlHost } = buildCoachVercelBundle();
  // Log only non-secret facts.
  console.log(`Coach Vercel bundle ready: ${path.relative(root, built)}`);
  console.log(`Public Supabase host configured: ${urlHost}`);
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
