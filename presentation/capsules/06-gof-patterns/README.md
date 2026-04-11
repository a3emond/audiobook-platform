# Capsule 06 - GoF Design Patterns

## Objectif

Montrer des patterns GoF reels, relies a des besoins concrets, avec preuves directes dans le code.

## Duree cible

- 5 a 10 minutes

## Fil de presentation

1. Observer
2. Strategy
3. Factory Method
4. Singleton
5. Chain of Responsibility

## Message principal

Les patterns sont defendables, ancrer dans des composants reels et utiles au systeme.

## Fichiers a ouvrir

- [assets/patterns.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/06-gof-patterns/assets/patterns.md)
- [realtime.events.ts](/Users/a3emond/dev/audiobook-platform/api/src/realtime/realtime.events.ts)
- [job.processor.ts](/Users/a3emond/dev/audiobook-platform/worker/src/queue/job.processor.ts)
- [app.ts](/Users/a3emond/dev/audiobook-platform/api/src/app.ts)
- [book.model.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/books/book.model.ts)

## Slides / diagrammes a montrer

- [assets/patterns.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/06-gof-patterns/assets/patterns.md)

## Preuves rapides

- `subscribeRealtimeEvents()` / `emitRealtimeEvent()`;
- `const handler = handlers[job.type]`;
- `createApp()`;
- registre Mongoose;
- pipeline middleware Express.

## Points a souligner

- utilite concrete de chaque pattern;
- exclusion volontaire des patterns trop faibles ou trop speculatifs.
