-- Coach fictional client dossiers (dev)
-- Supabase is the source of truth for authenticated workspace dossiers.
-- Does not migrate localStorage athlete_* profiles or real clients.

create table if not exists public.client_dossiers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  schema_version integer not null default 1,
  payload jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_dossiers_schema_version_positive check (schema_version >= 1),
  constraint client_dossiers_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists client_dossiers_organization_id_idx
  on public.client_dossiers (organization_id);
create index if not exists client_dossiers_updated_at_idx
  on public.client_dossiers (updated_at desc);

-- Keep tenant keys immutable after insert (blocks org / client moves).
create or replace function public.client_dossiers_prevent_tenant_move()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is distinct from old.client_id then
    raise exception 'client_dossiers.client_id is immutable';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'client_dossiers.organization_id is immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_dossiers_prevent_tenant_move on public.client_dossiers;
create trigger client_dossiers_prevent_tenant_move
  before update on public.client_dossiers
  for each row execute function public.client_dossiers_prevent_tenant_move();

alter table public.client_dossiers enable row level security;
alter table public.client_dossiers force row level security;

-- SELECT: active membership in the dossier organization
drop policy if exists client_dossiers_select_org on public.client_dossiers;
create policy client_dossiers_select_org
  on public.client_dossiers
  for select
  to authenticated
  using (public.is_member_of(organization_id));

-- INSERT: membership + payload org must match the fictional client's org
drop policy if exists client_dossiers_insert_org on public.client_dossiers;
create policy client_dossiers_insert_org
  on public.client_dossiers
  for insert
  to authenticated
  with check (
    public.is_member_of(organization_id)
    and exists (
      select 1
      from public.clients c
      where c.id = client_id
        and c.organization_id = organization_id
        and c.is_fictional = true
    )
  );

-- UPDATE: membership; tenant keys stay aligned with fictional client
drop policy if exists client_dossiers_update_org on public.client_dossiers;
create policy client_dossiers_update_org
  on public.client_dossiers
  for update
  to authenticated
  using (public.is_member_of(organization_id))
  with check (
    public.is_member_of(organization_id)
    and exists (
      select 1
      from public.clients c
      where c.id = client_id
        and c.organization_id = organization_id
        and c.is_fictional = true
    )
  );

-- DELETE: membership in org (cleanup / explicit delete only)
drop policy if exists client_dossiers_delete_org on public.client_dossiers;
create policy client_dossiers_delete_org
  on public.client_dossiers
  for delete
  to authenticated
  using (public.is_member_of(organization_id));

revoke all on public.client_dossiers from anon, authenticated;
grant select, insert, update, delete on public.client_dossiers to authenticated;
