-- Coach Auth + Organizations (dev)
-- Invitation-only auth; strict org isolation via RLS.
-- Does not migrate localStorage athlete_* clients.

create extension if not exists pgcrypto;

-- Roles allowed for memberships
do $$ begin
  create type public.coach_role as enum ('platform_owner', 'coach');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.coach_role not null default 'coach',
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  full_name text not null,
  notes text not null default '',
  is_fictional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_fictional_only check (is_fictional = true),
  constraint clients_name_not_blank check (length(trim(full_name)) > 0)
);

create index if not exists memberships_user_id_idx on public.memberships (user_id);
create index if not exists memberships_organization_id_idx on public.memberships (organization_id);
create index if not exists clients_organization_id_idx on public.clients (organization_id);
create index if not exists clients_created_by_idx on public.clients (created_by);

-- Seed the two partner organizations (idempotent)
insert into public.organizations (slug, name)
values
  ('kr-kinetics', 'KR Kinetics'),
  ('elevate-fitness', 'Elevate Fitness')
on conflict (slug) do update
set name = excluded.name;

-- Helper: current user's organization ids
create or replace function public.user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id
  from public.memberships m
  where m.user_id = auth.uid();
$$;

revoke all on function public.user_organization_ids() from public;
grant execute on function public.user_organization_ids() to authenticated;

create or replace function public.is_member_of(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.organization_id = org_id
  );
$$;

revoke all on function public.is_member_of(uuid) from public;
grant execute on function public.is_member_of(uuid) to authenticated;

-- Auto-create profile row when an invited auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;

-- Force RLS for table owners too
alter table public.organizations force row level security;
alter table public.profiles force row level security;
alter table public.memberships force row level security;
alter table public.clients force row level security;

-- organizations: members can read their orgs only
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (id in (select public.user_organization_ids()));

-- No insert/update/delete on organizations for authenticated clients
-- (seed/admin via service role / SQL editor only)

-- profiles: users can read/update self; members can read peers in same org
drop policy if exists profiles_select_self_or_org on public.profiles;
create policy profiles_select_self_or_org
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or id in (
      select m2.user_id
      from public.memberships m1
      join public.memberships m2 on m1.organization_id = m2.organization_id
      where m1.user_id = auth.uid()
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- memberships: read own memberships only (no cross-org enumeration)
drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own
  on public.memberships
  for select
  to authenticated
  using (user_id = auth.uid());

-- clients: full CRUD only inside member organization; fictional rows only
drop policy if exists clients_select_org on public.clients;
create policy clients_select_org
  on public.clients
  for select
  to authenticated
  using (public.is_member_of(organization_id) and is_fictional = true);

drop policy if exists clients_insert_org on public.clients;
create policy clients_insert_org
  on public.clients
  for insert
  to authenticated
  with check (
    public.is_member_of(organization_id)
    and is_fictional = true
    and created_by = auth.uid()
  );

drop policy if exists clients_update_org on public.clients;
create policy clients_update_org
  on public.clients
  for update
  to authenticated
  using (public.is_member_of(organization_id) and is_fictional = true)
  with check (public.is_member_of(organization_id) and is_fictional = true);

drop policy if exists clients_delete_org on public.clients;
create policy clients_delete_org
  on public.clients
  for delete
  to authenticated
  using (public.is_member_of(organization_id) and is_fictional = true);

-- Anonymous / public: no access (no policies for anon role)
revoke all on public.organizations from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
revoke all on public.clients from anon, authenticated;

grant select on public.organizations to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.memberships to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
