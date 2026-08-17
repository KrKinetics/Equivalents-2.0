-- Trigger helpers do not need direct API execution privileges.
revoke all on function public.force_real_client_flag() from public, anon, authenticated;
grant execute on function public.force_real_client_flag() to postgres, service_role;
