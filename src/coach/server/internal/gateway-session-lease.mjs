/**
 * Shared coach-session lease. One magic link at a time across instances.
 * The in-memory cache remains only when this lease is unavailable.
 * That fallback is not a distributed guarantee.
 */

import { createHash } from "node:crypto";

export function signatureHash(signature) {
  return createHash("sha256").update(String(signature)).digest("hex");
}

export function createMemoryGatewayLease() {
  const state = { token: null, expiresAt: 0, claimUntil: 0, seen: new Set() };
  return {
    available: true,
    async read(now) {
      if (state.token && state.expiresAt > now + 30_000) return state.token;
      return null;
    },
    async claim(now) {
      if (state.token && state.expiresAt > now + 30_000) return "ready";
      if (state.claimUntil > now) return "busy";
      state.claimUntil = now + 20_000;
      return "claimed";
    },
    async store(token, expiresAt) {
      state.token = token;
      state.expiresAt = expiresAt;
      state.claimUntil = 0;
      return true;
    },
    async claimReplay(signature, now) {
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
    if (!response.ok) return { available: true, ok: false };
    const payload = await response.json();
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
      if (!result.available) return "unavailable";
      if (result.payload?.state === "ready" || result.payload?.state === "busy" || result.payload?.state === "claimed") {
        return result.payload.state;
      }
      return "unavailable";
    },
    async store(token, expiresAt) {
      const result = await call({
        p_action: "store",
        p_token: token,
        p_expires_at: new Date(expiresAt).toISOString(),
      });
      return result.available === true && result.ok === true;
    },
    async claimReplay(signature) {
      const result = await call({ p_action: "replay", p_signature_hash: signatureHash(signature) });
      if (!result.available) return undefined;
      return result.payload?.accepted === true;
    },
  };
}
