-- Trigger helpers do not need elevated privileges or direct API execution.
alter function public.force_real_client_flag() security invoker;
revoke all on function public.force_real_client_flag() from public, anon, authenticated;
grant execute on function public.force_real_client_flag() to postgres, service_role;
