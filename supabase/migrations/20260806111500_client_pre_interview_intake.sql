-- Client pre-interview intake for the unified Coach workspace.
-- Public clients use opaque one-time links; coaches remain scoped by organization.

alter table public.clients
  add column if not exists email text,
  add column if not exists phone text;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.client_intake_token_hash(p_token text)
returns text
language sql
immutable
strict
security invoker
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function private.client_intake_token_hash(text) from public, anon, authenticated;

create table if not exists public.client_intake_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique,
  questionnaire_version integer not null default 1,
  status text not null default 'pending',
  expires_at timestamptz not null,
  opened_at timestamptz,
  submitted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_intake_invites_version_positive check (questionnaire_version >= 1),
  constraint client_intake_invites_status_check
    check (status in ('pending', 'opened', 'submitted', 'revoked')),
  constraint client_intake_invites_expiry_after_creation check (expires_at > created_at)
);

create unique index if not exists client_intake_invites_one_active_per_client_idx
  on public.client_intake_invites (client_id)
  where status in ('pending', 'opened');
create index if not exists client_intake_invites_org_created_idx
  on public.client_intake_invites (organization_id, created_at desc);
create index if not exists client_intake_invites_client_created_idx
  on public.client_intake_invites (client_id, created_at desc);

create table if not exists public.client_intake_responses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique references public.client_intake_invites (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  schema_version integer not null default 1,
  status text not null default 'draft',
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_intake_responses_version_positive check (schema_version >= 1),
  constraint client_intake_responses_status_check check (status in ('draft', 'submitted')),
  constraint client_intake_responses_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint client_intake_responses_answers_size check (octet_length(answers::text) <= 65536)
);

create index if not exists client_intake_responses_org_updated_idx
  on public.client_intake_responses (organization_id, updated_at desc);
create index if not exists client_intake_responses_client_updated_idx
  on public.client_intake_responses (client_id, updated_at desc);

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
  -- NEW/OLD are typed to the firing table; never reference invite_id on invites rows.
  if tg_table_name = 'client_intake_responses'
     and (to_jsonb(new)->>'invite_id') is distinct from (to_jsonb(old)->>'invite_id') then
    raise exception 'invite_id is immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.client_intake_touch_and_lock_tenant() from public, anon, authenticated;

drop trigger if exists client_intake_invites_touch on public.client_intake_invites;
create trigger client_intake_invites_touch
  before update on public.client_intake_invites
  for each row execute function private.client_intake_touch_and_lock_tenant();

drop trigger if exists client_intake_responses_touch on public.client_intake_responses;
create trigger client_intake_responses_touch
  before update on public.client_intake_responses
  for each row execute function private.client_intake_touch_and_lock_tenant();

alter table public.client_intake_invites enable row level security;
alter table public.client_intake_invites force row level security;
alter table public.client_intake_responses enable row level security;
alter table public.client_intake_responses force row level security;

drop policy if exists client_intake_invites_select_org on public.client_intake_invites;
create policy client_intake_invites_select_org
  on public.client_intake_invites
  for select
  to authenticated
  using ((select public.is_member_of(client_intake_invites.organization_id)));

drop policy if exists client_intake_responses_select_org on public.client_intake_responses;
create policy client_intake_responses_select_org
  on public.client_intake_responses
  for select
  to authenticated
  using ((select public.is_member_of(client_intake_responses.organization_id)));

revoke all on public.client_intake_invites from anon, authenticated;
revoke all on public.client_intake_responses from anon, authenticated;
grant select on public.client_intake_invites to authenticated;
grant select on public.client_intake_responses to authenticated;

-- Repair ambiguous column references in the historical dossier policies.
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
    )
  );

drop policy if exists client_dossiers_update_org on public.client_dossiers;
create policy client_dossiers_update_org
  on public.client_dossiers
  for update
  to authenticated
  using ((select public.is_member_of(client_dossiers.organization_id)))
  with check (
    (select public.is_member_of(client_dossiers.organization_id))
    and exists (
      select 1
      from public.clients c
      where c.id = client_dossiers.client_id
        and c.organization_id = client_dossiers.organization_id
        and c.is_fictional = true
    )
  );

