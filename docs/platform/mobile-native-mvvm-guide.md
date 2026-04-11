# Mobile Native MVVM Guide (Apple + Android)

Purpose:

- Provide implementation-ready architecture for native mobile apps.
- Enforce MVVM boundaries and clear module ownership.
- Define what frontend must look like and how screens should behave.

Applies to:

- iOS and macOS SwiftUI app targets
- Android Kotlin/Compose app target

Related docs:

- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)
- [Apple Native Starter Guide](./apple-swift-starter-project-guide.md)
- [Android Native Starter Guide](./android-kotlin-starter-project-guide.md)
- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Web Frontend Technical Reference](./web-frontend-technical-reference.md)
- [Frontend Client Certification Checklist](./frontend-client-certification-checklist.md)

## 1. Mandatory Architecture

MVVM is mandatory for all mobile features.

Layer contract:

1. API client layer:

- HTTP/WebSocket clients, request builders, DTO decoders.

2. Auth/session layer:

- token store, refresh coordinator, logout reset.

3. Repository/domain layer:

- feature repositories + use-cases.

4. Presentation layer (MVVM):

- ViewModel (state + intents + side effects)
- View (render state, forward user intent)

5. Platform adapter layer:

- media session, interruptions, lifecycle hooks, notifications.

Hard boundaries:

- Views do not call API directly.
- ViewModels do not know concrete HTTP implementation details.
- Repositories do not know UI framework types.

## 2. Module Map

Required feature modules:

- auth
- library
- series
- collections
- player
- progress
- discussions
- profile-settings
- realtime

Core modules (shared per platform codebase):

- core-network
- core-auth
- core-storage
- core-i18n
- core-design
- core-analytics

## 3. MVVM State Contract

Every feature ViewModel must expose:

- UiState (single source of truth)
- UiEvent (one-shot effects: toasts/navigation/dialogs)
- Intents (user actions)

Example state shape:

```text
UiState {
  isLoading: boolean
  data: ...
  error: LocalizedError?
  canRetry: boolean
}
```

Rules:

- Keep UiState immutable.
- Reduce state only inside ViewModel.
- Use explicit loading/empty/error/success states.

## 4. Frontend UX Spec (Must Match Across Mobile)

## 4.1 Navigation

Tab order (required):

1. Library
2. Activity/History
3. Discussions
4. Profile

Optional top-level entry for admin users:

- Open Admin Console (link-out)

## 4.2 Screen Layout Language

Library screen:

- Top app bar with search + locale access.
- Filter chips row (language/series/genre).
- Card grid/list with cover, title, author, progress.

Player screen:

- Large cover area, title/author block.
- Primary controls centered (play/pause, skip +/-).
- Chapter list drawer/sheet.
- Progress scrubber with elapsed/remaining.

Discussions screen:

- Channel selector by language.
- Message list with timestamps and sender identity.
- Sticky composer at bottom.

Profile/settings screen:

- Account details section.
- Locale selector.
- Playback preferences (resume rewind, jumps, speed).
- Admin console link for admin role.

## 4.3 Motion and Feedback

Required:

- Skeleton loaders for list screens.
- Optimistic UI only where rollback is clear.
- Error state with explicit retry CTA.
- Confirmation dialogs for destructive actions.

## 4.4 Accessibility

Required:

- WCAG AA contrast.
- Dynamic text support.
- Screen reader labels for all controls.
- Focus order and keyboard support for iPad/macOS/Chromebook contexts.

## 5. Design Token Parity

Semantic tokens to map from web:

- bg, surface, surface-soft, surface-strong, surface-contrast
- text, text-muted
- primary, primary-dark, accent, accent-hover
- border, danger, success
- radius-sm, radius, radius-lg
- shadow-sm, shadow, shadow-lg

Rules:

- Do not hardcode per-screen color values.
- Keep semantic meaning intact even if platform-native visuals differ.

## 6. API/Realtime Contract

Base routes:

- API: /api/v1
- Streaming: /streaming
- WebSocket: /ws

Required endpoint families:

- auth, books, series, collections, progress, settings, stats, discussions

Required runtime behavior:

- attach bearer token
- single refresh retry on 401/403
- forced logout on refresh failure
- reconnect websocket with capped exponential backoff + jitter

## 7. Playback Contract

Required flow:

1. Call resume endpoint before playback start.
2. Start stream from /streaming/books/:bookId/audio.
3. Persist progress frequently and on pause/background/exit.
4. Keep completion semantics consistent with backend.

Platform adapters:

- iOS/macOS: AVAudioSession + remote command center adapters.
- Android: audio focus + media session adapters.

## 8. Testing Requirements

Per feature minimum tests:

- ViewModel state reduction tests
- Repository success/failure tests
- API contract decoder tests
- Player resume/progress tests
- Realtime event routing tests

Release block conditions:

- hardcoded user-facing strings
- token leakage in logs
- broken loading/empty/error states
- missing locale switch behavior

## 9. Implementation Blueprint

Execution order:

1. Core network/auth/storage/i18n modules
2. Auth feature (MVVM)
3. Library + series + collections
4. Player + progress sync
5. Discussions + realtime
6. Profile/settings + admin link-out
7. Performance/accessibility pass
8. Certification pass

## 10. Technical Links

API docs:

- ../api/auth-endpoints.md
- ../api/books-endpoints.md
- ../api/collections-endpoints.md
- ../api/discussions-endpoints.md
- ../api/progress-endpoints.md
- ../api/series-endpoints.md
- ../api/settings-endpoints.md
- ../api/stats-endpoints.md
- ../api/streaming-endpoints.md

Platform docs:

- ./native-platform-implementation-guide.md
- ./frontend-client-integration-guideline.md
- ./frontend-client-certification-checklist.md
