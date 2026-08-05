import { CATS } from '../pdf/category-labels.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_KEYS = new Set([
  'banque', 'repartition', 'targets', 'timing', 'eauAjout', 'eauManuel', 'eauLitres',
  'heureEntrainement', 'repartitionSelonEntrainement',
]);
const TIMING_KEYS = new Set(['active', 'heure', 'heureLabel', 'summary', 'preIdx', 'postIdx']);
const BODY_KEYS = new Set([
  'organization_id', 'organization_slug', 'client_id', 'locale', 'athlete_name', 'goal_label',
  'macro_ratio_label', 'coach_notes', 'goal_multiplier', 'include_rest', 'training', 'rest',
  'pdf_brand',
]);
const PDF_BRANDS = new Set(['kr', 'elevate']);

function fail() { return { ok: false, error: 'bad_request' }; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function finite(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function noUnknown(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}
function validateDay(day) {
  if (!object(day) || !noUnknown(day, DAY_KEYS) || !object(day.banque) || !noUnknown(day.banque, new Set(CATS))) return false;
  if (!Array.isArray(day.repartition) || day.repartition.length > 42 || !day.repartition.every((n) => finite(n, 0, 500))) return false;
  if (!object(day.targets) || !noUnknown(day.targets, new Set(['kcal', 'pro', 'glu', 'lip']))) return false;
  if (!['kcal', 'pro', 'glu', 'lip'].every((key) => finite(day.targets[key], 0, key === 'kcal' ? 20_000 : 5_000))) return false;
  if (!CATS.every((cat) => Object.hasOwn(day.banque, cat) && finite(day.banque[cat], 0, 500))) return false;
  if (day.timing !== undefined) {
    if (!object(day.timing) || !noUnknown(day.timing, TIMING_KEYS)) return false;
    if (day.timing.active !== undefined && typeof day.timing.active !== 'boolean') return false;
    if (['heure', 'heureLabel', 'summary'].some((key) => day.timing[key] !== undefined && (typeof day.timing[key] !== 'string' || day.timing[key].length > 120))) return false;
    if (['preIdx', 'postIdx'].some((key) => day.timing[key] !== undefined && (!Number.isInteger(day.timing[key]) || day.timing[key] < 0 || day.timing[key] > 5))) return false;
  }
  if (day.eauAjout !== undefined && !finite(day.eauAjout, 0, 100)) return false;
  if (day.eauLitres !== undefined && !finite(day.eauLitres, 0, 100)) return false;
  if (day.eauManuel !== undefined && typeof day.eauManuel !== 'boolean') return false;
  if (day.heureEntrainement !== undefined && (typeof day.heureEntrainement !== 'string' || !/^\d{2}:\d{2}$/.test(day.heureEntrainement))) return false;
  if (day.repartitionSelonEntrainement !== undefined && typeof day.repartitionSelonEntrainement !== 'boolean') return false;
  return true;
}

/** Strictly validate the server PDF request; reject unknown properties at all levels. */
export function validatePdfRequestBody(body) {
  if (!object(body) || !noUnknown(body, BODY_KEYS)) return fail();
  if (typeof body.client_id !== 'string' || !UUID_RE.test(body.client_id)) return fail();
  if (body.organization_id != null && (typeof body.organization_id !== 'string' || !UUID_RE.test(body.organization_id))) return fail();
  if (typeof body.organization_slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(body.organization_slug)) return fail();
  if (!['fr', 'en'].includes(body.locale)) return fail();
  if (typeof body.athlete_name !== 'string' || body.athlete_name.length < 1 || body.athlete_name.length > 120) return fail();
  if (typeof body.goal_label !== 'string' || body.goal_label.length > 120) return fail();
  if (typeof body.macro_ratio_label !== 'string' || body.macro_ratio_label.length > 120) return fail();
  if (typeof body.coach_notes !== 'string' || body.coach_notes.length > 4000 || /\0|<script|javascript:/i.test(body.coach_notes)) return fail();
  if (body.goal_multiplier !== undefined && !finite(body.goal_multiplier, 0.5, 1.5)) return fail();
  if (body.include_rest !== undefined && typeof body.include_rest !== 'boolean') return fail();
  if (body.pdf_brand !== undefined && body.pdf_brand !== null && body.pdf_brand !== '') {
    if (typeof body.pdf_brand !== 'string' || !PDF_BRANDS.has(body.pdf_brand)) return fail();
  }
  if (!validateDay(body.training)) return fail();
  if (body.rest !== undefined && body.rest !== null && !validateDay(body.rest)) return fail();
  return {
    ok: true,
    value: {
      ...body,
      organization_id: body.organization_id || null,
      include_rest: body.include_rest === true,
      rest: body.rest || null,
      pdf_brand: body.pdf_brand || null,
    },
  };
}
