import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.resolve(root, "../maitre-coach/package.json"));
const EmbeddedPostgres = require("embedded-postgres").default;
const { Client } = require("pg");

const ROLES = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.role() returns text
language sql stable
as $$ select current_setting('request.jwt.claim.role', true) $$;
`;

test("the gateway lease migration fences stores on an isolated database", async () => {
  const port = 55449;
  const databaseDir = mkdtempSync(path.join(tmpdir(), "kr-gateway-lease-"));
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const client = new Client({ host: "127.0.0.1", port, user: "postgres", password: "postgres", database: "postgres" });
  await client.connect();
  try {
    await client.query(ROLES);
    for (const file of [
      "20261012170000_master_coach_gateway_lease.sql",
      "20261012180000_master_coach_gateway_lease_fence.sql",
    ]) {
      await client.query(readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
    }
    await client.query("set role authenticated");
    await assert.rejects(
      () => client.query("select public.sync_master_coach_gateway_lease('read')"),
      /permission denied/i,
    );
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.role', 'service_role', false)");
    await client.query("set role service_role");
    const first = await client.query("select public.sync_master_coach_gateway_lease('claim', now()) as result");
    const claimed = first.rows[0].result;
    assert.equal(claimed.state, "claimed");
    assert.equal(typeof claimed.fence, "number");
    await client.query("reset role");
    await client.query("update public.master_coach_gateway_lease set claim_until = now() - interval '1 minute' where lease_id = 'kr-coach'");
    await client.query("set role service_role");
    const second = await client.query("select public.sync_master_coach_gateway_lease('claim', now()) as result");
    const next = second.rows[0].result;
    assert.equal(next.state, "claimed");
    assert.ok(next.fence > claimed.fence);
    const stale = await client.query(
      "select public.sync_master_coach_gateway_lease('store', now(), $1, now() + interval '30 minutes', null, $2) as result",
      ["local-token", claimed.fence],
    );
    assert.equal(stale.rows[0].result.code, "FENCE_LOST");
    const stored = await client.query(
      "select public.sync_master_coach_gateway_lease('store', now(), $1, now() + interval '30 minutes', null, $2) as result",
      ["shared-token", next.fence],
    );
    assert.equal(stored.rows[0].result.ok, true);
    const read = await client.query("select public.sync_master_coach_gateway_lease('read', now()) as result");
    assert.equal(read.rows[0].result.token, "shared-token");
    const signature = "ab".repeat(32);
    const replay = await client.query(
      "select public.sync_master_coach_gateway_lease('replay', now(), null, null, $1) as result",
      [signature],
    );
    const again = await client.query(
      "select public.sync_master_coach_gateway_lease('replay', now(), null, null, $1) as result",
      [signature],
    );
    assert.equal(replay.rows[0].result.accepted, true);
    assert.equal(again.rows[0].result.accepted, false);
    assert.equal(String(read.rows[0].result.token).includes("service_role"), false);
  } finally {
    await client.end();
    await pg.stop();
    rmSync(databaseDir, { recursive: true, force: true });
  }
});
