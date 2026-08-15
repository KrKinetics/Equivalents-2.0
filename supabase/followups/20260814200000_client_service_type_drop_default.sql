-- STAGE B — drop the temporary service_type default.
-- Apply ONLY after the new Coach portal version is deployed and verified.
--
-- Kept outside supabase/migrations/ so `supabase db push` / migration
-- automation cannot execute this before the application cutover.
--
-- Final production state:
--   service_type TEXT NOT NULL
--   CHECK (nutrition, programming, complete)
--   NO DEFAULT

alter table public.clients
  alter column service_type drop default;
