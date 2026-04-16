# Apple StoryWave Lifecycle Architecture

This file documents the current StoryWave Apple app lifecycle and ownership model.

It should be updated whenever startup/auth/realtime/task ownership changes.

## Lifecycle Flow

```mermaid
flowchart TD
    A[App Launch] --> B[AudiobookApp init]
    B --> C[Create AppContainer]
    C --> D[Compose singletons: API/Auth/Realtime/Cache]
    C --> E[Compose feature VMs: Library/Player/Discussion/Admin/Profile]
    C --> F[Register realtime event routing subscribers]

    A --> G[Root task: bootstrap + API health]
    G --> H{Bootstrap + API reachable?}
    H -- No --> I[Health gate / retry UI]
    H -- Yes --> J{Authenticated?}

    J -- No --> K[LoginView]
    J -- Yes --> L[Main tabs + optional player overlay]

    K --> M[Auth state changes]
    L --> M
    M --> N[Auth lifecycle task in AudiobookApp]
    N --> O[AppContainer.setRealtimeLifecycleActive]

    O -- true --> P[RealtimeClient.connect]
    O -- false --> Q[RealtimeClient.disconnect]

    P --> R[Realtime events fan-out]
    R --> S[PlayerViewModel subscriber]
    R --> T[DiscussionViewModel subscriber]
    R --> U[AdminViewModel subscriber]
    R --> V[App cache invalidation for catalog.book.added]

    S --> W[Presence ticker 10s]
    S --> X[Autosave ticker 15s]
    S --> Y[playback.claim / progress / presence sends]

    L --> Z[Sign out]
    Z --> Q
    Z --> AA[Reset view models]

    AB[AppContainer deinit] --> AC[Unsubscribe realtime listeners]
    AC --> Q
```

## Ownership Rules

- `AppContainer` owns singleton services and realtime transport lifecycle.
- Feature view models own domain behavior and event application logic.
- `PlayerViewModel` subscribes to realtime events but does not own socket connect/disconnect.
- Auth transition (`isAuthenticated`) is the source of truth for realtime transport activation.
- API polling should be fallback/domain-specific only (for example, job logs view), not app-wide.

## Event Routing Map

- `playback.session.presence`, `playback.claimed`, `progress.synced` -> `PlayerViewModel`
- `discussion.message.created`, `discussion.message.deleted` -> `DiscussionViewModel`
- `job.state.changed` -> `AdminViewModel`
- `catalog.book.added` -> `AppCacheService.invalidateLibrary()`
