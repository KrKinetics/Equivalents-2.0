/**
 * Deterministic coverage for Coach Vercel static assembly (no secrets).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertConfigJsIsPublicOnly,
  buildConfigJsSource,
  injectWorkspaceBootstrap,
  requirePublicSupabaseBuildEnv,
} from '../scripts/coach-portal-deploy-lib.mjs';
import { buildCoachVercelBundle } from '../scripts/coach-vercel-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FAKE_PUBLIC = Object.freeze({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_real',
});

test('injectWorkspaceBootstrap adds config, bootstrap module, and dashboard form once', () => {
  const html = '<!DOCTYPE html><html><head><title>t</title></head><body><h1>Calc</h1></body></html>';
  const out = injectWorkspaceBootstrap(html);
  assert.match(out, /src="\/config\.js"/);
  assert.match(out, /src="\/assets\/workspace-bootstrap\.mjs"/);
  assert.match(out, /action="\/dashboard\.html"/);
  assert.match(out, /← Changer de client/);
  assert.equal(injectWorkspaceBootstrap(out), out);
});

test('requirePublicSupabaseBuildEnv fails clearly when vars missing or invalid', () => {
  assert.throws(() => requirePublicSupabaseBuildEnv({}), /required/i);
  assert.throws(
    () => requirePublicSupabaseBuildEnv({
      SUPABASE_URL: 'http://insecure.example',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
    }),
    /https/i,
  );
  assert.throws(
    () => requirePublicSupabaseBuildEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'not-valid',
    }),
    /PUBLISHABLE/i,
  );
  // Invalid values must not be treated as deployable public env.
  assert.throws(
    () => requirePublicSupabaseBuildEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'short',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.e30.xx',
    }),
    /PUBLISHABLE|invalid|aborted/i,
  );
});

test('buildConfigJsSource is public-only and defaults serverNutritionEngine true', () => {
  const source = buildConfigJsSource({
    url: FAKE_PUBLIC.SUPABASE_URL,
    publishableKey: FAKE_PUBLIC.SUPABASE_PUBLISHABLE_KEY,
  });
  assertConfigJsIsPublicOnly(source);
  assert.match(source, /COACH_SUPABASE/);
  assert.match(source, /COACH_FEATURES/);
  assert.match(source, /serverNutritionEngine":true/);
  assert.match(source, /example\.supabase\.co/);
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role|undefined/);
});

test('injectWorkspaceBootstrap can add server nutrition bridge when flagged', () => {
  const html = '<!DOCTYPE html><html><head><title>t</title></head><body><h1>Calc</h1></body></html>';
  const out = injectWorkspaceBootstrap(html, { serverNutritionEngine: true });
  assert.match(out, /server-nutrition-bridge\.mjs/);
  assert.match(out, /workspace-bootstrap\.mjs/);
});

test('vercel.json keeps required routes without catch-all HTML rewrite or legacy coach-data', () => {
  const yml = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  const cfg = JSON.parse(yml);
  assert.equal(cfg.framework, null);
  assert.equal(cfg.buildCommand, 'npm run coach:vercel:build');
  assert.equal(cfg.outputDirectory, 'dist/coach-vercel');
  assert.ok(Array.isArray(cfg.rewrites));
  assert.ok(
    cfg.rewrites.some((r) => r.source === '/workspace' && r.destination === '/workspace/index.html'),
  );
  assert.equal(
    cfg.rewrites.some((r) => r.source === '/workspace/coach-data.json' || r.destination === '/api/coach-data'),
    false,
  );
  assert.ok(cfg.functions?.['api/coach-generate-pdf.js']);
  assert.ok(cfg.functions?.['api/coach-generate-intake-report-pdf.js']);
  // No SPA fallback that would turn missing assets into 200 HTML.
  assert.equal(
    cfg.rewrites.some((r) => r.source === '/(.*)' || r.source === '/:path*' || r.destination === '/index.html'),
    false,
  );
  assert.doesNotMatch(yml, /SERVICE_ROLE|secrets\.|sb_publishable_[a-z0-9]{16,}/i);
});

test('buildCoachVercelBundle assembles routes, keeps client_id path, excludes secrets, server nutrition always ON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-vercel-'));
  const { outDir, serverNutritionEngine } = buildCoachVercelBundle({
    outDir: tmp,
    env: FAKE_PUBLIC,
  });
  assert.equal(serverNutritionEngine, true);

  const mustExist = [
    'index.html',
    'login.html',
    'dashboard.html',
    'pre-interview-report.html',
    'workspace/index.html',
    'config.js',
    'assets/workspace-bootstrap.mjs',
    'assets/portal.css',
    'workspace/assets/logo-kr-kinetics-horizontal.png',
    'src/coach/workspace/workspace-access.mjs',
    'src/coach/intake-report/intake-report-view-model.mjs',
    'src/coach/domain/client-service-entitlements.mjs',
    'src/coach/services/storage/supabase-client-dossier-store.mjs',
    'src/coach/client/server-nutrition-bridge.mjs',
  ];
  for (const rel of mustExist) {
    assert.equal(fs.existsSync(path.join(outDir, rel)), true, rel);
  }

  const workspaceHtml = fs.readFileSync(path.join(outDir, 'workspace/index.html'), 'utf8');
  assert.match(workspaceHtml, /workspace-bootstrap\.mjs/);
  assert.match(workspaceHtml, /action="\/dashboard\.html"/);
  assert.match(workspaceHtml, /data-coach-server-nutrition="1"/);
  assert.match(workspaceHtml, /server-nutrition-bridge\.mjs/);

  const config = fs.readFileSync(path.join(outDir, 'config.js'), 'utf8');
  assertConfigJsIsPublicOnly(config);
  assert.match(config, /serverNutritionEngine":true/);
  assert.doesNotMatch(config, /SERVICE_ROLE|service_role/);

  // Ctrl+R target: static workspace index is a real file (query string preserved by host).
  assert.match(
    fs.readFileSync(path.join(outDir, 'assets/workspace-bootstrap.mjs'), 'utf8'),
    /client_id/,
  );
  assert.match(
    fs.readFileSync(path.join(outDir, 'assets/dashboard.js'), 'utf8'),
    /workspaceOpenPath|client_id/,
  );

  assert.equal(fs.existsSync(path.join(outDir, '.env.local')), false);
  assert.equal(fs.existsSync(path.join(outDir, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(outDir, 'tests')), false);
  // Phase 1: food bank must not be a public static asset.
  assert.equal(fs.existsSync(path.join(outDir, 'workspace', 'coach-data.json')), false);
});

test('buildCoachVercelBundle fails when public env is absent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-vercel-missing-'));
  assert.throws(
    () => buildCoachVercelBundle({ outDir: tmp, env: {} }),
    /required|aborted/i,
  );
  assert.equal(fs.existsSync(path.join(tmp, 'config.js')), false);
});
