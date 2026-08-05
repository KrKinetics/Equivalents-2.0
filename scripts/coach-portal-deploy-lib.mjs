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

export const SERVER_NUTRITION_HEAD_SNIPPET = `
<script type="module" src="/src/coach/client/server-nutrition-bridge.mjs"></script>
`;

/**
 * Inject portal bootstrap + dashboard-return form into calculator HTML.
 * Same transform used by the local Node preview server.
 * @param {string} html
 * @param {{ serverNutritionEngine?: boolean }} [opts]
 */
export function injectWorkspaceBootstrap(html, { serverNutritionEngine = true } = {}) {
  if (typeof html !== 'string') throw new Error('injectWorkspaceBootstrap requires HTML string');
  let out = html;
  const alreadyBootstrapped = out.includes('workspace-bootstrap.mjs');
  if (!alreadyBootstrapped) {
    out = out.includes('</head>')
      ? out.replace('</head>', `${WORKSPACE_HEAD_SNIPPET}</head>`)
      : `${WORKSPACE_HEAD_SNIPPET}${out}`;
    // First <body> only (document root); do not touch PDF string templates later in the file.
    if (out.includes('<body>')) {
      out = out.replace('<body>', `<body>\n${WORKSPACE_CHANGE_CLIENT_FORM}`);
    }
  }
  if (serverNutritionEngine && !out.includes('server-nutrition-bridge.mjs')) {
    out = out.includes('</head>')
      ? out.replace('</head>', `${SERVER_NUTRITION_HEAD_SNIPPET}</head>`)
      : `${SERVER_NUTRITION_HEAD_SNIPPET}${out}`;
  }
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

/**
 * Browser-facing config.js source. Publishable values only.
 * @param {{ url: string, publishableKey: string, serverNutritionEngine?: boolean }} opts
 */
export function buildConfigJsSource({ url, publishableKey, serverNutritionEngine = true }) {
  const { url: safeUrl, publishableKey: safeKey } = requirePublicSupabaseBuildEnv({
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  });
  const features = {
    serverNutritionEngine: Boolean(serverNutritionEngine),
  };
  return `window.COACH_SUPABASE = Object.freeze(${JSON.stringify({
    url: safeUrl,
    publishableKey: safeKey,
  })});\nwindow.COACH_FEATURES = Object.freeze(${JSON.stringify(features)});\n`;
}

/**
 * Strip inlined nutrition formulas / coefficients from calculator HTML for the
 * server-nutrition Preview path. Leaves UI chrome + PDF client helpers.
 * @param {string} html
 */
export function stripClientNutritionFormulas(html) {
  if (typeof html !== 'string') throw new Error('stripClientNutritionFormulas requires HTML');
  let out = html;

  // Replace shared engine block with a stub (no coefficients / suggestBanque logic).
  out = out.replace(
    /<script id="coach-shared-engine">[\s\S]*?<\/script>/i,
    `<script id="coach-shared-engine">
(function (global) {
  function blocked(name) {
    throw new Error('Client engine disabled (' + name + ') — use server nutrition APIs');
  }
  global.CoachSharedEngine = {
    FEATURE_DA_ENABLED: false,
    createEmptyJourData: function () {
      return {
        banque: { pro: 0, fec: 0, leg: 0, fru: 0, lai: 0, lip: 0, whey: 0 },
        repartition: new Array(42).fill(0),
        eauAjout: 0, eauManuel: false, eauLitres: null, heureEntrainement: null, repartitionSelonEntrainement: true,
      };
    },
    normalizeProteinesParKg: function (v) { var n = parseFloat(v); return isNaN(n) ? 2 : Math.min(3.5, Math.max(0.5, Math.round(n * 10) / 10)); },
    normalizeProteinesPct: function (v) { var n = parseFloat(v); return isNaN(n) ? 25 : Math.min(60, Math.max(10, Math.round(n))); },
    normalizeMacroPct: function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : Math.min(90, Math.max(5, Math.round(n))); },
    // Atwater display helpers only (same as server macros.mjs). Not portion/NASEM IP.
    kcalFromMacros: function (p, g, l) { return Math.round((Number(p)||0)*4 + (Number(g)||0)*4 + (Number(l)||0)*9); },
    macroPercentagesFromGrams: function (pro, glu, lip) {
      var p = Number(pro) || 0, g = Number(glu) || 0, l = Number(lip) || 0;
      var total = Math.round(p * 4 + g * 4 + l * 9);
      if (!total) return { pro: 0, glu: 0, lip: 0 };
      var proPct = Math.round((p * 4 / total) * 100);
      var gluPct = Math.round((g * 4 / total) * 100);
      return { pro: proPct, glu: gluPct, lip: Math.max(0, 100 - proPct - gluPct) };
    },
    roundHalf: function (n) { return Math.round((Number(n)||0) * 2) / 2; },
    getPortionTotals: function () { return blocked('getPortionTotals'); },
    computeBanqueTotals: function () { return blocked('computeBanqueTotals'); },
    // Bridge replaces this with server planned_totals cache after banque settle.
    computePlannedTotalsFromRepartition: function () { return { pro: 0, glu: 0, lip: 0, kcal: 0 }; },
    isJourClientPlanConfigured: function () { return true; },
    scorePortions: function () { return blocked('scorePortions'); },
    suggestBanque: function () { return blocked('suggestBanque'); },
    distribuerPortions: function () { return blocked('distribuerPortions'); },
    serverStub: true
  };
})(typeof window !== 'undefined' ? window : globalThis);
</script>`,
  );

  // Neutralize legacy category averages and meal presets (server provides via API).
  out = out.replace(
    /const MOYENNES\s*=\s*\{[\s\S]*?\};/g,
    'const MOYENNES = Object.freeze({ pro:{p:0,g:0,l:0},fec:{p:0,g:0,l:0},leg:{p:0,g:0,l:0},fru:{p:0,g:0,l:0},lai:{p:0,g:0,l:0},lip:{p:0,g:0,l:0},whey:{p:0,g:0,l:0} }); /* stripped: server nutrition path */',
  );
  // Lexical MOYENNES stays zeroed; meal recap must read server moyennes from globalThis.
  out = out.replace(
    /\bMOYENNES\[/g,
    '(globalThis.MOYENNES||MOYENNES)[',
  );

  // Share calculator state with the ES module bridge (let is not visible on globalThis).
  out = out.replace(
    /let currentTDEE = 0;/,
    'var currentTDEE = 0;',
  );
  out = out.replace(
    /let selectedGoalMultiplier = 1\.0;/,
    'var selectedGoalMultiplier = 1.0;',
  );
  out = out.replace(
    /let pdfCreator = 'kr';/,
    "var pdfCreator = 'kr';",
  );
  out = out.replace(
    /let pdfLang = 'fr';/,
    "var pdfLang = 'fr';",
  );
  out = out.replace(
    /let jourReposActif = true;/,
    'var jourReposActif = true;',
  );
  out = out.replace(
    /let targets = \{ kcal: 0, pro: 0, glu: 0, lip: 0 \};/,
    'var targets = { kcal: 0, pro: 0, glu: 0, lip: 0 };',
  );
  out = out.replace(
    /let activeJour = 'entrainement';/,
    "var activeJour = 'entrainement';",
  );
  out = out.replace(
    /let joursData = \{ entrainement: null, repos: null \};/,
    'var joursData = { entrainement: null, repos: null };',
  );
  out = replaceFunctionSpan(
    out,
    'const REPART_PRESETS = {',
    'function createEmptyJourData',
    'const REPART_PRESETS = Object.freeze({}); /* stripped: server nutrition path */\n\n',
  );

  // Remove legacy chargerCoachData fetch URLs that advertise /api/coach-data.
  out = out.replace(
    /const underWorkspace = location\.pathname\.includes\('\/workspace'\);\s*const urls = underWorkspace[\s\S]*?: \['\.\/coach-data\.json', '\/api\/coach-data'\];/,
    'const urls = []; /* stripped: server nutrition bridge loads data via /api/coach-* */',
  );
  out = out.replace(
    /\/api\/coach-data/g,
    '/api/coach-legacy-removed',
  );
  out = out.replace(
    /console\.error\('coach-data\.json:', err\);/g,
    "console.error('coach data load:', err);",
  );

  out = out.replace(
    /const NASEM_COEFFICIENTS\s*=\s*\{[\s\S]*?\n\};/m,
    'const NASEM_COEFFICIENTS = Object.freeze({}); /* stripped: server nutrition path */',
  );
  out = out.replace(
    /const PA_H\s*=\s*\{[^}]+\};/g,
    'const PA_H = {}; /* stripped */',
  );
  out = out.replace(
    /const PA_F\s*=\s*\{[^}]+\};/g,
    'const PA_F = {}; /* stripped */',
  );

  // Replace KR science NASEM/IOM helpers by span (nested braces break non-greedy regex).
  out = replaceFunctionSpan(
    out,
    'function krNasem2023Eer',
    'function krIom2005Eer',
    `function krNasem2023Eer() {
        throw new Error('Client NASEM disabled — use /api/coach-calc-energy');
    }

    `,
  );
  out = replaceFunctionSpan(
    out,
    'function krIom2005Eer',
    'function krSetYouthGoalGuard',
    `function krIom2005Eer() {
        throw new Error('Client IOM disabled — use /api/coach-calc-energy');
    }

    `,
  );

  // Neutralize legacy inline IOM block inside the original calculerBesoins.
  out = out.replace(
    /const PA_H = \{ sedentaire: 1\.00, leger: 1\.11, modere: 1\.25, actif: 1\.48 \};\s*const PA_F = \{ sedentaire: 1\.00, leger: 1\.12, modere: 1\.27, actif: 1\.45 \};/g,
    'const PA_H = {}; const PA_F = {}; /* stripped: server nutrition path */',
  );
  out = out.replace(
    /bmr\s*=\s*662\s*-\s*\(9\.53\s*\*\s*age\)[\s\S]{0,120}?tdee\s*=\s*662\s*-\s*\(9\.53\s*\*\s*age\)[\s\S]{0,80}?;/g,
    'bmr = 0; tdee = 0; /* stripped: server nutrition path */',
  );
  out = out.replace(
    /bmr\s*=\s*354\s*-\s*\(6\.91\s*\*\s*age\)[\s\S]{0,120}?tdee\s*=\s*354\s*-\s*\(6\.91\s*\*\s*age\)[\s\S]{0,80}?;/g,
    'bmr = 0; tdee = 0; /* stripped: server nutrition path */',
  );

  // Neutralize dual-brand client PDF entrypoint (server bridge owns exporterPDF).
  out = out.replace(
    /exporterPDF\s*=\s*function\s*\(\)\s*\{[\s\S]*?\n\};/,
    `exporterPDF = function () {
    throw new Error('Client PDF disabled — use /api/coach-generate-pdf');
};`,
  );

  // Avoid fire-and-forget nutrition recalcs after appliquerProfilData (race markClean).
  // Workspace bootstrap awaits server calculerBesoins after apply instead.
  out = out.replace(
    /\n\s*calculerBesoins\(\);\s*\n\s*calculerBanque\(\);\s*\n\s*if \(!eauManuel\) updateEau\(\);\s*\n\s*calculerRepartition\(\);\s*\n\s*setJourReposActif/,
    '\n    /* stripped: workspace awaits server calculerBesoins after apply */\n    setJourReposActif',
  );

  // Mark server path so audits can detect formula absence markers.
  if (!out.includes('data-coach-server-nutrition="1"')) {
    out = out.replace('<html', '<html data-coach-server-nutrition="1"');
  }
  return out;
}

