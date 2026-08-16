-- Fix motivation trigger row-type safety.
--
-- The original shared trigger function referenced response-only fields such as
-- NEW.answers while also being attached to client_motivation_invites. Opening
-- an invite updates the invite row and could therefore fail with:
--   record "new" has no field "answers"
--
-- Keep each trigger function bound to a single table row type so PostgreSQL
-- never resolves fields that do not exist on the triggering relation.

create or replace function private.client_motivation_invites_touch_and_lock()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.client_id is distinct from old.client_id then
    raise exception 'client_id is immutable';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.client_motivation_responses_touch_and_lock()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.client_id is distinct from old.client_id then
    raise exception 'client_id is immutable';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  if new.invite_id is distinct from old.invite_id then
    raise exception 'invite_id is immutable';
  end if;
  if old.status = 'submitted'
     and (
       new.answers is distinct from old.answers
       or new.presented_question_codes is distinct from old.presented_question_codes
     ) then
    raise exception 'submitted motivation answers are immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.client_motivation_analysis_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'motivation analysis versions are immutable';
end;
$$;

revoke all on function private.client_motivation_invites_touch_and_lock() from public, anon, authenticated;
revoke all on function private.client_motivation_responses_touch_and_lock() from public, anon, authenticated;
revoke all on function private.client_motivation_analysis_immutable() from public, anon, authenticated;

drop trigger if exists client_motivation_invites_touch on public.client_motivation_invites;
create trigger client_motivation_invites_touch
  before update on public.client_motivation_invites
  for each row execute function private.client_motivation_invites_touch_and_lock();

drop trigger if exists client_motivation_responses_touch on public.client_motivation_responses;
create trigger client_motivation_responses_touch
  before update on public.client_motivation_responses
  for each row execute function private.client_motivation_responses_touch_and_lock();

drop trigger if exists client_motivation_analysis_immutable on public.client_motivation_analysis_versions;
create trigger client_motivation_analysis_immutable
  before update on public.client_motivation_analysis_versions
  for each row execute function private.client_motivation_analysis_immutable();

drop function if exists private.client_motivation_touch_and_lock_tenant();
