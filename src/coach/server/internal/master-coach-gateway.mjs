/**
 * Signed Master Coach → Equivalents coach operations.
 * No SQL text is accepted. Organization and entitlement are decided here.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createSupabaseGatewayLease } from './gateway-session-lease.mjs';
import path from 'node:path';
import { clientHasNutritionAccess, parseServiceType } from '../../domain/client-service-entitlements.mjs';
import { formatStoredHeightCm, formatStoredWeightKg } from '../../intake/intake-anthropometrics.mjs';
import { validateDossierPayload } from '../../services/storage/dossier-schema.mjs';

export const GATEWAY_SKEW_MS = 60_000;
export const UNSAVED_DOSSIER_MESSAGE = 'Des modifications ne sont pas sauvegardées. Sauvegardez le dossier avant de publier.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPS = new Set([
  'dossier.get',
  'dossier.put',
  'client.get',
  'client.patch',
  'client.create',
  'intake.list',
  'intake.latestStructured',
  'intake.create',
  'motivation.list',
  'motivation.create',
  'intake.report',
  'intake.reportPdf',
  'motivation.report',
  'motivation.reportPdf',
  'coach.snapshot',
  'nutrition.publish',
  'landmarks.get',
]);
const FORBIDDEN = new Set([
  'owner_user_id',
  'ownerUserId',
  'organization_id',
  'organizationId',
  'organization_slug',
  'organizationSlug',
  'sql',
  'query',
  'storage_path',
  'storagePath',
  'revision_id',
  'revisionId',
  'revision_number',
  'master_coach_client_id',
  'masterCoachClientId',
  'service_role',
  'secret',
]);

export function gatewaySignature(secret, timestamp, payload) {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

const seenGatewaySignatures = new Map();

export function claimGatewaySignature(signature, now = Date.now()) {
  if (typeof signature !== 'string' || signature.length < 32) return false;
  for (const [key, at] of seenGatewaySignatures) {
    if (now - at > GATEWAY_SKEW_MS) seenGatewaySignatures.delete(key);
  }
  if (seenGatewaySignatures.has(signature)) return false;
  seenGatewaySignatures.set(signature, now);
  return true;
}

/**
 * The Map above is one server process. It is not a distributed replay guard.
 * A shared lease is used only when MASTER_COACH_GATEWAY_LEASE=supabase and the
 * lease function exists. Until then the scope stays "instance".
 */
