-- Official motivation assessment persistence (DEV).
-- Public clients use an opaque hashed token; coaches remain scoped by organization.
-- Code remains the source of truth for questionnaire-v4.1 / ruleset-v4.1 / report-model-v4.2.
--
-- Documented size limits:
--   answers / answers_snapshot: JSON array, octet_length <= 65536 (64 KiB)
--   presented_question_codes: cardinality <= 64 (v4.1 total max is 38; 64 leaves headroom)
--   each presented code: 2..64 chars, [A-Za-z0-9_]
--   definition_snapshot / analysis_snapshot: octet_length <= 1048576 (1 MiB)
-- Raw tokens are never stored. Analysis rows are insert-only.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.client_motivation_token_hash(p_token text)
returns text
language sql
immutable
strict
security invoker
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function private.client_motivation_token_hash(text) from public, anon, authenticated;

create or replace function private.client_motivation_codes_plausible(p_codes text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_codes is not null
    and cardinality(p_codes) <= 64
    and not exists (
      select 1
      from unnest(p_codes) as code
      where code is null
        or length(code) < 2
        or length(code) > 64
        or code !~ '^[A-Za-z0-9_]+$'
    );
$$;

revoke all on function private.client_motivation_codes_plausible(text[]) from public, anon, authenticated;

create table if not exists public.client_motivation_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique,
  questionnaire_version text not null,
  ruleset_version text not null,
  report_model_version text not null,
  content_hash text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  opened_at timestamptz,
  submitted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_motivation_invites_status_check
    check (status in ('pending', 'opened', 'submitted', 'revoked')),
  constraint client_motivation_invites_expiry_after_creation
    check (expires_at > created_at),
  constraint client_motivation_invites_versions_nonempty
    check (
      length(btrim(questionnaire_version)) > 0
      and length(btrim(ruleset_version)) > 0
      and length(btrim(report_model_version)) > 0
      and char_length(questionnaire_version) <= 64
      and char_length(ruleset_version) <= 64
      and char_length(report_model_version) <= 64
    ),
  constraint client_motivation_invites_content_hash_sha256
    check (content_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists client_motivation_invites_one_active_per_client_idx
  on public.client_motivation_invites (client_id)
  where status in ('pending', 'opened');
create index if not exists client_motivation_invites_org_created_idx
  on public.client_motivation_invites (organization_id, created_at desc);
create index if not exists client_motivation_invites_client_created_idx
  on public.client_motivation_invites (client_id, created_at desc);

create table if not exists public.client_motivation_responses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique references public.client_motivation_invites (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'draft',
  answers jsonb not null default '[]'::jsonb,
  presented_question_codes text[] not null default '{}'::text[],
  consent_given boolean not null default false,
  consent_at timestamptz,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_motivation_responses_status_check
    check (status in ('draft', 'submitted')),
  constraint client_motivation_responses_answers_array
    check (jsonb_typeof(answers) = 'array'),
  constraint client_motivation_responses_answers_size
    check (octet_length(answers::text) <= 65536),
  constraint client_motivation_responses_codes_count
    check (cardinality(presented_question_codes) <= 64),
  constraint client_motivation_responses_codes_plausible
    check (private.client_motivation_codes_plausible(presented_question_codes))
);

create index if not exists client_motivation_responses_org_updated_idx
  on public.client_motivation_responses (organization_id, updated_at desc);
create index if not exists client_motivation_responses_client_updated_idx
  on public.client_motivation_responses (client_id, updated_at desc);

create table if not exists public.client_motivation_analysis_versions (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.client_motivation_responses (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  analysis_version integer not null,
  questionnaire_version text not null,
  ruleset_version text not null,
  report_model_version text not null,
  content_hash text not null,
  definition_snapshot jsonb not null,
  presented_question_codes text[] not null,
  answers_snapshot jsonb not null,
  analysis_snapshot jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_motivation_analysis_version_positive
    check (analysis_version >= 1),
  constraint client_motivation_analysis_versions_unique
    unique (response_id, analysis_version),
  constraint client_motivation_analysis_versions_nonempty
    check (
      length(btrim(questionnaire_version)) > 0
      and length(btrim(ruleset_version)) > 0
      and length(btrim(report_model_version)) > 0
    ),
  constraint client_motivation_analysis_content_hash_sha256
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint client_motivation_analysis_answers_array
    check (jsonb_typeof(answers_snapshot) = 'array'),
  constraint client_motivation_analysis_answers_size
    check (octet_length(answers_snapshot::text) <= 65536),
  constraint client_motivation_analysis_definition_object
    check (jsonb_typeof(definition_snapshot) = 'object'),
  constraint client_motivation_analysis_definition_size
    check (octet_length(definition_snapshot::text) <= 1048576),
  constraint client_motivation_analysis_snapshot_object
    check (jsonb_typeof(analysis_snapshot) = 'object'),
  constraint client_motivation_analysis_snapshot_size
    check (octet_length(analysis_snapshot::text) <= 1048576),
  constraint client_motivation_analysis_codes_plausible
    check (private.client_motivation_codes_plausible(presented_question_codes))
);

create index if not exists client_motivation_analysis_org_created_idx
  on public.client_motivation_analysis_versions (organization_id, created_at desc);
create index if not exists client_motivation_analysis_response_idx
  on public.client_motivation_analysis_versions (response_id, analysis_version desc);

create or replace function private.client_motivation_touch_and_lock_tenant()
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
  if tg_table_name = 'client_motivation_responses'
     and (to_jsonb(new)->>'invite_id') is distinct from (to_jsonb(old)->>'invite_id') then
    raise exception 'invite_id is immutable';
  end if;
  if tg_table_name = 'client_motivation_responses'
     and old.status = 'submitted'
     and (
       new.answers is distinct from old.answers
       or new.presented_question_codes is distinct from old.presented_question_codes
     ) then
    raise exception 'submitted motivation answers are immutable';
  end if;
  if tg_table_name = 'client_motivation_analysis_versions' then
    raise exception 'motivation analysis versions are immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.client_motivation_touch_and_lock_tenant() from public, anon, authenticated;

drop trigger if exists client_motivation_invites_touch on public.client_motivation_invites;
create trigger client_motivation_invites_touch
  before update on public.client_motivation_invites
  for each row execute function private.client_motivation_touch_and_lock_tenant();

drop trigger if exists client_motivation_responses_touch on public.client_motivation_responses;
create trigger client_motivation_responses_touch
  before update on public.client_motivation_responses
  for each row execute function private.client_motivation_touch_and_lock_tenant();

drop trigger if exists client_motivation_analysis_immutable on public.client_motivation_analysis_versions;
create trigger client_motivation_analysis_immutable
  before update on public.client_motivation_analysis_versions
  for each row execute function private.client_motivation_touch_and_lock_tenant();

alter table public.client_motivation_invites enable row level security;
alter table public.client_motivation_invites force row level security;
alter table public.client_motivation_responses enable row level security;
alter table public.client_motivation_responses force row level security;
alter table public.client_motivation_analysis_versions enable row level security;
alter table public.client_motivation_analysis_versions force row level security;

drop policy if exists client_motivation_invites_select_org on public.client_motivation_invites;
create policy client_motivation_invites_select_org
  on public.client_motivation_invites
  for select
  to authenticated
  using ((select public.is_member_of(client_motivation_invites.organization_id)));

drop policy if exists client_motivation_responses_select_org on public.client_motivation_responses;
create policy client_motivation_responses_select_org
  on public.client_motivation_responses
  for select
  to authenticated
  using ((select public.is_member_of(client_motivation_responses.organization_id)));

drop policy if exists client_motivation_analysis_select_org on public.client_motivation_analysis_versions;
create policy client_motivation_analysis_select_org
  on public.client_motivation_analysis_versions
  for select
  to authenticated
  using ((select public.is_member_of(client_motivation_analysis_versions.organization_id)));

revoke all on public.client_motivation_invites from anon, authenticated;
revoke all on public.client_motivation_responses from anon, authenticated;
revoke all on public.client_motivation_analysis_versions from anon, authenticated;
grant select on public.client_motivation_invites to authenticated;
grant select on public.client_motivation_responses to authenticated;
grant select on public.client_motivation_analysis_versions to authenticated;

create or replace function public.create_client_motivation_invite(
  p_client_id uuid,
  p_questionnaire_version text,
  p_ruleset_version text,
  p_report_model_version text,
  p_content_hash text,
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
$$;

create or replace function public.get_client_motivation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_invite public.client_motivation_invites%rowtype;
  v_client_name text;
  v_org_name text;
  v_answers jsonb := '[]'::jsonb;
  v_codes text[] := '{}'::text[];
  v_response_status text := 'draft';
  v_consent_given boolean := false;
  v_consent_at timestamptz := null;
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 160 then
    raise exception 'Lien invalide';
  end if;

  select i.*
    into v_invite
  from public.client_motivation_invites i
  where i.token_hash = private.client_motivation_token_hash(p_token)
  limit 1;

  if v_invite.id is null or v_invite.status = 'revoked' then
    raise exception 'Lien invalide ou remplacé';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'Ce lien est expiré';
  end if;

  select c.full_name,
         o.name,
         coalesce(r.answers, '[]'::jsonb),
         coalesce(r.presented_question_codes, '{}'::text[]),
         coalesce(r.status, 'draft'),
         coalesce(r.consent_given, false),
         r.consent_at
    into v_client_name, v_org_name, v_answers, v_codes, v_response_status, v_consent_given, v_consent_at
  from public.clients c
  join public.organizations o on o.id = v_invite.organization_id
  left join public.client_motivation_responses r on r.invite_id = v_invite.id
  where c.id = v_invite.client_id
  limit 1;

  if v_invite.status = 'pending' then
    update public.client_motivation_invites
    set status = 'opened', opened_at = coalesce(opened_at, now()), updated_at = now()
    where id = v_invite.id;
    v_invite.status := 'opened';
  end if;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'client_name', v_client_name,
    'organization_name', v_org_name,
    'questionnaire_version', v_invite.questionnaire_version,
    'ruleset_version', v_invite.ruleset_version,
    'report_model_version', v_invite.report_model_version,
    'content_hash', v_invite.content_hash,
    'invite_status', v_invite.status,
    'response_status', v_response_status,
    'expires_at', v_invite.expires_at,
    'submitted_at', v_invite.submitted_at,
    'answers', v_answers,
    'presented_question_codes', to_jsonb(v_codes),
    'consent_given', v_consent_given,
    'consent_at', v_consent_at
  );
end;
$$;

create or replace function public.save_client_motivation(
  p_token text,
  p_answers jsonb,
  p_presented_question_codes text[],
  p_consent_given boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_invite public.client_motivation_invites%rowtype;
  v_updated_at timestamptz;
  v_consent boolean := coalesce(p_consent_given, false);
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 160 then
    raise exception 'Lien invalide';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Réponses invalides';
  end if;
  if octet_length(p_answers::text) > 65536 then
    raise exception 'Réponses trop volumineuses';
  end if;
  if not private.client_motivation_codes_plausible(p_presented_question_codes) then
    raise exception 'Codes de questions invalides';
  end if;

  select i.* into v_invite
  from public.client_motivation_invites i
  where i.token_hash = private.client_motivation_token_hash(p_token)
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

  insert into public.client_motivation_responses (
    invite_id,
    client_id,
    organization_id,
    status,
    answers,
    presented_question_codes,
    consent_given,
    consent_at
  ) values (
    v_invite.id,
    v_invite.client_id,
    v_invite.organization_id,
    'draft',
    p_answers,
    p_presented_question_codes,
    v_consent,
    case when v_consent then now() else null end
  )
  on conflict (invite_id) do update
  set answers = excluded.answers,
      presented_question_codes = excluded.presented_question_codes,
      consent_given = excluded.consent_given,
      consent_at = case
        when excluded.consent_given then coalesce(public.client_motivation_responses.consent_at, now())
        else public.client_motivation_responses.consent_at
      end,
      updated_at = now()
  where public.client_motivation_responses.status = 'draft'
  returning updated_at into v_updated_at;

  if v_updated_at is null then
    raise exception 'Le formulaire a déjà été soumis';
  end if;

  update public.client_motivation_invites
  set status = 'opened', opened_at = coalesce(opened_at, now()), updated_at = now()
  where id = v_invite.id;

  return jsonb_build_object('status', 'saved', 'updated_at', v_updated_at);
end;
$$;

create or replace function public.submit_client_motivation(
  p_token text,
  p_answers jsonb,
  p_presented_question_codes text[],
  p_consent_given boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_invite public.client_motivation_invites%rowtype;
  v_submitted_at timestamptz := now();
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 160 then
    raise exception 'Lien invalide';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) < 1 then
    raise exception 'Réponses invalides';
  end if;
  if octet_length(p_answers::text) > 65536 then
    raise exception 'Réponses trop volumineuses';
  end if;
  if p_presented_question_codes is null
     or cardinality(p_presented_question_codes) < 1
     or not private.client_motivation_codes_plausible(p_presented_question_codes) then
    raise exception 'Codes de questions invalides';
  end if;
  if p_consent_given is not true then
    raise exception 'Le consentement est requis';
  end if;

  select i.* into v_invite
  from public.client_motivation_invites i
  where i.token_hash = private.client_motivation_token_hash(p_token)
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

  insert into public.client_motivation_responses (
    invite_id,
    client_id,
    organization_id,
    status,
    answers,
    presented_question_codes,
    consent_given,
    consent_at,
    submitted_at
  ) values (
    v_invite.id,
    v_invite.client_id,
    v_invite.organization_id,
    'submitted',
    p_answers,
    p_presented_question_codes,
    true,
    v_submitted_at,
    v_submitted_at
  )
  on conflict (invite_id) do update
  set answers = excluded.answers,
      presented_question_codes = excluded.presented_question_codes,
      consent_given = true,
      consent_at = coalesce(public.client_motivation_responses.consent_at, excluded.consent_at),
      status = 'submitted',
      submitted_at = excluded.submitted_at,
      updated_at = now()
  where public.client_motivation_responses.status = 'draft';

  if not exists (
    select 1
    from public.client_motivation_responses r
    where r.invite_id = v_invite.id
      and r.status = 'submitted'
  ) then
    raise exception 'Le formulaire a déjà été soumis';
  end if;

  update public.client_motivation_invites
  set status = 'submitted',
      submitted_at = v_submitted_at,
      opened_at = coalesce(opened_at, v_submitted_at),
      updated_at = v_submitted_at
  where id = v_invite.id;

  return jsonb_build_object('status', 'submitted', 'submitted_at', v_submitted_at);
end;
$$;

create or replace function public.persist_client_motivation_analysis(
  p_response_id uuid,
  p_client_id uuid,
  p_questionnaire_version text,
  p_ruleset_version text,
  p_report_model_version text,
  p_content_hash text,
  p_definition_snapshot jsonb,
  p_presented_question_codes text[],
  p_answers_snapshot jsonb,
  p_analysis_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_response public.client_motivation_responses%rowtype;
  v_invite public.client_motivation_invites%rowtype;
  v_existing public.client_motivation_analysis_versions%rowtype;
  v_next_version integer;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Engine content hash required';
  end if;
  if p_definition_snapshot is null or jsonb_typeof(p_definition_snapshot) <> 'object' then
    raise exception 'Definition snapshot required';
  end if;
  if p_analysis_snapshot is null or jsonb_typeof(p_analysis_snapshot) <> 'object' then
    raise exception 'Analysis snapshot required';
  end if;
  if octet_length(p_definition_snapshot::text) > 1048576
     or octet_length(p_analysis_snapshot::text) > 1048576 then
    raise exception 'Analysis payload too large';
  end if;
  if p_answers_snapshot is null or jsonb_typeof(p_answers_snapshot) <> 'array' then
    raise exception 'Answers snapshot required';
  end if;
  if octet_length(p_answers_snapshot::text) > 65536 then
    raise exception 'Answers snapshot too large';
  end if;
  if not private.client_motivation_codes_plausible(p_presented_question_codes) then
    raise exception 'Presented question codes invalid';
  end if;

  select r.* into v_response
  from public.client_motivation_responses r
  where r.id = p_response_id
  for update;

  if v_response.id is null or v_response.status <> 'submitted' then
    raise exception 'Submitted response unavailable';
  end if;
  if v_response.client_id is distinct from p_client_id then
    raise exception 'Client mismatch';
  end if;
  if not public.is_member_of(v_response.organization_id) then
    raise exception 'Client unavailable';
  end if;
  if v_response.answers is distinct from p_answers_snapshot
     or v_response.presented_question_codes is distinct from p_presented_question_codes then
    raise exception 'Snapshot does not match submitted response';
  end if;

  select i.* into v_invite
  from public.client_motivation_invites i
  where i.id = v_response.invite_id;

  if v_invite.id is null or v_invite.status <> 'submitted' then
    raise exception 'Submitted invite unavailable';
  end if;
  if v_invite.client_id is distinct from v_response.client_id
     or v_invite.organization_id is distinct from v_response.organization_id then
    raise exception 'Tenant mismatch';
  end if;
  if v_invite.questionnaire_version is distinct from p_questionnaire_version
     or v_invite.ruleset_version is distinct from p_ruleset_version
     or v_invite.report_model_version is distinct from p_report_model_version
     or v_invite.content_hash is distinct from p_content_hash then
    raise exception 'Engine versions do not match invite';
  end if;

  select a.* into v_existing
  from public.client_motivation_analysis_versions a
  where a.response_id = v_response.id
    and a.questionnaire_version = p_questionnaire_version
    and a.ruleset_version = p_ruleset_version
    and a.report_model_version = p_report_model_version
    and a.content_hash = p_content_hash
  order by a.analysis_version
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id,
      'analysis_version', v_existing.analysis_version,
      'idempotent', true,
      'created_at', v_existing.created_at
    );
  end if;

  select coalesce(max(a.analysis_version), 0) + 1
    into v_next_version
  from public.client_motivation_analysis_versions a
  where a.response_id = v_response.id;

  insert into public.client_motivation_analysis_versions (
    response_id,
    client_id,
    organization_id,
    analysis_version,
    questionnaire_version,
    ruleset_version,
    report_model_version,
    content_hash,
    definition_snapshot,
    presented_question_codes,
    answers_snapshot,
    analysis_snapshot,
    created_by
  ) values (
    v_response.id,
    v_response.client_id,
    v_response.organization_id,
    v_next_version,
    p_questionnaire_version,
    p_ruleset_version,
    p_report_model_version,
    p_content_hash,
    p_definition_snapshot,
    p_presented_question_codes,
    p_answers_snapshot,
    p_analysis_snapshot,
    auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'analysis_version', v_next_version,
    'idempotent', false,
    'created_at', now()
  );
end;
$$;

revoke all on function public.create_client_motivation_invite(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_client_motivation(text) from public, anon, authenticated;
revoke all on function public.save_client_motivation(text, jsonb, text[], boolean) from public, anon, authenticated;
revoke all on function public.submit_client_motivation(text, jsonb, text[], boolean) from public, anon, authenticated;
revoke all on function public.persist_client_motivation_analysis(uuid, uuid, text, text, text, text, jsonb, text[], jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.create_client_motivation_invite(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.get_client_motivation(text) to anon, authenticated;
grant execute on function public.save_client_motivation(text, jsonb, text[], boolean) to anon, authenticated;
grant execute on function public.submit_client_motivation(text, jsonb, text[], boolean) to anon, authenticated;
grant execute on function public.persist_client_motivation_analysis(uuid, uuid, text, text, text, text, jsonb, text[], jsonb, jsonb) to authenticated;

comment on function public.get_client_motivation(text) is
  'Intentional token-gated public RPC for loading one motivation assessment.';
comment on function public.save_client_motivation(text, jsonb, text[], boolean) is
  'Intentional token-gated public RPC for saving one motivation draft. Persists only; does not run the engine.';
comment on function public.submit_client_motivation(text, jsonb, text[], boolean) is
  'Intentional token-gated public RPC for submitting one motivation assessment. Does not accept analysis.';
comment on function public.persist_client_motivation_analysis(uuid, uuid, text, text, text, text, jsonb, text[], jsonb, jsonb) is
  'Coach-authenticated insert of a server-computed motivation analysis version. Never overwrites.';
