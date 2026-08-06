-- Repair intake touch trigger: invite rows have no invite_id column.
-- PostgreSQL types NEW/OLD to the firing table, so a direct new.invite_id
-- reference breaks updates on public.client_intake_invites.

create or replace function private.client_intake_touch_and_lock_tenant()
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
  if tg_table_name = 'client_intake_responses'
     and (to_jsonb(new)->>'invite_id') is distinct from (to_jsonb(old)->>'invite_id') then
    raise exception 'invite_id is immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
