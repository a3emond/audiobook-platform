# Capsule 03 - Worker, automation et media pipeline

## Objectif

Montrer que le worker est un moteur d'orchestration configurable, et que le traitement media repose sur une vraie chaine fiable avec FFmpeg, metadata et atomic writes.

## Duree cible

- 8 a 15 minutes

## Fil de presentation

1. Separation API / worker
2. JobRunner et JobProcessor
3. Fast jobs vs heavy jobs
4. Retries, delay, stale lock reclaim
5. Schedulers automatiques
6. Pipeline MP3 -> metadata -> publish -> sanitize M4B

## Message principal

Le backend asynchrone ne se contente pas d'executer des jobs: il gouverne des traitements mediatheques complexes de maniere configurable et fiable.

## Fichiers a ouvrir

- [job.runner.ts](/Users/a3emond/dev/audiobook-platform/worker/src/queue/job.runner.ts)
- [job.processor.ts](/Users/a3emond/dev/audiobook-platform/worker/src/queue/job.processor.ts)
- [worker-settings.service.ts](/Users/a3emond/dev/audiobook-platform/worker/src/services/worker-settings.service.ts)
- [parity-scheduler.service.ts](/Users/a3emond/dev/audiobook-platform/worker/src/services/parity-scheduler.service.ts)
- [tag-sync-scheduler.service.ts](/Users/a3emond/dev/audiobook-platform/worker/src/services/tag-sync-scheduler.service.ts)
- [ingest-mp3-as-m4b.job.ts](/Users/a3emond/dev/audiobook-platform/worker/src/jobs/ingest-mp3-as-m4b.job.ts)
- [sanitize-mp3.job.ts](/Users/a3emond/dev/audiobook-platform/worker/src/jobs/sanitize-mp3.job.ts)
- [book.model.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/books/book.model.ts)

## Slides / diagrammes a montrer

- [assets/diagrammes.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/03-worker-media-pipeline/assets/diagrammes.md)
- [assets/worker-class-diagram.puml](/Users/a3emond/dev/audiobook-platform/presentation/capsules/03-worker-media-pipeline/assets/worker-class-diagram.puml)

## Preuves rapides

- `handlers[job.type]`;
- `heavyWindowEnabled`, `fastConcurrency`, `runAfter`;
- `processingState` et `fileSync`;
- checksum + metadata extraction + atomic write.

## Points a souligner

- orchestration configurable;
- automatisation reelle;
- integrite des contenus;
- pragmatisme du fast publish puis sanitize differe.
