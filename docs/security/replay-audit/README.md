# KR KINETICS Portal — replay migration safety

**Scope:** read-only, no schema or Auth Hook changes. This directory is not a migration directory.

## Reproduced failure (2026-11-01)

A new **data-less** Supabase branch from `coach-kr-elevate-dev` stopped with `MIGRATIONS_FAILED`: `relation "public.client_motivation_invites" does not exist`. The temporary branch was deleted. The existing Portal project remains active and unchanged.

The existing Supabase migration ledger reports **22** versions, but Git `main` contains only **10** numbered SQL files. Fourteen recorded versions have no Git source; two Git versions lack a matching recorded version. The body of recorded migration `20260816140000` (`client_motivation_assessment`) and `20260816154500` (`harden_motivation_analysis_write`) is **missing** from the remote migration ledger. Yet Git stores both source files, including the table creation in the first. A later migration references that missing table.

This points to a **migration-history replay gap**, not evidence that the active Portal database lacks that table. It also explains why adding a new migration at the end cannot fix the branch.

## Preflight (offline, no credentials)

Run:
```sh
node --test tests/migration-replay-audit.test.mjs
node scripts/ci/migration-replay-audit.mjs --manifest docs/security/replay-audit/portal-ledger-2026-11-01.json --dir supabase/migrations
```
The second command should report `BLOCKED`; `--strict` intentionally exits 2 until all provenance checks pass.

## Release barriers

- Do **not** overwrite applied historic versions or run a remote migration repair.
- Identify each missing source from audited immutable Git history, remote *read-only* statements, or backups; do not synthesize missing production logic.
- Assemble a **replay-only, data-less** local snapshot before touching a remote project.
- Re-test Auth, RLS, privacy, invitation, nutrition and motivation migrations. Never touch real client profiles to run QA.
- Any paid Supabase branch, Production migration, shared Auth Hook, portal publication or destructive cleanup needs separate authorization.

This work is tracked with [Master Coach issue #212](https://github.com/KrKinetics/maitre-coach/issues/212). Existing project services stay operational.
