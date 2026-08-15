-- STAGE A — production-safe compatibility migration.
-- Canonical client service entitlements for the Coach portal.
-- Additive only. Legacy rows are backfilled to nutrition.
--
-- TEMPORARY DEFAULT 'nutrition' protects the currently deployed portal during
-- the DB/app cutover. New application code must still send service_type
-- explicitly and must never rely on this default.
--
-- STAGE B (DROP DEFAULT) is NOT in supabase/migrations/ so db push cannot
-- apply it before the new portal is live. See:
--   supabase/followups/20260814200000_client_service_type_drop_default.sql

alter table public.clients
  add column if not exists service_type text;

update public.clients
set service_type = 'nutrition'
where service_type is null;

alter table public.clients
  drop constraint if exists clients_service_type_check;

alter table public.clients
  add constraint clients_service_type_check
  check (service_type in ('nutrition', 'programming', 'complete'));

alter table public.clients
  alter column service_type set not null;

-- Temporary compatibility default for the currently deployed insert path.
alter table public.clients
  alter column service_type set default 'nutrition';

-- REPLACE (drop then recreate same names) — never add a second permissive policy.
-- PostgreSQL permissive policies OR together; leaving the old org-only SELECT
-- beside a new entitlement policy would not restrict nutrition access.
-- DELETE stays organization-scoped so programming clients can still be removed
-- and client_dossiers ON DELETE CASCADE is not blocked by entitlement RLS.
-- Policies query public.clients (no client_dossiers self-join) to avoid recursion.

drop policy if exists client_dossiers_select_org on public.client_dossiers;
create policy client_dossiers_select_org
  on public.client_dossiers
  for select
  to authenticated
  using (
    (select public.is_member_of(client_dossiers.organization_id))
    and exists (
      select 1
      from public.clients c
      where c.id = client_dossiers.client_id
        and c.organization_id = client_dossiers.organization_id
        and c.is_fictional = true
        and c.service_type in ('nutrition', 'complete')
    )
  );

drop policy if exists client_dossiers_insert_org on public.client_dossiers;
create policy client_dossiers_insert_org
  on public.client_dossiers
  for insert
  to authenticated
  with check (
    (select public.is_member_of(client_dossiers.organization_id))
    and exists (
      select 1
      from public.clients c
      where c.id = client_dossiers.client_id
        and c.organization_id = client_dossiers.organization_id
        and c.is_fictional = true
        and c.service_type in ('nutrition', 'complete')
    )
  );

drop policy if exists client_dossiers_update_org on public.client_dossiers;
create policy client_dossiers_update_org
  on public.client_dossiers
  for update
  to authenticated
  using (
    (select public.is_member_of(client_dossiers.organization_id))
    and exists (
      select 1
      from public.clients c
      where c.id = client_dossiers.client_id
        and c.organization_id = client_dossiers.organization_id
        and c.is_fictional = true
        and c.service_type in ('nutrition', 'complete')
    )
  )
  with check (
    (select public.is_member_of(client_dossiers.organization_id))
    and exists (
      select 1
      from public.clients c
      where c.id = client_dossiers.client_id
        and c.organization_id = client_dossiers.organization_id
        and c.is_fictional = true
        and c.service_type in ('nutrition', 'complete')
    )
  );