create or replace function public.create_client_intake_invite(
  p_client_id uuid,
  p_expires_in_days integer default 14
)
returns table (
  invite_id uuid,
  token text,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
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
    and c.is_fictional = true
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
$$;

create or replace function public.get_client_intake(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_invite public.client_intake_invites%rowtype;
  v_client_name text;
  v_org_slug text;
  v_org_name text;
  v_answers jsonb := '{}'::jsonb;
  v_response_status text := 'draft';
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 160 then
    raise exception 'Lien invalide';
  end if;

  -- PostgreSQL forbids mixing a %rowtype target with scalar targets in one INTO list.
  select i.*
    into v_invite
  from public.client_intake_invites i
  where i.token_hash = private.client_intake_token_hash(p_token)
  limit 1;

  if v_invite.id is null or v_invite.status = 'revoked' then
    raise exception 'Lien invalide ou remplacé';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'Ce lien est expiré';
  end if;

  select c.full_name,
         o.slug,
         o.name,
         coalesce(r.answers, '{}'::jsonb),
         coalesce(r.status, 'draft')
    into v_client_name, v_org_slug, v_org_name, v_answers, v_response_status
  from public.clients c
  join public.organizations o on o.id = v_invite.organization_id
  left join public.client_intake_responses r on r.invite_id = v_invite.id
  where c.id = v_invite.client_id
  limit 1;

  if v_invite.status = 'pending' then
    update public.client_intake_invites
    set status = 'opened', opened_at = coalesce(opened_at, now()), updated_at = now()
    where id = v_invite.id;
    v_invite.status := 'opened';
  end if;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'client_name', v_client_name,
    'organization_slug', v_org_slug,
    'organization_name', v_org_name,
    'questionnaire_version', v_invite.questionnaire_version,
    'invite_status', v_invite.status,
    'response_status', v_response_status,
    'expires_at', v_invite.expires_at,
    'submitted_at', v_invite.submitted_at,
    'answers', v_answers
  );
end;
$$;

create or replace function public.save_client_intake(p_token text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_invite public.client_intake_invites%rowtype;
  v_updated_at timestamptz;
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 160 then
    raise exception 'Lien invalide';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Réponses invalides';
  end if;
  if octet_length(p_answers::text) > 65536 then
    raise exception 'Réponses trop volumineuses';
  end if;

  select i.* into v_invite
  from public.client_intake_invites i
  where i.token_hash = private.client_intake_token_hash(p_token)
  for update;

  if v_invite.id is null or v_invite.status = 'revoked' then
    raise exception 'Lien invalide ou remplacé';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'Ce lien est expiré';
  end if;
  if v_invite.status = 'submitted' then
    raise exception 'Le formulaire a déjà été soumis';
  end if;

  insert into public.client_intake_responses (
    invite_id,
    client_id,
    organization_id,
    schema_version,
    status,
    answers
  ) values (
    v_invite.id,
    v_invite.client_id,
    v_invite.organization_id,
    v_invite.questionnaire_version,
    'draft',
    p_answers
  )
  on conflict (invite_id) do update
  set answers = excluded.answers,
      updated_at = now()
  returning updated_at into v_updated_at;

  update public.client_intake_invites
  set status = 'opened', opened_at = coalesce(opened_at, now()), updated_at = now()
  where id = v_invite.id;

  return jsonb_build_object('status', 'saved', 'updated_at', v_updated_at);
end;
$$;

create or replace function public.submit_client_intake(p_token text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_invite public.client_intake_invites%rowtype;
  v_submitted_at timestamptz := now();
  v_challenges jsonb;
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 160 then
    raise exception 'Lien invalide';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Réponses invalides';
  end if;
  if octet_length(p_answers::text) > 65536 then
    raise exception 'Réponses trop volumineuses';
  end if;

  v_challenges := p_answers->'challenges';
  if v_challenges is null
     or jsonb_typeof(v_challenges) <> 'array'
     or jsonb_array_length(v_challenges) < 1
     or jsonb_array_length(v_challenges) > 3 then
    raise exception 'Choisissez entre un et trois défis';
  end if;

  if nullif(btrim(p_answers->>'email'), '') is null
     or nullif(btrim(p_answers->>'objective_primary'), '') is null
     or nullif(btrim(p_answers->>'objective_detail'), '') is null
     or nullif(btrim(p_answers->>'activity_level'), '') is null
     or nullif(btrim(p_answers->>'work_type'), '') is null
     or nullif(btrim(p_answers->>'schedule'), '') is null
     or nullif(btrim(p_answers->>'medications_status'), '') is null
     or nullif(btrim(p_answers->>'allergies_status'), '') is null
     or nullif(btrim(p_answers->>'restriction_status'), '') is null
     or nullif(btrim(p_answers->>'interview_priority'), '') is null
     or p_answers->'consent' <> 'true'::jsonb then
    raise exception 'Certaines réponses obligatoires sont manquantes';
  end if;

  if lower(btrim(p_answers->>'email')) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse courriel invalide';
  end if;

  if (p_answers->>'medications_status' = 'Oui' and nullif(btrim(p_answers->>'medications_details'), '') is null)
     or (p_answers->>'allergies_status' = 'Oui' and nullif(btrim(p_answers->>'allergies_details'), '') is null)
     or (p_answers->>'restriction_status' = 'Oui' and nullif(btrim(p_answers->>'restriction_details'), '') is null) then
    raise exception 'Précisez les éléments de santé indiqués';
  end if;

  select i.* into v_invite
  from public.client_intake_invites i
  where i.token_hash = private.client_intake_token_hash(p_token)
  for update;

  if v_invite.id is null or v_invite.status = 'revoked' then
    raise exception 'Lien invalide ou remplacé';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'Ce lien est expiré';
  end if;
  if v_invite.status = 'submitted' then
    raise exception 'Le formulaire a déjà été soumis';
  end if;

  insert into public.client_intake_responses (
    invite_id,
    client_id,
    organization_id,
    schema_version,
    status,
    answers,
    submitted_at
  ) values (
    v_invite.id,
    v_invite.client_id,
    v_invite.organization_id,
    v_invite.questionnaire_version,
    'submitted',
    p_answers,
    v_submitted_at
  )
  on conflict (invite_id) do update
  set answers = excluded.answers,
      status = 'submitted',
      submitted_at = excluded.submitted_at,
      updated_at = now();

  update public.client_intake_invites
  set status = 'submitted',
      submitted_at = v_submitted_at,
      opened_at = coalesce(opened_at, v_submitted_at),
      updated_at = v_submitted_at
  where id = v_invite.id;

  update public.clients
  set email = lower(nullif(btrim(p_answers->>'email'), '')),
      phone = nullif(btrim(p_answers->>'phone'), ''),
      updated_at = v_submitted_at
  where id = v_invite.client_id
    and organization_id = v_invite.organization_id;

  return jsonb_build_object('status', 'submitted', 'submitted_at', v_submitted_at);
end;
$$;

revoke all on function public.create_client_intake_invite(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_client_intake(text) from public, anon, authenticated;
revoke all on function public.save_client_intake(text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_client_intake(text, jsonb) from public, anon, authenticated;

grant execute on function public.create_client_intake_invite(uuid, integer) to authenticated;
grant execute on function public.get_client_intake(text) to anon, authenticated;
grant execute on function public.save_client_intake(text, jsonb) to anon, authenticated;
grant execute on function public.submit_client_intake(text, jsonb) to anon, authenticated;

comment on function public.get_client_intake(text) is
  'Intentional token-gated public RPC for loading one pre-interview intake.';
comment on function public.save_client_intake(text, jsonb) is
  'Intentional token-gated public RPC for saving one pre-interview draft.';
comment on function public.submit_client_intake(text, jsonb) is
  'Intentional token-gated public RPC for submitting one pre-interview intake.';
