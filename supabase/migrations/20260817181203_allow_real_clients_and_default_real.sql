alter table public.clients drop constraint if exists clients_fictional_only;
alter table public.clients alter column is_fictional set default false;
update public.clients set is_fictional = false where is_fictional is distinct from false;
