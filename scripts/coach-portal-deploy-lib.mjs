/**
 * Shared helpers for local same-origin preview and Vercel static assembly.
 * Never logs secret values.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  hasLiveSupabaseEnv,
  isValidPublishableKey,
  isValidSupabaseUrl,
} from './load-env-local.mjs';

export const WORKSPACE_CHANGE_CLIENT_FORM = `<form action="/dashboard.html" method="get">
  <button type="submit">← Changer de client</button>
</form>
`;

export const WORKSPACE_HEAD_SNIPPET = `
<script src="/config.js"></script>
<script type="module" src="/assets/workspace-bootstrap.mjs"></script>
`;

/**
 * Inject portal bootstrap + dashboard-return form into calculator HTML.
 * Same transform used by the local Node preview server.
 */
export function injectWorkspaceBootstrap(html) {
  if (typeof html !== 'string') throw new Error('injectWorkspaceBootstrap requires HTML string');
  if (html.includes('workspace-bootstrap.mjs')) return html;
  let out = html.includes('</head>')
    ? html.replace('</head>', `${WORKSPACE_HEAD_SNIPPET}</head>`)
    : `${WORKSPACE_HEAD_SNIPPET}${html}`;
  // First <body> only (document root); do not touch PDF string templates later in the file.
  if (out.includes('<body>')) return out.replace('<body>', `<body>\n${WORKSPACE_CHANGE_CLIENT_FORM}`);
  return out;
}

/**
 * Validate public browser env. Never considers SERVICE_ROLE. Never logs values.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {{ url: string, publishableKey: string }}
 */
export function requirePublicSupabaseBuildEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !publishableKey) {
    throw new Error(
      'Build aborted: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required (Vercel Preview env or .env.local).',
    );
  }
  if (!isValidSupabaseUrl(url)) {
    throw new Error('Build aborted: SUPABASE_URL must be a valid https:// URL.');
  }
  if (!isValidPublishableKey(publishableKey)) {
    throw new Error(
      'Build aborted: SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_ or eyJ.',
    );
  }
  if (!hasLiveSupabaseEnv({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey })) {
    throw new Error('Build aborted: public Supabase environment is invalid.');
  }
  if (Object.keys(env).some((k) => k.startsWith('NEXT_PUBLIC_SUPABASE_'))) {
    throw new Error('Build aborted: NEXT_PUBLIC_SUPABASE_* variables are not used in this project.');
  }
  return { url, publishableKey };
}

/** Browser-facing config.js source. Publishable values only. */
export function buildConfigJsSource({ url, publishableKey }) {
  const { url: safeUrl, publishableKey: safeKey } = requirePublicSupabaseBuildEnv({
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  });
  return `window.COACH_SUPABASE = Object.freeze(${JSON.stringify({
    url: safeUrl,
    publishableKey: safeKey,
  })});\n`;
}

export function assertConfigJsIsPublicOnly(source) {
  if (typeof source !== 'string' || !source.includes('COACH_SUPABASE')) {
    throw new Error('config.js is missing COACH_SUPABASE');
  }
  if (/SERVICE_ROLE|service_role|serviceRole/i.test(source)) {
    throw new Error('config.js must never include service_role');
  }
  if (/undefined/.test(source)) {
    throw new Error('config.js must not contain undefined');
  }
}

export function copyTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

export function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Fail if a published tree embeds service_role secrets or env files.
 * @param {string} outDir
 */
export function assertDeployTreeSafe(outDir) {
  const forbiddenNames = new Set([
    '.env',
    '.env.local',
    '.env.production',
    '.coach-passwords.local',
  ]);
  const stack = [outDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (forbiddenNames.has(entry.name) || entry.name.startsWith('.env')) {
        throw new Error(`Deploy tree must not include ${entry.name}`);
      }
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
          throw new Error(`Deploy tree must not include ${entry.name}/`);
        }
        stack.push(abs);
        continue;
      }
      if (!/\.(js|mjs|html|json|css)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      if (entry.name === 'config.js') {
        assertConfigJsIsPublicOnly(text);
      }
      if (/SUPABASE_SERVICE_ROLE_KEY\s*[:=]/.test(text)) {
        throw new Error(`Forbidden SUPABASE_SERVICE_ROLE_KEY assignment in ${path.relative(outDir, abs)}`);
      }
    }
  }
}
