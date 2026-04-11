# Capsule 07 - Qualite, fiabilite et ops

## Objectif

Montrer les mecanismes concrets de robustesse et d'exploitabilite du systeme.

## Duree cible

- 4 a 8 minutes

## Fil de presentation

1. retry et backoff
2. stale lock reclaim
3. idempotency
4. token rotation
5. exposition reseau minimale

## Message principal

La robustesse repose sur des mecanismes explicites de controle, de reprise et d'isolation.

## Fichiers a ouvrir

- [job.processor.ts](/Users/a3emond/dev/audiobook-platform/worker/src/queue/job.processor.ts)
- [job.runner.ts](/Users/a3emond/dev/audiobook-platform/worker/src/queue/job.runner.ts)
- [admin.routes.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/admin/admin.routes.ts)
- [auth.service.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/auth/auth.service.ts)
- [docker-compose.yml](/Users/a3emond/dev/audiobook-platform/docker-compose.yml)

## Slides / diagrammes a montrer

- [assets/fiabilite.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/07-qualite-fiabilite-ops/assets/fiabilite.md)

## Preuves rapides

- `computeRetryDelayMs()`;
- `reclaimStaleLocks()`;
- `idempotencyMiddleware`;
- rotation des refresh tokens;
- entree reseau unique.

## Points a souligner

- resilience;
- reduction des erreurs operatoires;
- posture de securite simple mais propre.
