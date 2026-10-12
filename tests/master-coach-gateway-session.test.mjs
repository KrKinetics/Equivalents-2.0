import test from "node:test";
import assert from "node:assert/strict";
import { mintKrCoachAccessToken } from "../src/coach/server/internal/master-coach-gateway-store.mjs";
import { claimGatewaySignature } from "../src/coach/server/internal/master-coach-gateway.mjs";
import { projectStructuredIntake } from "../src/coach/intake/structured-intake.mjs";

const ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  KR_COACH_USER_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const RESPONSE = "11111111-1111-4111-8111-111111111111";

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

test("concurrent mints share one magic link", async () => {
  let links = 0;
  let verifies = 0;
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchImpl = async (url) => {
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) {
      links += 1;
      await gate;
      return json({ hashed_token: "hash-1" });
    }
    verifies += 1;
    return json({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600) });
  };
  const shared = cache();
  const first = mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: shared });
  const second = mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: shared });
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(links, 1);
  assert.equal(verifies, 1);
  assert.equal(left.token, right.token);
  assert.equal(left.stage, "ok");
});

test("a failed verify is retried once and a repeated failure stays at verify", async () => {
  let verifies = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) return json({ hashed_token: `hash-${verifies + 1}` });
    verifies += 1;
    if (verifies === 1) return json({ message: "otp expired" }, 422);
    return json({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600) });
  };
  const recovered = await mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: cache() });
  assert.equal(recovered.stage, "ok");
  assert.equal(verifies, 2);
  assert.equal(recovered.upstreamStatus, undefined);

  verifies = 0;
  const failing = async (url) => {
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) return json({ hashed_token: "hash" });
    verifies += 1;
    return json({ message: "otp expired", email: "coach@example.com" }, 422);
  };
  const failed = await mintKrCoachAccessToken({ fetchImpl: failing, env: ENV, cache: cache() });
  assert.equal(failed.stage, "verify");
  assert.equal(failed.upstreamStatus, 422);
  assert.equal(failed.token, null);
  assert.equal(JSON.stringify(failed).includes("coach@example.com"), false);
});

test("an expired session is minted again and a bad coach id never calls the network", async () => {
  let links = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/admin/users/")) return json({ email: "coach@example.com" });
    if (String(url).includes("/generate_link")) {
      links += 1;
      return json({ hashed_token: "hash" });
    }
    return json({ access_token: jwt(Math.floor(Date.now() / 1000) + 10) });
  };
  const shared = cache();
  await mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: shared });
  await mintKrCoachAccessToken({ fetchImpl, env: ENV, cache: shared });
  assert.equal(links, 2);
  let called = 0;
  const missing = await mintKrCoachAccessToken({
    fetchImpl: async () => { called += 1; return json({}); },
    env: { ...ENV, KR_COACH_USER_ID: "not-a-user" },
    cache: cache(),
  });
  assert.equal(missing.stage, "config");
  assert.equal(called, 0);
});

test("a signature cannot be replayed inside the window", () => {
  const signature = "a".repeat(64);
  assert.equal(claimGatewaySignature(signature, 1_000), true);
  assert.equal(claimGatewaySignature(signature, 1_000), false);
  assert.equal(claimGatewaySignature("b".repeat(64), 1_000), true);
});

test("structured intake keeps the real fields and drops contact and medical text", () => {
  const secret = "secret-medication-note";
  const projected = projectStructuredIntake({
    id: RESPONSE,
    client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "submitted",
    submitted_at: "2026-10-11T12:00:00.000Z",
    answers: {
      email: "athlete@example.com",
      phone: "5145550000",
      objective_primary: "Améliorer mes performances",
      objective_detail: "Préparer une compétition",
      activity_level: "Très actif",
      work_type: "Variable",
      schedule: "Quarts de soir ou de nuit",
      challenges: ["Manque de temps", "not-a-choice", "Contexte familial ou social"],
      foods_avoid: "Coriandre",
      deadline: "Course en novembre",
      medications_details: secret,
      other_info: "note libre",
      consent: "true",
    },
  }, {
    clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.equal(projected.version, 1);
  assert.equal(projected.answers.schedule, "Quarts de soir ou de nuit");
  assert.deepEqual(projected.answers.challenges, ["Manque de temps", "Contexte familial ou social"]);
  assert.equal(projected.answers.foodsAvoid, "Coriandre");
  assert.equal(JSON.stringify(projected).includes(secret), false);
  assert.equal(JSON.stringify(projected).includes("athlete@example.com"), false);
  const otherOrg = projectStructuredIntake({
    id: RESPONSE,
    client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    status: "submitted",
    submitted_at: "2026-10-11T12:00:00.000Z",
    answers: { schedule: "Régulier" },
  }, {
    clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.equal(otherOrg, null);
  const missing = projectStructuredIntake(null);
  assert.equal(missing, null);
});
