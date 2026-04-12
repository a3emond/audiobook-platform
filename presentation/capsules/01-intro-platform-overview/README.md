# Capsule 01 - Intro: Platform Overview and Module Roadmap

## Slide 1 - Platform Scope

- Multi tier audiobook platform: Angular frontend, Node API, Node worker, MongoDB, Nginx, Docker Compose.
- End to end product loop: authentication, discovery, playback, progress sync, realtime events, media ingestion, admin operations.
- Delivery model: containerized runtime and automated deployment workflow.

## Slide 2 - What Will Be Presented

- Capsule 02: Auth module.
- Capsule 03: Worker module.
- Capsule 04: Library and language module.
- Capsule 05: Player module.
- Capsule 06: Admin module.
- Capsule 07: Reliability module.
- Capsule 08: Deployment and delivery module.

## Slide 3 - Runtime Architecture

```mermaid
flowchart LR
    User[User Browser]
    FE[Angular Frontend]
    API[API Service]
    WS[Realtime Gateway]
    DB[(MongoDB)]
    WKR[Worker Service]
    FF[FFmpeg Container]
    NGINX[Nginx Reverse Proxy]

    User --> NGINX
    NGINX --> FE
    NGINX --> API
    API --> DB
    API --> WS
    API --> WKR
    WKR --> DB
    WKR --> FF
```

## Slide 4 - Cross Module User Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API
    participant RT as Realtime
    participant W as Worker

    U->>FE: Login and browse book
    FE->>API: Auth request
    API-->>FE: Access token and refresh token
    FE->>API: Start playback and save progress
    API-->>RT: Broadcast progress event
    API->>W: Trigger ingest job when needed
    W-->>API: Job status update
    API-->>FE: Stream URL and state updates
```

## Slide 5 - Module Map

```mermaid
classDiagram
    class AuthModule {
      login
      refresh
      oauth
    }
    class WorkerModule {
      enqueue
      process
      retry
    }
    class LibraryModule {
      books
      series
      discussions
    }
    class PlayerModule {
      stream
      sync
      deviceClaim
    }
    class AdminModule {
      jobs
      users
      sessions
    }
    class ReliabilityModule {
      idempotency
      rateLimit
      audit
    }

    AuthModule --> PlayerModule
    LibraryModule --> PlayerModule
    AdminModule --> WorkerModule
    ReliabilityModule --> AuthModule
    ReliabilityModule --> AdminModule
```

## Slide 6 - Evidence Snapshot

- API bootstrap and routing: `api/src/app.ts`, `api/src/server.ts`.
- Auth core: `api/src/modules/auth`.
- Playback and progress: `api/src/modules/streaming`, `api/src/modules/progress`, `frontend/src/app/core/services/player.service.ts`.
- Worker queues and handlers: `worker/src/queue`, `worker/src/jobs`.
- Infrastructure and delivery: `docker-compose.yml`, `infra/nginx/default.conf`, `.github/workflows/deploy.yml`.

## Slide 7 - Code Snapshot

```ts
// api/src/server.ts
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  logger.info(`api listening on ${port}`);
});
```

```yaml
# docker-compose.yml
services:
  api:
    build: ./api
  worker:
    build: ./worker
  ffmpeg:
    build: ./ffmpeg
```

<!-- screenshot: full stack topology view -->
