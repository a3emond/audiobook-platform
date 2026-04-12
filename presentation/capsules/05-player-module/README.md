# Capsule 05 - Player Module

## 1. Module Scope

- Streaming playback and transport controls.
- Progress sync, resume rewind, and completion tracking.
- Multi device presence and playback claim ownership.

## 2. Capability Set

- Range based audio streaming.
- Idempotent progress writes and conflict safe updates.
- Presence heartbeat with active device claim.
- Player controls: seek jumps, sleep timer, pause resume.

## 3. Architecture Flow Diagram

```mermaid
flowchart LR
    PUI[Player UI] --> PS[Player Service]
    PS --> ST[Streaming API]
    PS --> PR[Progress API]
    PS --> RT[Realtime Gateway]
    ST --> DB[(MongoDB)]
    PR --> DB
```

## 4. Sequence Diagram

```mermaid
sequenceDiagram
    participant UI as Player UI
    participant API as API
    participant RT as Realtime

    UI->>API: request stream for chapter
    API-->>UI: stream response with range support
    UI->>API: save progress position
    API-->>RT: emit progress update
    RT-->>UI: playback state event
    UI->>API: claim active device
    API-->>UI: claim granted
```

## 5. Class Diagram

```mermaid
classDiagram
    class PlayerService {
      play()
      pause()
      seekBy()
      setSleepTimer()
    }
    class StreamingController {
      streamChapter()
    }
    class ProgressService {
      upsertProgress()
      computeCompletion()
    }
    class PresenceService {
      heartbeat()
      claimDevice()
    }

    PlayerService --> StreamingController
    PlayerService --> ProgressService
    PlayerService --> PresenceService
```

## 6. Evidence Files

- `frontend/src/app/core/services/player.service.ts`
- `api/src/modules/streaming/stream.controller.ts`
- `api/src/modules/progress/progress.service.ts`
- `api/src/realtime/realtime.events.ts`
- `api/src/realtime/realtime.gateway.ts`

## 7. Code Proof Snippets

```ts
// frontend/src/app/core/services/player.service.ts
seekBy(seconds: number) {
  this.audio.currentTime = Math.max(0, this.audio.currentTime + seconds);
}
```

```ts
// api/src/modules/progress/progress.service.ts
await progressModel.updateOne(filter, update, { upsert: true });
```

## 8. GoF Patterns Demonstrated

- State
  - What it does: models playback lifecycle explicitly, preventing invalid transitions (for example, pause before stream is ready).

```ts
// frontend/src/app/core/services/player.service.ts
type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';

function transition(current: PlaybackState, event: 'LOAD' | 'READY' | 'PAUSE' | 'RESUME' | 'END'): PlaybackState {
  const table: Record<PlaybackState, Partial<Record<typeof event, PlaybackState>>> = {
    idle: { LOAD: 'loading' },
    loading: { READY: 'playing' },
    playing: { PAUSE: 'paused', END: 'ended' },
    paused: { RESUME: 'playing' },
    ended: { LOAD: 'loading' },
  };
  return table[current][event] ?? current;
}
```

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> loading: LOAD
    loading --> playing: READY
    playing --> paused: PAUSE
    paused --> playing: RESUME
    playing --> ended: END
```

- Observer
  - What it does: decouples event producers (API realtime gateway) from consumers (player UI, progress badge, device warning banner).

```ts
// api/src/realtime/realtime.events.ts
realtimeGateway.broadcastUser(userId, 'progress.updated', {
  bookId,
  chapterId,
  positionSec,
});
```

```mermaid
flowchart LR
    PR[Progress Service] --> RT[Realtime Gateway]
    RT --> PUI[Player UI]
    RT --> LB[Library Resume Badge]
    RT --> DC[Device Claim Banner]
```

- Strategy
  - What it does: allows interchangeable completion and resume rewind behavior based on product rules or A/B settings.

```ts
// api/src/modules/progress/progress.service.ts
interface CompletionStrategy {
  isCompleted(positionSec: number, durationSec: number): boolean;
}

const ninetyPercentRule: CompletionStrategy = {
  isCompleted: (position, duration) => position / Math.max(duration, 1) >= 0.9,
};
```

```mermaid
flowchart LR
    PS[Progress Service] --> CS[CompletionStrategy]
    CS --> D1[Completed?]
    D1 --> DB[(Progress Document)]
```

<!-- screenshot: active player with timer and jump controls -->
<!-- screenshot: multi device claim warning -->
