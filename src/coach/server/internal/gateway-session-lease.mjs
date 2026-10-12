/**
 * Shared coach-session lease. One magic link at a time across instances.
 * When this lease is required, an unavailable lock fails the operation.
 * It does not fall back to a process-local cache.
 */

import { createHash } from "node:crypto";

export function signatureHash(signature) {
  return createHash("sha256").update(String(signature)).digest("hex");
}

export function createMemoryGatewayLease() {
  const state = { token: null, expiresAt: 0, claimUntil: 0, fence: 0, seen: new Set() };
  return {
    available: true,
    async read(now) {
      if (state.token && state.expiresAt > now + 30_000) return state.token;
      return null;
    },
    async claim(now) {
      if (state.token && state.expiresAt > now + 30_000) return { state: "ready", fence: state.fence };
      if (state.claimUntil > now) return { state: "busy", fence: state.fence };
      state.fence += 1;
      state.claimUntil = now + 20_000;
      return { state: "claimed", fence: state.fence };
    },
    async store(token, expiresAt, fence, now = Date.now()) {
      if (!Number.isInteger(fence) || fence !== state.fence || state.claimUntil <= now) return false;
      state.token = token;
      state.expiresAt = expiresAt;
      state.claimUntil = 0;
      return true;
    },
    async claimReplay(signature) {
      const key = signatureHash(signature);
      if (state.seen.has(key)) return false;
      state.seen.add(key);
      return true;
    },
  };
}

export function createSupabaseGatewayLease({ fetchImpl, env }) {
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  async function call(body) {
    if (!url || !key) return { available: false };
    const response = await fetchImpl(`${url}/rest/v1/rpc/sync_master_coach_gateway_lease`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.status === 404) return { available: false };
    if (!response.ok) return { available: false };
    const payload = await response.json();
    if (!payload || payload.ok === false) return { available: true, ok: false, payload };
    return { available: true, ok: true, payload };
  }
  return {
    available: true,
    async read(now) {
      const result = await call({ p_action: "read", p_now: new Date(now).toISOString() });
      if (!result.available) return undefined;
      return typeof result.payload?.token === "string" ? result.payload.token : null;
    },
    async claim(now) {
      const result = await call({ p_action: "claim", p_now: new Date(now).toISOString() });
      if (!result.available || result.ok === false) return { state: "unavailable" };
      const state = result.payload?.state;
      const fence = Number(result.payload?.fence);
      if (state === "ready" || state === "busy") return { state, fence: Number.isInteger(fence) ? fence : 0 };
      if (state === "claimed" && Number.isInteger(fence)) return { state: "claimed", fence };
      return { state: "unavailable" };
    },
    async store(token, expiresAt, fence, now = Date.now()) {
      if (!Number.isInteger(fence)) return false;
      const result = await call({
        p_action: "store",
        p_now: new Date(now).toISOString(),
        p_token: token,
        p_expires_at: new Date(expiresAt).toISOString(),
        p_fence: fence,
      });
      return result.available === true && result.ok === true && result.payload?.ok === true;
    },
    async claimReplay(signature) {
      const result = await call({ p_action: "replay", p_signature_hash: signatureHash(signature) });
      if (!result.available) return undefined;
      if (result.ok === false) return undefined;
      return result.payload?.accepted === true;
    },
  };
}
