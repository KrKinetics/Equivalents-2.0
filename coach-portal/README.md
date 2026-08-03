# Coach portal (Auth + organizations)

Static invitation-only portal for KR Kinetics × Elevate Fitness.

- Stack: HTML/JS + `@supabase/supabase-js` (no Next.js, no `@supabase/ssr`)
- Config: gitignored `.env.local` → served as `/config.js` by `npm run coach:portal`
- URL locale: `http://127.0.0.1:4190/`

## Prerequisites

1. Apply SQL migration in the Supabase project (SQL Editor).
2. Auth: disable public sign-ups; enable Email magic link.
3. Add redirect URL: `http://127.0.0.1:4190/dashboard.html`
4. Invite users and insert `memberships` rows for `kr-kinetics` / `elevate-fitness`.

Does not touch the nutrition engine, PDFs, 287 foods, or `athlete_*` localStorage.
