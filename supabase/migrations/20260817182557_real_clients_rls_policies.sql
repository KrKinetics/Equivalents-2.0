drop policy if exists clients_select_org on public.clients;
create policy clients_select_org on public.clients
for select to authenticated
using (public.is_member_of(organization_id));

drop policy if exists clients_insert_org on public.clients;
create policy clients_insert_org on public.clients
for insert to authenticated
with check (public.is_member_of(organization_id) and created_by = auth.uid() and is_fictional = false);

drop policy if exists clients_update_org on public.clients;
create policy clients_update_org on public.clients
for update to authenticated
using (public.is_member_of(organization_id))
with check (public.is_member_of(organization_id) and is_fictional = false);

drop policy if exists clients_delete_org on public.clients;
create policy clients_delete_org on public.clients
for delete to authenticated
using (public.is_member_of(organization_id));

drop policy if exists client_dossiers_select_org on public.client_dossiers;
create policy client_dossiers_select_org on public.client_dossiers
for select to authenticated
using (
  public.is_member_of(client_dossiers.organization_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_dossiers.client_id
      and c.organization_id = client_dossiers.organization_id
      and c.service_type = any (array['nutrition'::text, 'complete'::text])
  )
);

drop policy if exists client_dossiers_insert_org on public.client_dossiers;
create policy client_dossiers_insert_org on public.client_dossiers
for insert to authenticated
with check (
  public.is_member_of(client_dossiers.organization_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_dossiers.client_id
      and c.organization_id = client_dossiers.organization_id
      and c.service_type = any (array['nutrition'::text, 'complete'::text])
  )
);

drop policy if exists client_dossiers_update_org on public.client_dossiers;
create policy client_dossiers_update_org on public.client_dossiers
for update to authenticated
using (
  public.is_member_of(client_dossiers.organization_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_dossiers.client_id
      and c.organization_id = client_dossiers.organization_id
      and c.service_type = any (array['nutrition'::text, 'complete'::text])
  )
)
with check (
  public.is_member_of(client_dossiers.organization_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_dossiers.client_id
      and c.organization_id = client_dossiers.organization_id
      and c.service_type = any (array['nutrition'::text, 'complete'::text])
  )
);
