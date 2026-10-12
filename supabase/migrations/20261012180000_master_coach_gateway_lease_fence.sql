-- Fencing token for the Master Coach gateway lease.
-- A store succeeds only for the instance that still holds the current claim.
-- Not applied to Production by this sprint.

alter table public.master_coach_gateway_lease
  add column if not exists fence bigint not null default 0;

drop function if exists public.sync_master_coach_gateway_lease(text, timestamptz, text, timestamptz, text);

create or replace function public.sync_master_coach_gateway_lease(
  p_action text,
  p_now timestamptz default now(),
  p_token text default null,
  p_expires_at timestamptz default null,
  p_signature_hash text default null,
  p_fence bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $lease$
declare
  v_row public.master_coach_gateway_lease%rowtype;
  v_fence bigint;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_action = 'read' then
    select * into v_row from public.master_coach_gateway_lease where lease_id = 'kr-coach';
    if v_row.access_token is not null and v_row.expires_at > p_now + interval '30 seconds' then
      return jsonb_build_object('ok', true, 'token', v_row.access_token, 'fence', v_row.fence);
    end if;
    return jsonb_build_object('ok', true, 'token', null);
  end if;
  if p_action = 'claim' then
    insert into public.master_coach_gateway_lease (lease_id) values ('kr-coach')
    on conflict (lease_id) do nothing;
    select * into v_row from public.master_coach_gateway_lease where lease_id = 'kr-coach' for update;
    if v_row.access_token is not null and v_row.expires_at > p_now + interval '30 seconds' then
      return jsonb_build_object('ok', true, 'state', 'ready', 'fence', v_row.fence);
    end if;
    if v_row.claim_until is not null and v_row.claim_until > p_now then
      return jsonb_build_object('ok', true, 'state', 'busy', 'fence', v_row.fence);
    end if;
    update public.master_coach_gateway_lease
       set fence = fence + 1,
           claim_until = p_now + interval '20 seconds',
           updated_at = p_now
     where lease_id = 'kr-coach'
    returning fence into v_fence;
    return jsonb_build_object('ok', true, 'state', 'claimed', 'fence', v_fence);
  end if;
  if p_action = 'store' then
    if p_token is null or p_expires_at is null or p_fence is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
    end if;
    update public.master_coach_gateway_lease
       set access_token = p_token,
           expires_at = p_expires_at,
           claim_until = null,
           updated_at = p_now
     where lease_id = 'kr-coach'
       and fence = p_fence
       and claim_until is not null
       and claim_until > p_now;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'FENCE_LOST');
    end if;
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

revoke all on function public.sync_master_coach_gateway_lease(text, timestamptz, text, timestamptz, text, bigint) from public, anon, authenticated;
grant execute on function public.sync_master_coach_gateway_lease(text, timestamptz, text, timestamptz, text, bigint) to service_role;
