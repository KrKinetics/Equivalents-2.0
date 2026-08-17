-- KR Kinetics production hardening, 2026-08-17.
-- Product rule: every current and future dossier represents a real client.
-- Motivation persistence: prefer the server service-role secret when present,
-- but allow the authenticated Coach JWT as a fail-closed fallback. The RPC
-- independently verifies identity, membership, client/tenant ownership,
-- submitted snapshots, engine versions/hash and analysis provenance.

-- ---------------------------------------------------------------------------
-- Clients are real by definition.
-- ---------------------------------------------------------------------------

alter table public.clients
  drop constraint if exists clients_fictional_only;

alter table public.clients
  alter column is_fictional set default false;

update public.clients
set is_fictional = false
where is_fictional is distinct from false;

create or replace function public.force_real_client_flag()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.is_fictional := false;
  return new;
end;
$$;

drop trigger if exists trg_force_real_client_flag on public.clients;
create trigger trg_force_real_client_flag
before insert or update of is_fictional on public.clients
for each row execute function public.force_real_client_flag();

alter table public.clients
  drop constraint if exists clients_real_only;
alter table public.clients
  add constraint clients_real_only check (is_fictional = false) not valid;
alter table public.clients
  validate constraint clients_real_only;

-- ---------------------------------------------------------------------------
-- Trusted motivation persistence.
-- ---------------------------------------------------------------------------

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
  p_analysis_snapshot jsonb,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_response public.client_motivation_responses%rowtype;
  v_invite public.client_motivation_invites%rowtype;
  v_existing public.client_motivation_analysis_versions%rowtype;
  v_next_version integer;
  v_id uuid;
  v_role text := auth.role();
begin
  if v_role not in ('service_role', 'authenticated') then
    raise exception 'Server only';
  end if;

  if p_created_by is null then
    raise exception 'Coach identity required';
  end if;

  if v_role = 'authenticated' and auth.uid() is distinct from p_created_by then
    raise exception 'Coach identity mismatch';
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

  if p_analysis_snapshot->>'client_id' is distinct from p_client_id::text then
    raise exception 'Analysis client mismatch';
  end if;

  if p_analysis_snapshot->'provenance'->>'questionnaireVersion' is distinct from p_questionnaire_version
     or p_analysis_snapshot->'provenance'->>'rulesetVersion' is distinct from p_ruleset_version
     or p_analysis_snapshot->'provenance'->>'reportModelVersion' is distinct from p_report_model_version
     or p_analysis_snapshot->'provenance'->>'contentHash' is distinct from p_content_hash then
    raise exception 'Analysis provenance mismatch';
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

  select r.*
  into v_response
  from public.client_motivation_responses r
  where r.id = p_response_id
  for update;

  if v_response.id is null or v_response.status <> 'submitted' then
    raise exception 'Submitted response unavailable';
  end if;

  if v_response.client_id is distinct from p_client_id then
    raise exception 'Client mismatch';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.user_id = p_created_by
      and m.organization_id = v_response.organization_id
  ) then
    raise exception 'Client unavailable';
  end if;

  if v_response.answers is distinct from p_answers_snapshot
     or v_response.presented_question_codes is distinct from p_presented_question_codes then
    raise exception 'Snapshot does not match submitted response';
  end if;

  select i.*
  into v_invite
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

  select a.*
  into v_existing
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
    p_created_by
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'analysis_version', v_next_version,
    'idempotent', false,
    'created_at', now()
  );
end;
$function$;

revoke all on function public.persist_client_motivation_analysis(
  uuid, uuid, text, text, text, text, jsonb, text[], jsonb, jsonb, uuid
) from public, anon;

grant execute on function public.persist_client_motivation_analysis(
  uuid, uuid, text, text, text, text, jsonb, text[], jsonb, jsonb, uuid
) to authenticated, service_role;
