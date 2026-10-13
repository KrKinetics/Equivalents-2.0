# Activation du bail de session du gateway

Document seulement. Ces étapes ne sont pas exécutées par ce changement. Aucune migration n’est appliquée à Production. La variable `MASTER_COACH_GATEWAY_LEASE` n’est pas posée.

## État actuel

Le code du bail est sur `work/ultra-product-sprint`. Il reste inactif tant que `MASTER_COACH_GATEWAY_LEASE` n’est pas exactement `supabase`.

Sans cette variable, chaque instance garde sa session en mémoire. Avec la variable, une instance qui ne joint pas le bail refuse l’opération. Elle ne revient pas à un cache local.

Deux fichiers, dans cet ordre :

1. `supabase/migrations/20261012170000_master_coach_gateway_lease.sql`
2. `supabase/migrations/20261012180000_master_coach_gateway_lease_fence.sql`

Le second remplace la fonction du premier et ajoute la colonne `fence`. Appliquer seulement le premier laisse un `store` sans contrôle de clôture.

Les deux objets restent réservés à `service_role`. `anon` et `authenticated` n’ont aucun droit.

## Ordre d’activation, plus tard, hors de ce changement

1. Appliquer les deux fichiers sur une base isolée. Le test `tests/gateway-lease-migration.test.mjs` le fait déjà avec Postgres embarqué. Il vérifie le refus du rôle `authenticated`, l’incrément de `fence`, le code `FENCE_LOST` pour une clôture périmée, et le refus du second rejeu du même condensé de signature.
2. Relire le résultat sur cette base isolée avant toute base partagée.
3. Seulement après un GO humain distinct : appliquer les deux fichiers, dans le même ordre, sur le projet Supabase que la Preview du portail utilise.
4. Ensuite seulement, poser `MASTER_COACH_GATEWAY_LEASE=supabase` sur l’environnement Preview de Vercel. Pas sur Production.
5. Sur cette Preview, un appel signé doit obtenir une session partagée. Un second appel avec la même signature dans la fenêtre doit recevoir 401. Si la fonction SQL est absente, la réponse doit être 503, `stage: lease`, sans création d’un lien magique local.
6. Production reste sans la variable et sans ces deux migrations jusqu’à un autre GO. Ce document ne donne pas ce GO.

## Ce qui ne change pas

HMAC d’abord, nonce ensuite. Une signature invalide ne consomme pas le nonce. Deux instances qui tiennent le même bail ne créent qu’un lien magique. Une clôture périmée ne remplace pas le jeton publié.

Aucune écriture dans un programme client. Aucune publication nutrition. Aucune libération W05.
