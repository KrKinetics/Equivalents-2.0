import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import {
  hasLiveSupabaseEnv,
  loadCoachPasswordsLocal,
  mergeEnvLocalIntoProcess,
  requireSupabasePublicEnv,
  skipWithoutLiveSupabase,
} from '../scripts/load-env-local.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORM_RE = /<form action="\/dashboard\.html" method="get">\s*<button type="submit">← Changer de client<\/button>\s*<\/form>/;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

async function signInOrg(org) {
  const { url, publishableKey } = requireSupabasePublicEnv(ROOT);
  const passwords = loadCoachPasswordsLocal(ROOT);
  const entry = passwords.find((row) => row.org === org);
  if (!entry) throw new Error(`missing password for ${org}`);
  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: entry.email,
    password: entry.password,
  });
  assert.ifError(error);
  const { data: mem, error: memErr } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', data.session.user.id)
    .maybeSingle();
  assert.ifError(memErr);
  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, full_name')
    .eq('organization_id', mem.organization_id)
    .eq('is_fictional', true)
    .order('full_name', { ascending: true });
  assert.ifError(cErr);
  await supabase.auth.signOut();
  return { entry, clients: clients || [] };
}

async function loginPortal(page, entry) {
  await page.goto('http://127.0.0.1:4198/login.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.click('#mode-password');
  await page.evaluate(() => {
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
  });
  await page.type('#email', entry.email, { delay: 5 });
  await page.type('#password', entry.password, { delay: 5 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
    page.click('#submit'),
  ]);
}

async function waitWorkspaceReady(page) {
  await page.waitForFunction(() => {
    const t = `${document.getElementById('workspace-persist-status')?.textContent || ''} ${document.getElementById('workspace-context-banner')?.innerText || ''}`;
    return /Dossier chargé|Aucun dossier sauvegardé|Dossier\s*:/.test(t);
  }, { timeout: 60000 });
}

test('same-origin preview serves portal, workspace calculator, and public config', async (t) => {
  if (skipWithoutLiveSupabase(t, ROOT)) return;
  const child = spawn(process.execPath, ['scripts/coach-workspace-preview.mjs'], {
    cwd: ROOT,
    env: { ...process.env, COACH_PORTAL_PORT: '4197' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill('SIGTERM'); });
  await waitForMatch(child, /Coach workspace \(same-origin\)/);

  const portal = await (await fetch('http://127.0.0.1:4197/dashboard.html')).text();
  assert.match(portal, /Clients de mon organisation/);

  const workspace = await (await fetch('http://127.0.0.1:4197/workspace/')).text();
  assert.match(workspace, /workspace-bootstrap\.mjs/);
  assert.match(workspace, FORM_RE);

  const bootstrap = await (await fetch('http://127.0.0.1:4197/assets/workspace-bootstrap.mjs')).text();
  assert.match(bootstrap, /renderWorkspaceClientMenu|fetchOrganizationClients/);
  assert.doesNotMatch(bootstrap, /← Retour au portail|workspace-return-portal/);
  assert.doesNotMatch(bootstrap, /listProfileKeys\s*\(/);
});

test('KR client selector switches clients; dirty confirm cancel/continue; Elevate isolated', async (t) => {
  mergeEnvLocalIntoProcess(ROOT);
  if (!hasLiveSupabaseEnv()) {
    t.skip('live Supabase env unavailable');
    return;
  }
  let kr;
  let elevate;
  try {
    kr = await signInOrg('kr-kinetics');
    elevate = await signInOrg('elevate-fitness');
  } catch {
    t.skip('.coach-passwords.local missing or incomplete');
    return;
  }
  const executablePath = chromePath();
  if (!executablePath) {
    t.skip('Chrome executable not found for Puppeteer');
    return;
  }

  const byName = (list, re) => list.find((c) => re.test(c.full_name));
  const source = byName(kr.clients, /Test persistance KR/i);
  const target = byName(kr.clients, /test KR final/i);
  assert.ok(source, 'expected KR client Test persistance KR');
  assert.ok(target, 'expected KR client test KR final');
  assert.ok(kr.clients.length >= 3, 'expected multiple KR clients');

  const child = spawn(process.execPath, ['scripts/coach-workspace-preview.mjs'], {
    cwd: ROOT,
    env: { ...process.env, COACH_PORTAL_PORT: '4198' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill('SIGTERM'); });
  await waitForMatch(child, /Coach workspace \(same-origin\)/);

  const browser = await puppeteer.launch({ headless: true, executablePath });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await loginPortal(page, kr.entry);
  await page.goto(
    `http://127.0.0.1:4198/workspace/?client_id=${source.id}`,
    { waitUntil: 'networkidle0', timeout: 60000 },
  );
  await waitWorkspaceReady(page);

  const menu = await page.evaluate(() => {
    const select = document.getElementById('liste_profils');
    return {
      aria: select?.getAttribute('aria-label') || '',
      value: select?.value || '',
      labels: [...(select?.options || [])].map((o) => o.textContent.trim()),
      values: [...(select?.options || [])].map((o) => o.value),
      athlete: [...(select?.options || [])].some((o) => o.value.startsWith('athlete_')),
      supabaseSuffix: [...(select?.options || [])].some((o) => /\(Supabase\)/.test(o.textContent)),
      banner: document.getElementById('workspace-context-banner')?.innerText || '',
      status: document.getElementById('workspace-persist-status')?.textContent || '',
      nom: document.getElementById('nom_athlete')?.value || '',
    };
  });
  assert.equal(menu.aria, 'Client actif');
  assert.equal(menu.value, source.id);
  assert.equal(menu.athlete, false);
  assert.equal(menu.supabaseSuffix, false);
  assert.ok(menu.labels.includes('Test persistance KR'));
  assert.ok(menu.labels.includes('test KR final'));
  assert.ok(menu.labels.includes('Client test KR'));
  assert.match(menu.banner, /Test persistance KR/);
  assert.ok(menu.values.every((id) => kr.clients.some((c) => c.id === id)));
  assert.equal(menu.values.some((id) => elevate.clients.some((c) => c.id === id)), false);

  async function switchClient(nextId) {
    await page.evaluate((id) => {
      const select = document.getElementById('liste_profils');
      select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, nextId);
  }

  async function switchExpectingNoDialog(nextId, label) {
    let prompted = false;
    const onDialog = async (dialog) => {
      prompted = true;
      await dialog.dismiss();
    };
    page.on('dialog', onDialog);
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
        switchClient(nextId),
      ]);
      await sleep(200);
    } finally {
      page.off('dialog', onDialog);
    }
    assert.equal(prompted, false, label);
  }

  // Clean switch: menu-only change must not prompt.
  await switchExpectingNoDialog(target.id, 'clean switch must not confirm');
  assert.match(page.url(), new RegExp(`client_id=${target.id}`));
  await waitWorkspaceReady(page);

  // Return to source, edit, save, then switch — no confirm after successful save.
  await page.goto(
    `http://127.0.0.1:4198/workspace/?client_id=${source.id}`,
    { waitUntil: 'networkidle0', timeout: 60000 },
  );
  await waitWorkspaceReady(page);
  await page.evaluate(() => {
    const age = document.getElementById('age');
    if (age) age.value = String(Number(age.value || '30') + 3);
  });
  await page.click('button[onclick*="sauvegarderProfil"]');
  await page.waitForFunction(
    () => /Dossier sauvegardé/.test(document.getElementById('workspace-persist-status')?.textContent || ''),
    { timeout: 30000 },
  );
  await switchExpectingNoDialog(target.id, 'post-save switch must not confirm');
  assert.match(page.url(), new RegExp(`client_id=${target.id}`));
  await waitWorkspaceReady(page);

  // Back to source: dirty cancel keeps current client and edits.
  await page.goto(
    `http://127.0.0.1:4198/workspace/?client_id=${source.id}`,
    { waitUntil: 'networkidle0', timeout: 60000 },
  );
  await waitWorkspaceReady(page);
  const ageBefore = await page.evaluate(() => document.getElementById('age')?.value || '');
  {
    const onDialog = async (dialog) => {
      assert.match(dialog.message(), /modifications ne sont pas sauvegardées/i);
      await dialog.dismiss();
    };
    page.on('dialog', onDialog);
    try {
      await page.evaluate((nextId) => {
        const age = document.getElementById('age');
        if (age) age.value = String(Number(age.value || '30') + 7);
        const select = document.getElementById('liste_profils');
        select.value = nextId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, target.id);
      await sleep(400);
    } finally {
      page.off('dialog', onDialog);
    }
  }
  const afterCancel = await page.evaluate(() => ({
    path: location.pathname + location.search,
    value: document.getElementById('liste_profils')?.value || '',
    age: document.getElementById('age')?.value || '',
  }));
  assert.match(afterCancel.path, new RegExp(`client_id=${source.id}`));
  assert.equal(afterCancel.value, source.id);
  assert.notEqual(afterCancel.age, ageBefore);

  // Continue switches client via full navigation.
  {
    const onDialog = async (dialog) => { await dialog.accept(); };
    page.on('dialog', onDialog);
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
        switchClient(target.id),
      ]);
    } finally {
      page.off('dialog', onDialog);
    }
  }
  await waitWorkspaceReady(page);
  const afterSwitch = await page.evaluate(() => ({
    href: location.href,
    value: document.getElementById('liste_profils')?.value || '',
    banner: document.getElementById('workspace-context-banner')?.innerText || '',
    status: document.getElementById('workspace-persist-status')?.textContent || '',
    nom: document.getElementById('nom_athlete')?.value || '',
  }));
  assert.match(afterSwitch.href, new RegExp(`client_id=${target.id}`));
  assert.equal(afterSwitch.value, target.id);
  assert.match(afterSwitch.banner, /test KR final/i);
  assert.doesNotMatch(afterSwitch.banner, /Test persistance KR/);
  assert.match(afterSwitch.status, /Dossier chargé|Aucun dossier sauvegardé/);
  assert.match(afterSwitch.nom, /test KR final/i);

  // Ctrl+R keeps URL client selected.
  await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
  await waitWorkspaceReady(page);
  const afterReload = await page.evaluate(() => ({
    href: location.href,
    value: document.getElementById('liste_profils')?.value || '',
    banner: document.getElementById('workspace-context-banner')?.innerText || '',
  }));
  assert.match(afterReload.href, new RegExp(`client_id=${target.id}`));
  assert.equal(afterReload.value, target.id);
  assert.match(afterReload.banner, /test KR final/i);

  // Elevate session: only Elevate clients.
  await page.goto('http://127.0.0.1:4198/login.html', { waitUntil: 'networkidle0', timeout: 30000 });
  // Force re-login as Elevate (sign out first if dashboard).
  await page.evaluate(async () => {
    try {
      const { getPortalSupabase } = await import('/assets/auth-session.js');
      await getPortalSupabase().auth.signOut();
    } catch { /* ignore */ }
  });
  assert.ok(elevate.clients[0], 'expected at least one Elevate client');
  await loginPortal(page, elevate.entry);
  await page.goto(
    `http://127.0.0.1:4198/workspace/?client_id=${elevate.clients[0].id}`,
    { waitUntil: 'networkidle0', timeout: 60000 },
  );
  await waitWorkspaceReady(page);
  const elevMenu = await page.evaluate(() => ({
    labels: [...(document.getElementById('liste_profils')?.options || [])].map((o) => o.textContent.trim()),
    values: [...(document.getElementById('liste_profils')?.options || [])].map((o) => o.value),
    banner: document.getElementById('workspace-context-banner')?.innerText || '',
  }));
  assert.match(elevMenu.banner, /elevate-fitness|Elevate/i);
  assert.equal(elevMenu.labels.some((n) => /Test persistance KR|test KR final|Client test KR/i.test(n)), false);
  assert.ok(elevMenu.values.every((id) => elevate.clients.some((c) => c.id === id)));

  // Cross-org URL refused — generic lock, no KR dossier leak.
  await page.goto(
    `http://127.0.0.1:4198/workspace/?client_id=${source.id}`,
    { waitUntil: 'networkidle0', timeout: 60000 },
  );
  await page.waitForFunction(
    () => /Accès refusé ou client introuvable/.test(
      document.getElementById('workspace-context-banner')?.innerText || '',
    ),
    { timeout: 30000 },
  );
  const denied = await page.evaluate(() => {
    const select = document.getElementById('liste_profils');
    const formBtn = document.querySelector('form[action="/dashboard.html"] button[type="submit"]');
    return {
      banner: document.getElementById('workspace-context-banner')?.innerText || '',
      nom: document.getElementById('nom_athlete')?.value || '',
      age: document.getElementById('age')?.value || '',
      selectOptions: select ? [...select.options].map((o) => o.value) : [],
      selectHidden: !!select?.hidden,
      saveHidden: !!document.querySelector('button[onclick*="sauvegarderProfil"]')?.hidden,
      formLabel: (formBtn?.textContent || '').trim(),
      bodyText: document.body?.innerText || '',
    };
  });
  assert.match(denied.banner, /Accès refusé ou client introuvable/);
  assert.doesNotMatch(denied.banner, /Test persistance KR|autre organisation|hors de votre/i);
  assert.equal(denied.nom, '');
  assert.equal(denied.selectOptions.some((v) => String(v).startsWith('athlete_')), false);
  assert.equal(denied.selectHidden, true);
  assert.equal(denied.saveHidden, true);
  assert.equal(denied.formLabel, 'Retour au tableau de bord');
  assert.doesNotMatch(denied.bodyText, /Test persistance KR/i);
  assert.doesNotMatch(denied.banner, /kr-kinetics|elevate-fitness|organisation/i);

  // Nonexistent client_id — same generic lock (no enumeration signal).
  const fakeId = '00000000-0000-4000-8000-000000000099';
  await page.goto(
    `http://127.0.0.1:4198/workspace/?client_id=${fakeId}`,
    { waitUntil: 'networkidle0', timeout: 60000 },
  );
  await page.waitForFunction(
    () => /Accès refusé ou client introuvable/.test(
      document.getElementById('workspace-context-banner')?.innerText || '',
    ),
    { timeout: 30000 },
  );
  const missing = await page.evaluate(() => ({
    banner: document.getElementById('workspace-context-banner')?.innerText || '',
    formLabel: (document.querySelector('form[action="/dashboard.html"] button[type="submit"]')?.textContent || '').trim(),
  }));
  assert.match(missing.banner, /Accès refusé ou client introuvable/);
  assert.equal(missing.formLabel, 'Retour au tableau de bord');

  // Dashboard return still works from locked state.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
    page.click('form[action="/dashboard.html"] button[type="submit"]'),
  ]);
  assert.equal(new URL(page.url()).pathname, '/dashboard.html');
  assert.deepEqual(pageErrors, []);
});
