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

alter table public.clients add constraint clients_real_only check (is_fictional = false) not valid;
alter table public.clients validate constraint clients_real_only;