/**
 * Replace from functionStart marker through (but not including) nextMarker.
 * @param {string} source
 * @param {string} functionStart
 * @param {string} nextMarker
 * @param {string} replacement
 */
function replaceFunctionSpan(source, functionStart, nextMarker, replacement) {
  const start = source.indexOf(functionStart);
  if (start === -1) return source;
  const end = source.indexOf(nextMarker, start + functionStart.length);
  if (end === -1) return source;
  return source.slice(0, start) + replacement + source.slice(end);
}

/** True when delivered HTML still embeds recognizable energy coefficient IP. */
export function htmlContainsEnergyFormulaIp(html) {
  if (typeof html !== 'string') return false;
  if (/1004\.82,\s*-10\.83,\s*6\.52,\s*15\.91/.test(html)) return true;
  if (/662\s*-\s*\(9\.53\s*\*\s*age\)[\s\S]{0,80}15\.91[\s\S]{0,40}539\.6/.test(html)) return true;
  if (/function krNasem2023Eer\([\s\S]{200,}15\.91/.test(html)) return true;
  if (/pro:\s*\{\s*p:\s*9,\s*g:\s*0,\s*l:\s*2\s*\}/.test(html)) return true;
  return false;
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
  const publicCoachData = path.join(outDir, 'workspace', 'coach-data.json');
  if (fs.existsSync(publicCoachData)) {
    throw new Error('Deploy tree must not include public workspace/coach-data.json (bank must load server-side via authenticated minimal APIs only)');
  }
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
