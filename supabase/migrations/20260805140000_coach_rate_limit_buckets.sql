-- Bloc 3 — distributed rate-limit buckets (NOT applied to Production until explicit approval).
-- Rollback: see 20260805140000_coach_rate_limit_buckets_rollback.sql
-- Retention: rows older than 24h are safe to delete (cleanup job optional).

create table if not exists public.coach_rate_buckets (
  bucket_key text primary key,
  window_start timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.coach_rate_buckets is
  'Ephemeral API rate-limit counters. No PII. Keys are hashed identities + endpoint.';

alter table public.coach_rate_buckets enable row level security;
alter table public.coach_rate_buckets force row level security;

-- No direct table access for anon/authenticated — only SECURITY DEFINER RPC.
revoke all on table public.coach_rate_buckets from anon, authenticated;
grant all on table public.coach_rate_buckets to service_role;

create or replace function public.coach_consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => greatest(1, coalesce(p_window_seconds, 60)));
  v_key text := left(coalesce(p_bucket, ''), 180);
  v_limit integer := greatest(1, coalesce(p_limit, 60));
  v_row public.coach_rate_buckets%rowtype;
  v_retry integer;
begin
  if v_key is null or length(v_key) < 3 then
    return jsonb_build_object('allowed', false, 'retry_after_sec', 60);
  end if;

  select * into v_row from public.coach_rate_buckets where bucket_key = v_key for update;
  if not found then
    insert into public.coach_rate_buckets(bucket_key, window_start, hit_count, updated_at)
    values (v_key, v_now, 1, v_now);
    return jsonb_build_object('allowed', true, 'ok', true, 'hit_count', 1);
  end if;

  if v_row.window_start + v_window <= v_now then
    update public.coach_rate_buckets
      set window_start = v_now, hit_count = 1, updated_at = v_now
      where bucket_key = v_key;
    return jsonb_build_object('allowed', true, 'ok', true, 'hit_count', 1);
  end if;

  if v_row.hit_count >= v_limit then
    v_retry := greatest(1, ceil(extract(epoch from (v_row.window_start + v_window - v_now))));
    return jsonb_build_object('allowed', false, 'ok', false, 'retry_after_sec', v_retry);
  end if;

  update public.coach_rate_buckets
    set hit_count = hit_count + 1, updated_at = v_now
    where bucket_key = v_key;
  return jsonb_build_object('allowed', true, 'ok', true, 'hit_count', v_row.hit_count + 1);
end;
$$;

revoke all on function public.coach_consume_rate_limit(text, integer, integer) from public;
grant execute on function public.coach_consume_rate_limit(text, integer, integer) to anon, authenticated;

-- Optional cleanup helper (call from cron / manual ops; not auto-scheduled here).
create or replace function public.coach_cleanup_rate_buckets(p_older_than interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.coach_rate_buckets
    where updated_at < clock_timestamp() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.coach_cleanup_rate_buckets(interval) from public;
grant execute on function public.coach_cleanup_rate_buckets(interval) to service_role;