export async function claimGatewayReplay(signature, {
  now = Date.now(),
  lease = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const active = lease ?? (env.MASTER_COACH_GATEWAY_LEASE === 'supabase'
    ? createSupabaseGatewayLease({ fetchImpl, env })
    : null);
  if (active) {
    const accepted = await active.claimReplay(signature, now);
    if (accepted === true || accepted === false) return { accepted, scope: 'shared' };
  }
  return { accepted: claimGatewaySignature(signature, now), scope: 'instance' };
}

export function verifyGatewaySignature({ secret, timestamp, signature, payload, now = Date.now() }) {
  if (!secret || typeof timestamp !== 'string' || typeof signature !== 'string' || typeof payload !== 'string') {
    return false;
  }
  if (!/^\d{10,16}$/.test(timestamp)) return false;
  const stamped = Number(timestamp);
  if (!Number.isFinite(stamped) || Math.abs(now - stamped) > GATEWAY_SKEW_MS) return false;
  const expected = gatewaySignature(secret, timestamp, payload);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function resolveCoachCalculatorAsset(root, requestPath) {
  const clean = String(requestPath || '').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || clean.includes('\\') || clean.includes('\0')) return null;
  if (!clean.startsWith('coach-calculator/')) return null;
  if (clean.includes('.env') || clean.endsWith('.mjs.map')) return null;
  const base = path.resolve(root, 'coach-calculator');
  const full = path.resolve(root, clean);
  const relative = path.relative(base, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

function fail(status, code, extra = {}) {
  return { status, body: { ok: false, code, ...extra } };
}

function uuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function publicClient(client) {
  return {
    portalClientId: client.id,
    fullName: client.fullName,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    serviceType: client.serviceType,
    fictional: false,
  };
}

function assertRealClient(client) {
  if (!client || client.fictional === true) return fail(404, 'PORTAL_CLIENT_NOT_LINKED');
  return null;
}

/**
 * @param {object} input
 * @param {string} input.rawBody
 * @param {string} input.timestamp
 * @param {string} input.signature
 * @param {string} input.secret
 * @param {number} [input.now]
 * @param {object} input.store
 * @param {(ctx: object) => Promise<object>} [input.publishCanonical]
 * @param {(ctx: object) => Promise<object>} [input.sendIntake]
 * @param {(ctx: object) => Promise<object>} [input.sendMotivation]
 */
export async function executeMasterCoachGateway(input) {
  const authorized = input.skipSignature === true || verifyGatewaySignature({
    secret: input.secret,
    timestamp: input.timestamp,
    signature: input.signature,
    payload: input.rawBody,
    now: input.now,
  });
  if (!authorized) return fail(401, 'LEGACY_GATEWAY_AUTH_FAILED');

  let body;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    return fail(400, 'BAD_REQUEST');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'BAD_REQUEST');
  for (const key of Object.keys(body)) {
    if (FORBIDDEN.has(key)) return fail(400, 'FORBIDDEN_FIELD');
  }
  if (!OPS.has(body.op)) return fail(400, 'UNKNOWN_OPERATION');

  try {
    return await runOperation(body, input);
  } catch {
    return fail(500, operationFailureCode(body.op));
  }
}

function operationFailureCode(op) {
  if (op === 'dossier.get') return 'DOSSIER_LOAD_FAILED';
  if (op === 'dossier.put') return 'DOSSIER_SAVE_FAILED';
  if (op === 'intake.list' || op === 'intake.latestStructured' || op === 'intake.create' || op === 'intake.report' || op === 'intake.reportPdf') {
    return 'QUESTIONNAIRE_GATEWAY_FAILED';
  }
  if (op === 'motivation.list' || op === 'motivation.create' || op === 'motivation.report' || op === 'motivation.reportPdf') {
    return 'MOTIVATION_GATEWAY_FAILED';
  }
  if (op === 'nutrition.publish') return 'NUTRITION_PUBLICATION_FAILED';
  if (op === 'landmarks.get') return 'LANDMARKS_UNAVAILABLE';
  return 'LEGACY_GATEWAY_FAILED';
}

async function loadClient(store, portalClientId) {
  if (!uuid(portalClientId)) return { error: fail(400, 'BAD_REQUEST') };
  const client = await store.getClient(portalClientId);
  const denied = assertRealClient(client);
  if (denied) return { error: denied };
  return { client };
}

async function runOperation(body, input) {
  const { store } = input;
  if (body.op === 'client.create') return createClient(body, store);
  if (body.op === 'coach.snapshot') return snapshot(body, store);

  const loaded = await loadClient(store, body.portalClientId);
  if (loaded.error) return loaded.error;
  const client = loaded.client;

  if (body.op === 'client.get') return { status: 200, body: { ok: true, client: publicClient(client) } };
  if (body.op === 'client.patch') return patchClient(body, client, store);
  if (body.op === 'dossier.get' || body.op === 'dossier.put' || body.op === 'nutrition.publish') {
    if (!clientHasNutritionAccess(client.serviceType)) return fail(403, 'NOT_ENTITLED');
  }
  if (body.op === 'dossier.get') return readDossier(client, store);
  if (body.op === 'dossier.put') return writeDossier(body, client, store);
  if (body.op === 'nutrition.publish') return publishDossier(body, client, input);
  if (body.op === 'landmarks.get') return readLandmarks(body, client, store);
  if (body.op === 'intake.list') return { status: 200, body: { ok: true, invites: await store.listIntake(client.id) } };
  if (body.op === 'intake.latestStructured') return readStructuredIntake(client, store);
  if (body.op === 'motivation.list') return { status: 200, body: { ok: true, invites: await store.listMotivation(client.id) } };
  if (body.op === 'intake.create') return sendInvite(input.sendIntake, client);
  if (body.op === 'motivation.create') return sendInvite(input.sendMotivation, client);
  if (body.op === 'intake.report' || body.op === 'intake.reportPdf' || body.op === 'motivation.report' || body.op === 'motivation.reportPdf') {
    return renderStoredReport(body, client, input);
  }
  return fail(400, 'UNKNOWN_OPERATION');
}

async function readStructuredIntake(client, store) {
  if (typeof store.latestStructuredIntake !== 'function') return fail(503, 'QUESTIONNAIRE_GATEWAY_FAILED');
  const intake = await store.latestStructuredIntake(client.id);
  return { status: 200, body: { ok: true, intake: intake || null, writesProfile: false } };
}

function publicLandmarkIntake(planning) {
  if (!planning?.sourceIntakeResponseId || !planning.sourceSubmittedAt || !planning.anthropometrics) return null;
  const view = planning.anthropometrics;
  const canonical = planning.canonical || {};
  return {
    sourceIntakeResponseId: String(planning.sourceIntakeResponseId),
    sourceSubmittedAt: String(planning.sourceSubmittedAt),
    ageYears: canonical.ageYears ?? null,
    heightCm: canonical.heightCm ?? null,
    weightKg: canonical.weightKg ?? null,
    age: view.age || '',
    heightPrimary: view.heightPrimary || '',
    heightSecondary: view.heightSecondary || '',
    weightPrimary: view.weightPrimary || '',
    weightSecondary: view.weightSecondary || '',
  };
}

async function readLandmarks(body, client, store) {
  if (typeof store.loadLandmarks !== 'function') return fail(503, 'LANDMARKS_UNAVAILABLE');
  const planning = await store.loadLandmarks(client.id);
  return {
    status: 200,
    body: {
      ok: true,
      intake: publicLandmarkIntake(planning),
      formattedHeight: formatStoredHeightCm(body.displayHeightCm),
      formattedWeight: formatStoredWeightKg(body.displayWeightKg),
      formattedPreviousWeight: formatStoredWeightKg(body.displayPreviousWeightKg),
    },
  };
}

async function createClient(body, store) {
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const serviceType = parseServiceType(body.serviceType);
  if (!fullName || fullName.length > 120 || !serviceType) return fail(400, 'BAD_REQUEST');
  const email = normalizeEmail(body.email);
  if (email === false) return fail(400, 'BAD_REQUEST');
  const created = await store.createClient({
    fullName,
    email,
    phone: normalizePhone(body.phone),
    notes: normalizeNotes(body.notes),
    serviceType,
  });
  if (!created?.id) return fail(500, 'LEGACY_GATEWAY_FAILED');
  return { status: 200, body: { ok: true, portalClientId: created.id, serviceType } };
}

async function patchClient(body, client, store) {
  const patch = {};
  if (Object.hasOwn(body, 'fullName')) {
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    if (!fullName || fullName.length > 120) return fail(400, 'BAD_REQUEST');
    patch.fullName = fullName;
  }
  if (Object.hasOwn(body, 'email')) {
    const email = normalizeEmail(body.email);
    if (email === false) return fail(400, 'BAD_REQUEST');
    patch.email = email;
  }
  if (Object.hasOwn(body, 'phone')) patch.phone = normalizePhone(body.phone);
  if (Object.hasOwn(body, 'notes')) patch.notes = normalizeNotes(body.notes);
  if (Object.hasOwn(body, 'serviceType')) {
    const serviceType = parseServiceType(body.serviceType);
    if (!serviceType) return fail(400, 'BAD_REQUEST');
    patch.serviceType = serviceType;
  }
  if (Object.keys(patch).length === 0) return fail(400, 'BAD_REQUEST');
  const updated = await store.patchClient(client.id, patch);
  return { status: 200, body: { ok: true, client: publicClient(updated) } };
}

async function readDossier(client, store) {
  const dossier = await store.getDossier(client.id);
  return {
    status: 200,
    body: {
      ok: true,
      exists: Boolean(dossier?.payload),
      updatedAt: dossier?.updatedAt || null,
      payload: dossier?.payload || null,
    },
  };
}

async function writeDossier(body, client, store) {
  const check = validateDossierPayload(body.payload);
  if (!check.ok) return fail(400, 'DOSSIER_INVALID');
  const saved = await store.saveDossier(client.id, body.payload);
  return { status: 200, body: { ok: true, updatedAt: saved?.updatedAt || null, writesPublication: false } };
}

async function publishDossier(body, client, input) {
  if (body.dirty === true) {
    return fail(409, 'UNSAVED_DOSSIER', { message: UNSAVED_DOSSIER_MESSAGE, writesDossier: false });
  }
  if (!uuid(body.publicationAttemptId)) return fail(400, 'BAD_REQUEST');
  if (typeof input.publishCanonical !== 'function') return fail(503, 'NUTRITION_PUBLICATION_FAILED');
  const result = await input.publishCanonical({
    portalClientId: client.id,
    publicationAttemptId: body.publicationAttemptId,
    client,
  });
  if (!result?.ok) {
    return {
      status: result?.status || 500,
      body: {
        ok: false,
        code: 'NUTRITION_PUBLICATION_FAILED',
        reason: typeof result?.reason === 'string' ? result.reason : null,
        writesDossier: false,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      revisionNumber: result.revisionNumber,
      idempotent: result.idempotent === true,
      writesDossier: false,
    },
  };
}

const SAFE_FILENAME = /^[\p{L}\p{N}_. -]{1,160}\.pdf$/u;

async function renderStoredReport(body, client, input) {
  const failure = operationFailureCode(body.op);
  if (typeof input.renderReport !== 'function') return fail(503, failure);
  const result = await input.renderReport({ op: body.op, client });
  if (!result?.ok) {
    return fail(result?.status === 404 ? 404 : 502, result?.status === 404 ? 'REPORT_NOT_FOUND' : failure);
  }
  if (typeof result.pdfBase64 === 'string') {
    if (!SAFE_FILENAME.test(result.filename || '') || result.pdfBase64.length > 4_000_000) {
      return fail(502, failure);
    }
    return { status: 200, body: { ok: true, filename: result.filename, pdfBase64: result.pdfBase64 } };
  }
  const markup = typeof result.markup === 'string' ? result.markup : '';
  const css = typeof result.css === 'string' ? result.css : '';
  if (!markup || markup.length > 1_500_000 || css.length > 200_000) return fail(502, failure);
  const lowered = `${markup}${css}`.toLowerCase();
  if (lowered.includes('<script') || lowered.includes('</style')) return fail(502, failure);
  return {
    status: 200,
    body: {
      ok: true,
      submittedAt: typeof result.submittedAt === 'string' ? result.submittedAt : null,
      markup,
      css,
    },
  };
}

async function sendInvite(sender, client) {
  if (typeof sender !== 'function') return fail(503, 'LEGACY_GATEWAY_FAILED');
  const result = await sender({ portalClientId: client.id, organizationId: client.organizationId });
  if (!result?.ok) return fail(result?.status || 502, 'LEGACY_GATEWAY_FAILED');
  return {
    status: 200,
    body: {
      ok: true,
      created: true,
      emailSent: result.emailSent === true,
      expiresAt: result.expiresAt || null,
    },
  };
}

async function snapshot(body, store) {
  const ids = Array.isArray(body.portalClientIds) ? body.portalClientIds : null;
  if (!ids || ids.length > 200 || ids.some((id) => !uuid(id))) return fail(400, 'BAD_REQUEST');
  const rows = await store.snapshot(ids);
  return { status: 200, body: { ok: true, clients: rows } };
}

function normalizeEmail(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (!email) return null;
  if (email.length > 200 || !email.includes('@') || email.includes(' ')) return false;
  return email;
}

function normalizePhone(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const phone = value.trim();
  if (!phone || phone.length > 40) return null;
  return phone;
}

function normalizeNotes(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 4000);
}
