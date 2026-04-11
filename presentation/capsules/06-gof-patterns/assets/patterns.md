# GoF Patterns - Capsule 06

## Observer

- Fichiers: `api/src/realtime/realtime.events.ts`, `api/src/realtime/realtime.gateway.ts`
- Preuve: `subscribeRealtimeEvents()` + `emitRealtimeEvent()` + diffusion websocket.

## Strategy

- Fichiers: `worker/src/queue/job.processor.ts`, `worker/src/jobs/*.ts`
- Preuve: selection dynamique du handler par `job.type`.

## Factory Method

- Fichiers: `api/src/app.ts`, factories ViewModel Android.
- Preuve: `createApp()` et factories dediees a la creation d'objets.

## Singleton (model registry)

- Fichiers: `api/src/modules/books/book.model.ts`
- Preuve: reutilisation du model via `mongoose.models`.

## Chain of Responsibility

- Fichiers: `api/src/app.ts`
- Preuve: pipeline middleware Express (`cors`, `rate limit`, `auth`, `role`, `error`).
