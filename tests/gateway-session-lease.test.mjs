import test from "node:test";
import assert from "node:assert/strict";
import { mintKrCoachAccessToken } from "../src/coach/server/internal/master-coach-gateway-store.mjs";
import { acceptGatewayRequest, claimGatewayReplay, claimGatewaySignature, gatewaySignature } from "../src/coach/server/internal/master-coach-gateway.mjs";
import { createMemoryGatewayLease } from "../src/coach/server/internal/gateway-session-lease.mjs";

const ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  KR_COACH_USER_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function cache() {
  return { token: null, expiresAt: 0, inflight: null };
}

function jwt(exp) {
  const body = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${body}.sig`;
}

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("two instances share one magic link through the lease", async () => {
  let links = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) {
      links += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return json({ hashed_token: "hash-shared" });
    }
    return json({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600) });
  };
  const lease = createMemoryGatewayLease();
  const [left, right] = await Promise.all([
    mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: cache(), lease }),
    mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: cache(), lease }),
  ]);
  assert.equal(links, 1);
  assert.equal(left.token, right.token);
  assert.equal(left.sessionScope, "shared");
  assert.equal(right.sessionScope, "shared");
  assert.equal(JSON.stringify(left).includes("coach@example.com"), false);
});

test("separate instance caches do not share a magic link", async () => {
  let links = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) {
      links += 1;
      return json({ hashed_token: `hash-${links}` });
    }
    return json({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600) });
  };
  await Promise.all([
    mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: cache() }),
    mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: cache() }),
  ]);
  assert.equal(links, 2);
});

test("an unreachable shared lease fails closed and does not mint", async () => {
  let links = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("sync_master_coach_gateway_lease")) return json({}, 404);
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) {
      links += 1;
      return json({ hashed_token: "hash" });
    }
    return json({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600) });
  };
  const minted = await mintKrCoachAccessToken({
    fetchImpl,
    env: { ...ENV, MASTER_COACH_GATEWAY_LEASE: "supabase" },
    cache: cache(),
  });
  assert.equal(minted.stage, "lease");
  assert.equal(minted.token, null);
  assert.equal(minted.sessionScope, "unavailable");
  assert.equal(links, 0);
});

test("a stale fence cannot replace the published session", async () => {
  const now = 1_700_000_000_000;
  const lease = createMemoryGatewayLease();
  const first = await lease.claim(now);
  const second = await lease.claim(now + 21_000);
  assert.equal(first.state, "claimed");
  assert.equal(second.state, "claimed");
  assert.notEqual(first.fence, second.fence);
  const stale = await lease.store("local-token", now + 3_600_000, first.fence, now + 21_000);
  const current = await lease.store("shared-token", now + 3_600_000, second.fence, now + 21_000);
  assert.equal(stale, false);
  assert.equal(current, true);
  assert.equal(await lease.read(now + 21_000), "shared-token");
});

test("a lost fence returns the shared token instead of the local one", async () => {
  let links = 0;
  let reads = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) {
      links += 1;
      return json({ hashed_token: "hash-local" });
    }
    return json({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600) });
  };
  const lease = {
    async read() {
      reads += 1;
      return reads === 1 ? null : "winner-token";
    },
    async claim() {
      return { state: "claimed", fence: 4 };
    },
    async store(_token, _expiresAt, fence) {
      assert.equal(fence, 4);
      return false;
    },
  };
  const minted = await mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: cache(), lease });
  assert.equal(links, 1);
  assert.equal(minted.token, "winner-token");
  assert.equal(minted.sessionScope, "shared");
});

test("a bad signature does not consume the replay nonce", async () => {
  const secret = "gateway-secret";
  const timestamp = String(Date.now());
  const payload = "{\"op\":\"client.get\"}";
  const signature = gatewaySignature(secret, timestamp, payload);
  const lease = createMemoryGatewayLease();
  let consumed = 0;
  const counting = {
    async read(now) { return lease.read(now); },
    async claim(now) { return lease.claim(now); },
    async store(token, expiresAt, fence, now) { return lease.store(token, expiresAt, fence, now); },
    async claimReplay(value) {
      consumed += 1;
      return lease.claimReplay(value);
    },
  };
  const rejected = await acceptGatewayRequest({
    secret,
    timestamp,
    signature: "ab".repeat(32),
    payload,
    lease: counting,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 401);
  assert.equal(consumed, 0);
  const accepted = await acceptGatewayRequest({ secret, timestamp, signature, payload, lease: counting });
  assert.equal(accepted.ok, true);
  assert.equal(consumed, 1);
  const replayed = await acceptGatewayRequest({ secret, timestamp, signature, payload, lease: counting });
  assert.equal(replayed.ok, false);
  assert.equal(replayed.status, 401);
});

test("an unreachable replay lease does not fall back to the local map", async () => {
  const signature = "c".repeat(64);
  const blocked = await claimGatewayReplay(signature, {
    env: { ...ENV, MASTER_COACH_GATEWAY_LEASE: "supabase" },
    fetchImpl: async () => json({}, 503),
  });
  assert.deepEqual(blocked, { accepted: false, scope: "unavailable" });
  assert.equal(claimGatewaySignature(signature), true);
});

test("a shared replay lease rejects the same signature on another instance", async () => {
  const lease = createMemoryGatewayLease();
  const signature = "a".repeat(64);
  const first = await claimGatewayReplay(signature, { lease });
  const second = await claimGatewayReplay(signature, { lease });
  assert.deepEqual(first, { accepted: true, scope: "shared" });
  assert.deepEqual(second, { accepted: false, scope: "shared" });
});
