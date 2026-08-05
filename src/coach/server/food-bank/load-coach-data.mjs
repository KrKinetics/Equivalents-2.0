/**
 * Server-only food bank loader.
 *
 * Loads coach-calculator/coach-data.json once per isolate (cold start cost).
 * Never expose this module to browser bundles. Never log food contents.
 *
 * Size (approx): ~200 KiB JSON / 287 foods (projection, not full src/data bank).
 * Cold start: one synchronous fs read + JSON.parse into module-scoped cache.
 * Memory: one in-memory object retained for the lifetime of the serverless isolate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(moduleDir, '../../../..');

/** @type {{ data: object, loadedAt: number, path: string, bytes: number } | null} */
let cache = null;

function candidatePaths() {
  return [
    path.join(process.cwd(), 'coach-calculator', 'coach-data.json'),
    path.join(root, 'coach-calculator', 'coach-data.json'),
    path.join(moduleDir, '../../../../coach-calculator/coach-data.json'),
  ];
}

/**
 * Resolve absolute path to coach-data.json or null.
 */
export function resolveCoachDataPath() {
  for (const abs of candidatePaths()) {
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Load (and cache) the coach food-bank projection.
 * @param {{ forceReload?: boolean }} [opts]
 * @returns {{ ok: true, data: object, meta: object } | { ok: false, error: 'unavailable' }}
 */
export function loadCoachData({ forceReload = false } = {}) {
  if (cache && !forceReload) {
    return {
      ok: true,
      data: cache.data,
      meta: {
        path: cache.path,
        bytes: cache.bytes,
        loadedAt: cache.loadedAt,
        cached: true,
        totalFoods: cache.data.totalFoods,
        verifiedFoods: cache.data.verifiedFoods,
      },
    };
  }

  const abs = resolveCoachDataPath();
  if (!abs) return { ok: false, error: 'unavailable' };

  const raw = fs.readFileSync(abs);
  const data = JSON.parse(raw.toString('utf8'));
  if (!data || !Array.isArray(data.foods)) return { ok: false, error: 'unavailable' };

  cache = {
    data,
    path: abs,
    bytes: raw.length,
    loadedAt: Date.now(),
  };

  return {
    ok: true,
    data: cache.data,
    meta: {
      path: cache.path,
      bytes: cache.bytes,
      loadedAt: cache.loadedAt,
      cached: false,
      totalFoods: data.totalFoods,
      verifiedFoods: data.verifiedFoods,
    },
  };
}

/** Test helper */
export function clearCoachDataCache() {
  cache = null;
}

/**
 * Public meta safe for logs / docs (no food contents).
 */
export function coachDataLoadStats() {
  if (!cache) return { loaded: false };
  return {
    loaded: true,
    bytes: cache.bytes,
    totalFoods: cache.data?.totalFoods ?? null,
    verifiedFoods: cache.data?.verifiedFoods ?? null,
    loadedAt: cache.loadedAt,
  };
}
