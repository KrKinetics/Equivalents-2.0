-- Explicit link from a Master Coach user id to one portal membership.
-- master_coach_user_id is an opaque subject from Master Coach. It is not looked up as a portal user.
-- Not applied by this change. No rows are inserted.

create table if not exists public.master_coach_subject_links (
  master_coach_user_id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  portal_user_id uuid not null,
  role text not null,
  created_at timestamptz not null default now(),
  constraint master_coach_subject_links_role_check check (role in ('coach', 'platform_owner')),
  constraint master_coach_subject_links_org_not_portal_user check (organization_id <> portal_user_id),
  constraint master_coach_subject_links_org_not_subject check (organization_id <> master_coach_user_id)
);

alter table public.master_coach_subject_links enable row level security;
revoke all on public.master_coach_subject_links from public, anon, authenticated;
grant select on public.master_coach_subject_links to service_role;
