-- Prevent application users from moving clients across organizations.
-- organization_id is set at insert (membership-checked) and becomes immutable.

create or replace function public.clients_prevent_organization_move()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'clients.organization_id is immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_prevent_organization_move on public.clients;
create trigger clients_prevent_organization_move
  before update on public.clients
  for each row execute function public.clients_prevent_organization_move();
