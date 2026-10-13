# 2026-10-13 — sujet coach signé

## Demande

La revue de la PR Master Coach #113 : le HMAC `{op:"coach.organization"}` ne nomme pas le coach appelant, et la réponse est celle de la session technique du gateway. Base `work/ultra-product-sprint` (`14db91b`), qui contient déjà la PR Equivalents #56. Brouillon vers cette base. Pas de Production. Pas de bail. Pas d’écriture client.

## Fichiers

Créés :

- `supabase/migrations/20261013220000_master_coach_subject_links.sql`
- `docs/changes/20261013-coach-subject-mapping.md`

Modifiés :

- `src/coach/server/internal/master-coach-gateway.mjs`
- `src/coach/server/internal/master-coach-gateway-store.mjs`
- `tests/master-coach-gateway.test.mjs`

## Comportement

Le corps signé doit inclure `coachSubject`, l’identifiant utilisateur Master Coach. Le portail le cherche seulement dans `master_coach_subject_links`. Cette clé n’est pas comparée à un utilisateur du portail.

Sans ligne, si la lecture échoue, si l’organisation n’est pas kr-kinetics, ou si le rôle n’est pas `coach` ou `platform_owner`, la réponse est un refus et `organizationId: null`. L’appartenance de la session technique n’est pas lue pour cette opération.

`organizationId` reste distinct de `coachSubject`, de `portal_user_id` et de `KR_COACH_USER_ID`.

La migration n’est pas appliquée. Elle n’insère aucune ligne. `authenticated` n’a aucun droit. Le bail n’est pas modifié.

## Tests

`node --test tests/master-coach-gateway.test.mjs` : 19 passés, 0 échec.

- Négatif : sujet signé, session technique qui aurait une organisation KR, aucune ligne de mapping. `organizationId` null. Aucun appel à `memberships`.
- Positif : fixture vers le tenant KR. L’organisation renvoyée est distincte du sujet, de l’utilisateur du portail et de `KR_COACH_USER_ID`.
- Athlète, autre organisation, gateway en échec, corps sans sujet : refus et `organizationId` null.

Aucune donnée Production.
