import test from "node:test";
import assert from "node:assert/strict";
import { mintKrCoachAccessToken } from "../src/coach/server/internal/master-coach-gateway-store.mjs";
import { claimGatewayReplay } from "../src/coach/server/internal/master-coach-gateway.mjs";
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

test("a missing lease function keeps the instance cache", async () => {
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
  assert.equal(minted.stage, "ok");
  assert.equal(minted.sessionScope, "instance");
  assert.equal(links, 1);
});

test("a shared replay lease rejects the same signature on another instance", async () => {
  const lease = createMemoryGatewayLease();
  const signature = "a".repeat(64);
  const first = await claimGatewayReplay(signature, { lease });
  const second = await claimGatewayReplay(signature, { lease });
  assert.deepEqual(first, { accepted: true, scope: "shared" });
  assert.deepEqual(second, { accepted: false, scope: "shared" });
});
