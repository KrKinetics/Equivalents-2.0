-- Remove the legacy fiction-only assumption from RLS and invite creation.
-- All dossiers are real clients; tenant membership and service entitlements remain enforced.

drop policy if exists clients_select_org on public.clients;
create policy clients_select_org on public.clients
for select to authenticated
using (public.is_member_of(organization_id));

drop policy if exists clients_insert_org on public.clients;
create policy clients_insert_org on public.clients
for insert to authenticated
with check (
  public.is_member_of(organization_id)
  and created_by = auth.uid()
  and is_fictional = false
);

drop policy if exists clients_update_org on public.clients;
create policy clients_update_org on public.clients
for update to authenticated
using (public.is_member_of(organization_id))
with check (
  public.is_member_of(organization_id)
  and is_fictional = false
);

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

create or replace function public.create_client_intake_invite(
  p_client_id uuid,
  p_expires_in_days integer default 14
)
returns table(invite_id uuid, token text, expires_at timestamp with time zone, status text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_org_id uuid;
  v_token text;
  v_invite_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_expires_in_days < 1 or p_expires_in_days > 30 then
    raise exception 'Expiry must be between 1 and 30 days';
  end if;

  select c.organization_id
    into v_org_id
  from public.clients c
  where c.id = p_client_id
    and exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.organization_id = c.organization_id
    );

  if v_org_id is null then
    raise exception 'Client unavailable';
  end if;

  update public.client_intake_invites i
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where i.client_id = p_client_id
    and i.status in ('pending', 'opened');

  v_token := translate(
    rtrim(pg_catalog.encode(extensions.gen_random_bytes(24), 'base64'), '='),
    '+/',
    '-_'
  );
  v_expires_at := now() + pg_catalog.make_interval(days => p_expires_in_days);

  insert into public.client_intake_invites (
    client_id,
    organization_id,
    token_hash,
    expires_at,
    created_by
  ) values (
    p_client_id,
    v_org_id,
    private.client_intake_token_hash(v_token),
    v_expires_at,
    auth.uid()
  )
  returning id into v_invite_id;

  return query
  select v_invite_id, v_token, v_expires_at, 'pending'::text;
end;
$function$;

create or replace function public.create_client_motivation_invite(
  p_client_id uuid,
  p_questionnaire_version text,
  p_ruleset_version text,
  p_report_model_version text,
  p_content_hash text,
  p_expires_in_days integer default 14
)
returns table(invite_id uuid, token text, expires_at timestamp with time zone, status text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_org_id uuid;
  v_token text;
  v_invite_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_expires_in_days < 1 or p_expires_in_days > 30 then
    raise exception 'Expiry must be between 1 and 30 days';
  end if;
  if p_questionnaire_version is null or length(btrim(p_questionnaire_version)) = 0
     or p_ruleset_version is null or length(btrim(p_ruleset_version)) = 0
     or p_report_model_version is null or length(btrim(p_report_model_version)) = 0
     or char_length(p_questionnaire_version) > 64
     or char_length(p_ruleset_version) > 64
     or char_length(p_report_model_version) > 64 then
    raise exception 'Engine versions required';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Engine content hash required';
  end if;

  select c.organization_id
    into v_org_id
  from public.clients c
  where c.id = p_client_id
    and exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.organization_id = c.organization_id
    );

  if v_org_id is null then
    raise exception 'Client unavailable';
  end if;

  update public.client_motivation_invites i
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where i.client_id = p_client_id
    and i.status in ('pending', 'opened');

  v_token := translate(
    rtrim(pg_catalog.encode(extensions.gen_random_bytes(24), 'base64'), '='),
    '+/',
    '-_'
  );
  v_expires_at := now() + pg_catalog.make_interval(days => p_expires_in_days);

  insert into public.client_motivation_invites (
    client_id,
    organization_id,
    token_hash,
    questionnaire_version,
    ruleset_version,
    report_model_version,
    content_hash,
    expires_at,
    created_by
  ) values (
    p_client_id,
    v_org_id,
    private.client_motivation_token_hash(v_token),
    btrim(p_questionnaire_version),
    btrim(p_ruleset_version),
    btrim(p_report_model_version),
    p_content_hash,
    v_expires_at,
    auth.uid()
  )
  returning id into v_invite_id;

  return query
  select v_invite_id, v_token, v_expires_at, 'pending'::text;
end;
$function$;
