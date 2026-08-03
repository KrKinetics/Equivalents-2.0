import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function waitForMatch(child, pattern, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${pattern}`)), timeoutMs);
    const onData = (chunk) => {
      buf += String(chunk);
      if (pattern.test(buf)) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        child.stderr?.off('data', onData);
        resolve(buf);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
  });
}

async function fetchText(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

test('same-origin preview serves portal, workspace calculator, and public config', async (t) => {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    t.skip('.env.local missing — skip live preview boot');
    return;
  }

  const child = spawn(process.execPath, ['scripts/coach-workspace-preview.mjs'], {
    cwd: ROOT,
    env: { ...process.env, COACH_PORTAL_PORT: '4197' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.kill('SIGTERM');
  });

  await waitForMatch(child, /Coach workspace \(same-origin\)/);

  const portal = await fetchText('http://127.0.0.1:4197/dashboard.html');
  assert.equal(portal.status, 200);
  assert.match(portal.text, /Clients de mon organisation/);

  const config = await fetchText('http://127.0.0.1:4197/config.js');
  assert.equal(config.status, 200);
  assert.match(config.text, /COACH_SUPABASE/);
  assert.equal(/service_role|SERVICE_ROLE/i.test(config.text), false);

  const workspace = await fetchText('http://127.0.0.1:4197/workspace/');
  assert.equal(workspace.status, 200);
  assert.match(workspace.text, /workspace-bootstrap\.mjs/);
  assert.match(workspace.text, /Calculateur Coach|ÉVALUATION/);

  const moduleRes = await fetchText('http://127.0.0.1:4197/src/coach/workspace/org-brand.mjs');
  assert.equal(moduleRes.status, 200);
  assert.match(moduleRes.text, /kr-kinetics/);

  const storeMod = await fetchText('http://127.0.0.1:4197/src/coach/services/storage/supabase-client-dossier-store.mjs');
  assert.equal(storeMod.status, 200);
  assert.match(storeMod.text, /loadClientDossier/);
  assert.match(storeMod.text, /saveClientDossier/);

  const dashJs = await fetchText('http://127.0.0.1:4197/assets/dashboard.js');
  assert.equal(dashJs.status, 200);
  assert.match(dashJs.text, /Ouvrir le dossier/);
  assert.match(dashJs.text, /workspaceOpenPath/);
});
