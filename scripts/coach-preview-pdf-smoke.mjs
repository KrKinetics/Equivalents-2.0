/**
 * Smoke-test the *deployed* Preview PDF route (not local Chromium).
 *
 * Required:
 *   COACH_PREVIEW_URL=https://….vercel.app
 *   .env.local (SUPABASE_*) + .coach-passwords.local
 *
 * Optional (required when Deployment Protection is on):
 *   VERCEL_AUTOMATION_BYPASS_SECRET  → sent as x-vercel-protection-bypass
 *
 * Exit 0 only when cold+warm FR and EN return HTTP 200 + %PDF- + openable pages.
 *
 * Usage:
 *   node scripts/coach-preview-pdf-smoke.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';
import {
  loadCoachPasswordsLocal,
  mergeEnvLocalIntoProcess,
} from './load-env-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tmp', 'preview-pdf-smoke');

function dayPayload(targets) {
  return {
    banque: { pro: 2, fec: 3, leg: 1, fru: 1, lai: 0, lip: 1, whey: 0 },
    repartition: Array.from({ length: 42 }, (_, i) => (i < 21 ? (i % 3 === 0 ? 1 : 0) : 0)),
    targets,
    timing: { active: false, heure: '', heureLabel: '', summary: '', preIdx: -1, postIdx: -1 },
  };
}

async function main() {
  mergeEnvLocalIntoProcess(root);
  const preview = String(process.env.COACH_PREVIEW_URL || '').replace(/\/$/, '');
  if (!preview.startsWith('https://')) {
    throw new Error('COACH_PREVIEW_URL must be the https Preview origin');
  }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    || process.env.VERCEL_PROTECTION_BYPASS
    || '';

  const [kr] = loadCoachPasswordsLocal(root);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: kr.email,
    password: kr.password,
  });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message || 'no session'}`);

  const mem = await supabase
    .from('memberships')
    .select('organization_id, organizations(id, slug)')
    .eq('user_id', data.user.id)
    .limit(1)
    .maybeSingle();
  const org = mem.data?.organizations;
  if (!org?.id) throw new Error('no organization membership');

  const clients = await supabase
    .from('clients')
    .select('id, full_name')
    .eq('organization_id', org.id)
    .eq('is_fictional', true)
    .limit(1);
  const client = clients.data?.[0];
  if (!client?.id) throw new Error('no fictional client for smoke');

  fs.mkdirSync(outDir, { recursive: true });

  const training = dayPayload({ kcal: 1800, pro: 120, glu: 180, lip: 60 });
  const rest = dayPayload({ kcal: 1600, pro: 110, glu: 160, lip: 55 });

  async function callPdf(locale, label) {
    const body = {
      organization_id: org.id,
      organization_slug: org.slug,
      client_id: client.id,
      locale,
      athlete_name: 'Preview Smoke',
      goal_label: locale === 'fr' ? 'Maintien' : 'Maintenance',
      macro_ratio_label: '25 / 45 / 30',
      coach_notes: '',
      goal_multiplier: 1,
      include_rest: true,
      training,
      rest,
    };
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/pdf',
      Authorization: `Bearer ${data.session.access_token}`,
    };
    if (bypass) headers['x-vercel-protection-bypass'] = bypass;

    const t0 = Date.now();
    const res = await fetch(`${preview}/api/coach-generate-pdf`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    const ct = res.headers.get('content-type') || '';
    const requestId = res.headers.get('x-request-id') || '';
    const buf = Buffer.from(await res.arrayBuffer());

    if (res.status === 401 && /Protected deployment/i.test(buf.toString('utf8'))) {
      throw new Error(
        'Preview Deployment Protection blocked the smoke test. '
        + 'Set VERCEL_AUTOMATION_BYPASS_SECRET (Project → Settings → Deployment Protection → Protection Bypass for Automation).',
      );
    }

    let errJson = null;
    if (!res.ok || !ct.includes('pdf')) {
      try { errJson = JSON.parse(buf.toString('utf8')); } catch { /* ignore */ }
    }

    const result = {
      label,
      status: res.status,
      ms,
      contentType: ct,
      requestId: requestId || errJson?.requestId || '',
      stage: errJson?.stage || null,
      bytes: buf.length,
      magic: buf.subarray(0, 5).toString('utf8'),
    };

    if (res.status !== 200) {
      console.error(JSON.stringify({ ...result, errJson }, null, 2));
      throw new Error(`${label}: expected HTTP 200, got ${res.status} stage=${result.stage}`);
    }
    if (!ct.includes('application/pdf')) {
      throw new Error(`${label}: bad Content-Type ${ct}`);
    }
    if (result.magic !== '%PDF-') {
      throw new Error(`${label}: missing %PDF- signature`);
    }
    if (buf.length < 1000) {
      throw new Error(`${label}: PDF too small (${buf.length})`);
    }

    const file = path.join(outDir, `${label}.pdf`);
    fs.writeFileSync(file, buf);
    const parsed = new PDFParse({ data: buf });
    const textResult = await parsed.getText();
    await parsed.destroy();
    const text = textResult?.text || '';
    // Rest-day plans are 2 pages; count form-feed markers + 1 as a lower bound.
    const pages = Math.max(1, (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length);
    result.pages = pages;
    result.textChars = text.length;
    result.file = file;
    if (pages < 1 || text.length < 20) throw new Error(`${label}: could not open PDF`);
    console.log(JSON.stringify(result));
    return result;
  }

  const coldFr = await callPdf('fr', 'fr-cold');
  const warmFr = await callPdf('fr', 'fr-warm');
  const en = await callPdf('en', 'en');

  console.log(JSON.stringify({
    ok: true,
    preview,
    coldFrMs: coldFr.ms,
    warmFrMs: warmFr.ms,
    enMs: en.ms,
    bytes: { frCold: coldFr.bytes, frWarm: warmFr.bytes, en: en.bytes },
    pages: { frCold: coldFr.pages, frWarm: warmFr.pages, en: en.pages },
    requestIds: [coldFr.requestId, warmFr.requestId, en.requestId],
    outDir,
  }, null, 2));
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});
