-- Rollback for 20260805140000_coach_rate_limit_buckets.sql
-- Safe: drops rate-limit helpers only. No client/dossier data touched.

drop function if exists public.coach_cleanup_rate_buckets(interval);
drop function if exists public.coach_consume_rate_limit(text, integer, integer);
drop table if exists public.coach_rate_buckets;
