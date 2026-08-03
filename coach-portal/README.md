# Coach portal (Auth + organizations)

Static invitation-only portal for KR Kinetics × Elevate Fitness.

- Stack: HTML/JS + `@supabase/supabase-js` (no Next.js, no `@supabase/ssr`)
- Config: gitignored `.env.local` → served as `/config.js` by `npm run coach:portal` (publishable values only)
- Same-origin workspace: `npm run coach:portal` (or `npm run coach:workspace`) serves portal + calculator
- URL locale: `http://127.0.0.1:4190/`
- Workspace: `http://127.0.0.1:4190/workspace/?client_id=<uuid>` (fictional clients only, RLS)
- Workspace save/load: Supabase `client_dossiers` (SoT). Offline `athlete_*` localStorage remains for `npm run coach:preview` only.

## Login modes

1. **Connexion par mot de passe** (principal) — `signInWithPassword`
2. **Recevoir un lien magique** (secondaire) — `signInWithOtp` with `shouldCreateUser: false`

Aucune inscription publique. Aucune création d’utilisateur depuis le portail.

## Prerequisites

1. Apply SQL migration in the Supabase project (SQL Editor).
2. Auth: disable public sign-ups; enable Email magic link + email/password.
3. Add redirect URL: `http://127.0.0.1:4190/`
4. Invite users and insert `memberships` rows for `kr-kinetics` / `elevate-fitness`.
5. Optionally set initial passwords with the local admin script (see below) — never in the browser.

## Set initial passwords (admin local only)

1. Add `SUPABASE_SERVICE_ROLE_KEY=` to gitignored `.env.local` (do not commit; never put this in `/config.js`).
2. Copy `.coach-passwords.example` → `.coach-passwords.local` and fill KR/Elevate emails + passwords.
3. Dry-run: `npm run coach:set-passwords`
4. Apply when ready: `npm run coach:set-passwords -- --apply`

Does not touch the nutrition engine, PDFs, 287 foods, or `athlete_*` localStorage.
