# Capsule 05 - Flux techniques end-to-end

## Objectif

Presenter les grands flux complets entre frontend, API, worker, DB et realtime.

## Duree cible

- 8 a 15 minutes

## Fil de presentation

1. Authentification + refresh
2. Ingestion MP3 -> catalogue
3. Streaming + progress + realtime sync

## Message principal

Les fonctionnalites principales reposent sur des flux complets et robustes, pas sur des traitements isoles.

## Fichiers a ouvrir

- [assets/diagrammes.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/05-flux-techniques-e2e/assets/diagrammes.md)
- [auth.service.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/auth/auth.service.ts)
- [auth-refresh.interceptor.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/core/interceptors/auth-refresh.interceptor.ts)
- [admin.controller.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/admin/admin.controller.ts)
- [ingest-mp3-as-m4b.job.ts](/Users/a3emond/dev/audiobook-platform/worker/src/jobs/ingest-mp3-as-m4b.job.ts)
- [sanitize-mp3.job.ts](/Users/a3emond/dev/audiobook-platform/worker/src/jobs/sanitize-mp3.job.ts)
- [stream.controller.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/streaming/stream.controller.ts)
- [progress.service.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/progress/progress.service.ts)

## Slides / diagrammes a montrer

- [assets/diagrammes.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/05-flux-techniques-e2e/assets/diagrammes.md)

## Preuves rapides

- rotation du refresh token;
- enqueue de job d'ingestion;
- HTTP Range support;
- `emitRealtimeEvent("progress.synced", ...)`.

## Points a souligner

- continute de session;
- publication rapide de contenu;
- synchronisation cross-client.
