-- Shared lease for the Master Coach gateway session and replay nonces.
-- Service role only. No anon or authenticated access.
-- Not applied to Production by this sprint.

create table if not exists public.master_coach_gateway_lease (
  lease_id text primary key,
  access_token text,
  expires_at timestamptz,
  claim_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.master_coach_gateway_replays (
  signature_hash text primary key,
  seen_at timestamptz not null default now()
);

alter table public.master_coach_gateway_lease enable row level security;
alter table public.master_coach_gateway_replays enable row level security;
revoke all on public.master_coach_gateway_lease from public, anon, authenticated, service_role;
revoke all on public.master_coach_gateway_replays from public, anon, authenticated, service_role;

create or replace function public.sync_master_coach_gateway_lease(
  p_action text,
  p_now timestamptz default now(),
  p_token text default null,
  p_expires_at timestamptz default null,
  p_signature_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $lease$
declare
  v_row public.master_coach_gateway_lease%rowtype;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_action = 'read' then
    select * into v_row from public.master_coach_gateway_lease where lease_id = 'kr-coach';
    if v_row.access_token is not null and v_row.expires_at > p_now + interval '30 seconds' then
      return jsonb_build_object('ok', true, 'token', v_row.access_token);
    end if;
    return jsonb_build_object('ok', true, 'token', null);
  end if;
  if p_action = 'claim' then
    insert into public.master_coach_gateway_lease (lease_id) values ('kr-coach')
    on conflict (lease_id) do nothing;
    select * into v_row from public.master_coach_gateway_lease where lease_id = 'kr-coach' for update;
    if v_row.access_token is not null and v_row.expires_at > p_now + interval '30 seconds' then
      return jsonb_build_object('ok', true, 'state', 'ready', 'token', v_row.access_token);
    end if;
    if v_row.claim_until is not null and v_row.claim_until > p_now then
      return jsonb_build_object('ok', true, 'state', 'busy');
    end if;
    update public.master_coach_gateway_lease
       set claim_until = p_now + interval '20 seconds', updated_at = p_now
     where lease_id = 'kr-coach';
    return jsonb_build_object('ok', true, 'state', 'claimed');
  end if;
  if p_action = 'store' then
    if p_token is null or p_expires_at is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
    end if;
    insert into public.master_coach_gateway_lease (lease_id, access_token, expires_at, claim_until, updated_at)
    values ('kr-coach', p_token, p_expires_at, null, p_now)
    on conflict (lease_id) do update
      set access_token = excluded.access_token,
          expires_at = excluded.expires_at,
          claim_until = null,
          updated_at = excluded.updated_at;
    return jsonb_build_object('ok', true);
  end if;
  if p_action = 'replay' then
    if p_signature_hash is null or length(p_signature_hash) <> 64 then
      return jsonb_build_object('ok', false, 'accepted', false);
    end if;
    delete from public.master_coach_gateway_replays where seen_at < p_now - interval '2 minutes';
    begin
      insert into public.master_coach_gateway_replays (signature_hash, seen_at) values (p_signature_hash, p_now);
    exception when unique_violation then
      return jsonb_build_object('ok', true, 'accepted', false);
    end;
    return jsonb_build_object('ok', true, 'accepted', true);
  end if;
  return jsonb_build_object('ok', false, 'code', 'UNKNOWN_ACTION');
end;
$lease$;

revoke all on function public.sync_master_coach_gateway_lease(text, timestamptz, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.sync_master_coach_gateway_lease(text, timestamptz, text, timestamptz, text) to service_role;
