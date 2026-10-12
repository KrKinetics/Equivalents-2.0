/**
 * Coach-session store for the internal gateway.
 * The caller has already verified the Master Coach signature.
 * This module never accepts SQL text.
 */
import { DOSSIER_SCHEMA_VERSION } from '../../services/storage/dossier-schema.mjs';
import { loadClientPlanningLandmarks } from '../intake/load-client-planning-landmarks.mjs';
import { projectStructuredIntake } from '../../intake/structured-intake.mjs';
import { createSupabaseGatewayLease } from './gateway-session-lease.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function headers(accessToken, publishableKey) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function rest(fetchImpl, url, accessToken, publishableKey, pathAndQuery, init = {}) {
  const response = await fetchImpl(`${url}${pathAndQuery}`, {
    ...init,
    headers: { ...headers(accessToken, publishableKey), ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error('rest_failed');
  if (response.status === 204) return null;
  return response.json();
}

function mapClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    email: row.email || null,
    phone: row.phone || null,
    notes: row.notes || '',
    serviceType: row.service_type || null,
    fictional: row.is_fictional === true,
  };
}

export function createMasterCoachGatewayStore({
  fetchImpl = globalThis.fetch,
  env = process.env,
  accessToken = '',
} = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_PUBLISHABLE_KEY || '';
  const token = accessToken;
  let organizationId = null;

  async function organization() {
    if (!token) throw new Error('session_missing');
    if (organizationId) return organizationId;
    const rows = await rest(
      fetchImpl,
      url,
      token,
      serviceKey,
      '/rest/v1/memberships?select=organization_id,organizations(slug)&limit=10',
    );
    const match = (Array.isArray(rows) ? rows : []).find((row) => row.organizations?.slug === 'kr-kinetics');
    const id = match?.organization_id || null;
    if (!UUID_RE.test(id || '')) throw new Error('org_missing');
    organizationId = id;
    return organizationId;
  }

  return {
    async getClient(portalClientId) {
      const orgId = await organization();
      const rows = await rest(
        fetchImpl,
        url,
        token,
        serviceKey,
        `/rest/v1/clients?id=eq.${encodeURIComponent(portalClientId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=id,organization_id,full_name,email,phone,notes,service_type,is_fictional&limit=1`,
      );
      return mapClient(Array.isArray(rows) ? rows[0] : null);
    },

    async getDossier(portalClientId) {
      const orgId = await organization();
      const rows = await rest(
        fetchImpl,
        url,
        token,
        serviceKey,
        `/rest/v1/client_dossiers?client_id=eq.${encodeURIComponent(portalClientId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=payload,updated_at&limit=1`,
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row?.payload) return null;
      return { payload: row.payload, updatedAt: row.updated_at || null };
    },

    async saveDossier(portalClientId, payload) {
      const orgId = await organization();
      const rows = await rest(fetchImpl, url, token, serviceKey, '/rest/v1/client_dossiers?on_conflict=client_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          client_id: portalClientId,
          organization_id: orgId,
          schema_version: DOSSIER_SCHEMA_VERSION,
          payload,
          updated_at: new Date().toISOString(),
        }),
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { updatedAt: row?.updated_at || null };
    },

    async createClient(fields) {
      const orgId = await organization();
      const createdBy = UUID_RE.test(env.KR_COACH_USER_ID || '') ? env.KR_COACH_USER_ID : null;
      const rows = await rest(fetchImpl, url, token, serviceKey, '/rest/v1/clients', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          organization_id: orgId,
          created_by: createdBy,
          full_name: fields.fullName,
          email: fields.email,
          phone: fields.phone,
          notes: fields.notes,
          service_type: fields.serviceType,
          is_fictional: false,
        }),
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { id: row?.id || null };
    },

    async patchClient(portalClientId, patch) {
      const orgId = await organization();
      const row = {};
      if (Object.hasOwn(patch, 'fullName')) row.full_name = patch.fullName;
      if (Object.hasOwn(patch, 'email')) row.email = patch.email;
      if (Object.hasOwn(patch, 'phone')) row.phone = patch.phone;
      if (Object.hasOwn(patch, 'notes')) row.notes = patch.notes;
      if (Object.hasOwn(patch, 'serviceType')) row.service_type = patch.serviceType;
      row.updated_at = new Date().toISOString();
      const rows = await rest(
        fetchImpl,
        url,
        token,
        serviceKey,
        `/rest/v1/clients?id=eq.${encodeURIComponent(portalClientId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(row),
        },
      );
      return mapClient(Array.isArray(rows) ? rows[0] : null);
    },

    async listIntake(portalClientId) {
      const orgId = await organization();
      const rows = await rest(
        fetchImpl,
        url,
        token,
        serviceKey,
        `/rest/v1/client_intake_invites?client_id=eq.${encodeURIComponent(portalClientId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=id,status,expires_at,opened_at,submitted_at,created_at&order=created_at.desc&limit=20`,
      );
      return (Array.isArray(rows) ? rows : []).map(mapInvite);
    },

    async latestStructuredIntake(portalClientId) {
      const orgId = await organization();
      const rows = await rest(
        fetchImpl,
        url,
        token,
        serviceKey,
        `/rest/v1/client_intake_responses?client_id=eq.${encodeURIComponent(portalClientId)}&organization_id=eq.${encodeURIComponent(orgId)}&status=eq.submitted&select=id,client_id,organization_id,status,submitted_at,answers&order=submitted_at.desc&limit=5`,
      );
      for (const row of Array.isArray(rows) ? rows : []) {
        const projected = projectStructuredIntake(row, { clientId: portalClientId, organizationId: orgId });
        if (projected) return projected;
      }
      return null;
    },

    async listMotivation(portalClientId) {
      const orgId = await organization();
      const rows = await rest(
        fetchImpl,
        url,
        token,
        serviceKey,
        `/rest/v1/client_motivation_invites?client_id=eq.${encodeURIComponent(portalClientId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=id,status,expires_at,opened_at,submitted_at,created_at&order=created_at.desc&limit=20`,
      );
      return (Array.isArray(rows) ? rows : []).map(mapInvite);
    },

    async loadLandmarks(portalClientId) {
      const orgId = await organization();
      return loadClientPlanningLandmarks({
        accessToken: token,
        organizationId: orgId,
        clientId: portalClientId,
        supabaseUrl: url,
        publishableKey: serviceKey,
        fetchImpl,
      });
    },

    async snapshot(portalClientIds) {
      const orgId = await organization();
      const filter = portalClientIds.join(',');
      const [clients, dossiers, intake, motivation] = await Promise.all([
        rest(fetchImpl, url, token, serviceKey, `/rest/v1/clients?organization_id=eq.${encodeURIComponent(orgId)}&id=in.(${filter})&select=id,service_type,is_fictional`),
        rest(fetchImpl, url, token, serviceKey, `/rest/v1/client_dossiers?organization_id=eq.${encodeURIComponent(orgId)}&client_id=in.(${filter})&select=client_id,updated_at`),
        rest(fetchImpl, url, token, serviceKey, `/rest/v1/client_intake_invites?organization_id=eq.${encodeURIComponent(orgId)}&client_id=in.(${filter})&select=client_id,status,created_at&order=created_at.desc`),
        rest(fetchImpl, url, token, serviceKey, `/rest/v1/client_motivation_invites?organization_id=eq.${encodeURIComponent(orgId)}&client_id=in.(${filter})&select=client_id,status,created_at&order=created_at.desc`),
      ]);
      const dossierByClient = new Map((dossiers || []).map((row) => [row.client_id, row.updated_at || null]));
      const latest = (rows) => {
        const seen = new Map();
        for (const row of rows || []) {
          if (!seen.has(row.client_id)) seen.set(row.client_id, safeStatus(row.status));
        }
        return seen;
      };
      const intakeLatest = latest(intake);
      const motivationLatest = latest(motivation);
      return (clients || [])
        .filter((row) => row.is_fictional !== true)
        .map((row) => ({
          portalClientId: row.id,
          serviceType: row.service_type || null,
          hasDossier: dossierByClient.has(row.id),
          dossierUpdatedAt: dossierByClient.get(row.id) || null,
          intakeStatus: intakeLatest.get(row.id) || null,
          motivationStatus: motivationLatest.get(row.id) || null,
        }));
    },
  };
}

function mapInvite(row) {
  return {
    id: row.id,
    status: safeStatus(row.status),
    expiresAt: row.expires_at || null,
    openedAt: row.opened_at || null,
    submittedAt: row.submitted_at || null,
    createdAt: row.created_at || null,
  };
}

function safeStatus(value) {
  return typeof value === 'string' && /^[a-z_]{1,32}$/.test(value) ? value : null;
}

const coachSession = { token: null, expiresAt: 0, inflight: null };

export function resetKrCoachSessionCache(cache = coachSession) {
  cache.token = null;
  cache.expiresAt = 0;
  cache.inflight = null;
}

function sessionExpiry(token, now) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch {
    return now + 50 * 60 * 1000;
  }
  return now + 50 * 60 * 1000;
}

async function requestCoachSession({ fetchImpl, env }) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || '';
  const userId = env.KR_COACH_USER_ID || '';
  if (!url || !serviceKey || !publishableKey || !UUID_RE.test(userId)) return { token: null, stage: 'config' };
  const userResponse = await fetchImpl(`${url}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!userResponse.ok) return { token: null, stage: 'user', upstreamStatus: userResponse.status };
  const user = await userResponse.json();
  if (typeof user?.email !== 'string' || !user.email) return { token: null, stage: 'user' };
  let upstreamStatus = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const linkResponse = await fetchImpl(`${url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email: user.email }),
    });
    if (!linkResponse.ok) return { token: null, stage: 'link', upstreamStatus: linkResponse.status };
    const link = await linkResponse.json();
    const tokenHash = link?.hashed_token || link?.properties?.hashed_token;
    if (!tokenHash) return { token: null, stage: 'link' };
    const verifyResponse = await fetchImpl(`${url}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
    });
    upstreamStatus = verifyResponse.status;
    if (!verifyResponse.ok) continue;
    const session = await verifyResponse.json();
    if (typeof session?.access_token !== 'string') return { token: null, stage: 'session' };
    return { token: session.access_token, stage: 'ok' };
  }
  return { token: null, stage: 'verify', upstreamStatus };
}

function remember(cache, token, clock) {
  cache.token = token;
  cache.expiresAt = sessionExpiry(token, clock);
  return cache.expiresAt;
}

export async function mintKrCoachAccessToken({
  fetchImpl = globalThis.fetch,
  env = process.env,
  cache = coachSession,
  now = Date.now,
  lease = null,
} = {}) {
  const clock = typeof now === 'function' ? now() : now;
  const activeLease = lease ?? (env.MASTER_COACH_GATEWAY_LEASE === 'supabase'
    ? createSupabaseGatewayLease({ fetchImpl, env })
    : null);
  if (cache.token && cache.expiresAt > clock + 30_000 && !activeLease) {
    return { token: cache.token, stage: 'ok', sessionScope: 'instance' };
  }
  if (activeLease && cache.token && cache.expiresAt > clock + 30_000) {
    const shared = await activeLease.read(clock);
    if (shared === undefined) return { token: cache.token, stage: 'ok', sessionScope: 'instance' };
    if (shared === cache.token) return { token: cache.token, stage: 'ok', sessionScope: 'shared' };
    if (typeof shared === 'string' && shared) {
      remember(cache, shared, clock);
      return { token: shared, stage: 'ok', sessionScope: 'shared' };
    }
    await activeLease.store(cache.token, cache.expiresAt);
    return { token: cache.token, stage: 'ok', sessionScope: 'shared' };
  }
  let sharedStore = false;
  if (activeLease) {
    const shared = await activeLease.read(clock);
    if (typeof shared === 'string' && shared) {
      remember(cache, shared, clock);
      return { token: shared, stage: 'ok', sessionScope: 'shared' };
    }
    if (shared === null) {
      const claim = await activeLease.claim(clock);
      if (claim === 'ready') {
        const again = await activeLease.read(clock);
        if (typeof again === 'string' && again) {
          remember(cache, again, clock);
          return { token: again, stage: 'ok', sessionScope: 'shared' };
        }
      } else if (claim === 'busy') {
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          const again = await activeLease.read(Date.now());
          if (typeof again === 'string' && again) {
            remember(cache, again, clock);
            return { token: again, stage: 'ok', sessionScope: 'shared' };
          }
        }
        return { token: null, stage: 'lease', sessionScope: 'shared' };
      } else if (claim === 'claimed') {
        sharedStore = true;
      }
    }
  }
  if (!cache.inflight) {
    cache.inflight = requestCoachSession({ fetchImpl, env }).then(async (result) => {
      if (result.token) {
        const expiresAt = remember(cache, result.token, clock);
        if (sharedStore) {
          const stored = await activeLease.store(result.token, expiresAt);
          result.sessionScope = stored ? 'shared' : 'instance';
        } else {
          result.sessionScope = 'instance';
        }
      }
      return result;
    }).finally(() => {
      cache.inflight = null;
    });
  }
  return cache.inflight;
}
