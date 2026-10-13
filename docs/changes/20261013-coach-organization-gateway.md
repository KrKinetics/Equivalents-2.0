# 2026-10-13 — organisation du coach sur la base du sprint

## Demande

Reprendre `coach.organization` de la PR #55 sur `origin/work/ultra-product-sprint` (`fd28f21`). Ne pas continuer `cursor/coach-organization-context-81f1`. Brouillon vers `work/ultra-product-sprint`. Pas de Production.

## Fichiers

Créés :

- `docs/gateway-lease-activation.md`
- `docs/changes/20261013-coach-organization-gateway.md`

Modifiés :

- `src/coach/server/internal/master-coach-gateway.mjs`
- `src/coach/server/internal/master-coach-gateway-store.mjs`
- `tests/master-coach-gateway.test.mjs`
- `tests/coach-server-pdf.test.mjs`
- `tests/motivation/motivation-pdf.test.mjs`
- `tests/motivation/send-motivation-invite.test.mjs`
- `api/coach-motivation.js`
- `package.json`

## Comportement

`coach.organization` lit l’appartenance `kr-kinetics` du jeton coach. Le rôle accepté est `coach` ou `platform_owner`. La réponse contient seulement `organizationId`. Un `organizationId` ou un `ownerUserId` dans la requête est refusé avant toute lecture.

L’identifiant d’organisation vient de `memberships.organization_id`. Il est refusé s’il est égal à `user_id` ou à `KR_COACH_USER_ID`. Aucune substitution par l’identifiant du coach.

Les lectures de clients du même magasin utilisent cette même appartenance.

Le contrat `authorizeClientAccess` inclut `service_type`. Le compte des fonctions Node est chaque fichier JavaScript sous `api` : 10, plafond Hobby 12. Le middleware Edge reste à part.

## Tests

- Organisation, HMAC, concurrence, anti-rejeu, questionnaire structuré : passés.
- Migration de bail sur Postgres embarqué isolé : passée. Aucune base distante.
- Les trois anciens échecs de `coach-auth-tests` sont couverts : deux comptes de fonctions, et `service_type`.

## Hors périmètre

Pas de W05. Pas de publication nutrition. Pas d’écriture dans un programme client. Pas d’application des migrations en Production. `MASTER_COACH_GATEWAY_LEASE` n’est pas posée. La branche de la PR #55 n’est pas mise à jour.
