# Native Platform Implementation Guide

Purpose:

- Lock the approved native platform strategy.
- Define implementation boundaries and architecture ownership per platform.
- Link to execution-level guides for mobile MVVM and Windows Electron.

Scope:

- Included: platform decisions, module ownership, delivery phases, acceptance criteria.
- Excluded: endpoint-level API payload details (see docs/api/\*).

Related docs:

- [Mobile Native MVVM Guide](./mobile-native-mvvm-guide.md)
- [Apple Native Starter Guide](./apple-swift-starter-project-guide.md)
- [Android Native Starter Guide](./android-kotlin-starter-project-guide.md)
- [Windows Electron Guide](./windows-electron-implementation-guide.md)
- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Web Frontend Technical Reference](./web-frontend-technical-reference.md)
- [Frontend Client Certification Checklist](./frontend-client-certification-checklist.md)

## 1. Locked Strategy (Approved)

Approved architecture split:

1. Core library per ecosystem (API-consuming business logic).
2. Platform-native frontend per ecosystem (UI and platform UX).

Locked platform choices:

- Apple: Swift core library + SwiftUI apps.
- Android: Kotlin core library + Kotlin UI (Jetpack Compose).
- Windows: Electron desktop app.

Explicitly not chosen:

- Kotlin Multiplatform for Apple + Android shared core.
- MAUI/Blazor hybrid for mobile.

## 2. Apple Direction (iOS + macOS)

Approved approach:

- Use one Xcode SwiftUI Multiplatform project to target iOS and macOS together.
- Keep one shared Swift core package consumed by both targets.
- Keep platform adapters separate for lifecycle/media/input differences.

Code ownership split:

- Shared:
  - API client, auth/session, repositories, DTO mapping, localization, caching policy.
  - Reusable SwiftUI design system components and feature view models.
- iOS-specific:
  - Background audio session policy.
  - Lock screen / remote control center behavior.
  - Mobile navigation patterns.
- macOS-specific:
  - Multi-window behavior.
  - Menu bar commands and keyboard-first interactions.
  - Pointer and desktop affordances.

## 3. Android Direction

Approved approach:

- Native Kotlin app with Jetpack Compose.
- Dedicated Kotlin core library (no shared KMP dependency).

Code ownership split:

- Core library:
  - API client, auth/session, repositories, DTO mapping, caching policy, realtime routing.
- Android app:
  - Compose UI, navigation, media session integration, audio focus/interruption handling.

## 4. Windows Direction

Approved approach:

- Electron app for Windows desktop delivery.
- Web UI stack optimized for desktop usage patterns.

Rules:

- Keep secure token storage strategy explicit for desktop.
- Preserve API/realtime contracts identical to mobile.
- Prefer native shell integrations only where needed (deep links, media keys, file dialogs).

## 5. Mobile Architecture Baseline

Required mobile pattern:

- MVVM across all feature modules.

Required module layering:

1. Network layer
2. Auth/session layer
3. Repository/domain layer
4. MVVM presentation layer
5. Platform media/realtime adapters

For full implementation details, use:

- [Mobile Native MVVM Guide](./mobile-native-mvvm-guide.md)

## 6. Feature Scope Contract (v1 – MVP)

**Web client:**

- Full feature set: Auth, Library, Series, Collections, Discussions, Profile, Admin console.

**Mobile clients (4-Feature MVP):**

- Auth (login/logout, OAuth where configured, token refresh)
- Library (browse language-filtered books, select to play)
- Player (streaming with ExoPlayer/AVPlayer, resume, progress, chapters, seek, skip, playback rate)
- Discussions (language-scoped channels, message send/receive)
- Profile (user info, language toggle, sign-out)
- Localization (system language detection, LocalizationService, en/fr support)

**Not in mobile MVP scope (Phase 2+):**

- Series grouping
- Collections curation
- Activity/History timeline
- Analytics dashboard
- Admin console (link-out to web instead)

Admin baseline for mobile clients:

- Do not implement full native admin UI in v1.
- Provide "Open Admin Console" action linking to:
  - https://yourdomain.app/admin/
- Ensure users can authenticate via SSO if admin has access.

## 7. Delivery Phases

**Phase 1 (MVP – 4 core features):**

- iOS + macOS shared Swift project bootstrapped (Xcode workspace structure).
- Android app bootstrapped (Gradle module structure).
- Windows Electron shell bootstrapped.
- For mobiles: complete Auth → Library → Player → Discussions → Profile workflow.
- LocalizationService implemented with system language detection on both iOS and Android.
- All API queries include language parameter (`?language=en|fr`).
- Health gate on startup (/api/v1/health).
- MVVM architecture validated (no Views calling APIs directly).
- TabView navigation (4 tabs) on mobile.
- Certification checklist passed (see Frontend Client Certification Checklist).

**Phase 2 (Native Quality):**

- Performance pass (startup time, list scroll, memory under long playback).
- Better offline/cache and background resumption behavior.
- Platform polish (keyboard shortcuts on macOS, media controls, lock-screen integration).
- Stability testing on real devices.

**Phase 3 (Extended – Series, Collections, Activity):**

- Optional expansion if time and user demand justify.
- Add Series detail and Collections browsing to mobile clients.
- Maintain MVVM boundaries and architecture consistency.

**Phase 4+ (Desktop Features, Admin):**

- Windows Electron admin UI (future consideration).
- macOS admin feature subset (if justified).
- Future lower-tier platforms (Linux, etc.).

## 8. Acceptance Criteria (MVP Release Gate)

A mobile platform is **release-ready** only when:

**Architecture:**

- MVVM boundaries are respected for all features (View, ViewModel, Repository separation).
- Views do not call API clients directly.
- Unit tests pass (auth, repository, ViewModel).
- Integration tests pass (MockWebServer, auth refresh, locale switching).
- UI tests pass (navigation, loading/error states, feature workflows).

**API Compliance:**

- Startup: GET /api/v1/health completes before auth/features (offline detection).
- All protected routes send Authorization: Bearer header.
- One-retry refresh on 401: invalid token triggers refresh, then one retry on success, logout on failure.
- Language-aware queries: all Library, Discussions, and content queries include `?language=en|fr`.
- Error handling: 4xx/5xx responses produce appropriate loading/error UI states.

**Localization (i18n):**

- LocalizationService detects system language (device locale) on first launch.
- Fallback to saved user preference, default to "en".
- Language toggle in Profile screen persists choice.
- All UI strings are externalized (no hardcoded text in views).
- Both en/fr translations complete (no missing keys).

**Features (4-Feature MVP):**

- ✅ Auth: login, token refresh, logout, secure storage.
- ✅ Library: browse books, select to open Player.
- ✅ Player: stream audio, resume, seek, chapters, progress tracking.
- ✅ Discussions: channel list, message send/receive (language-scoped).
- ✅ Profile: user info, language toggle, sign-out, admin link-out.

**Platform-Specific:**

- iOS: Keychain storage, background audio, lock-screen controls, AVPlayer integration.
- Android: Keystore/SharedPreferences, MediaSession, audio focus, ExoPlayer integration.

**Quality Gates:**

- Certification checklist (docs/platform/frontend-client-certification-checklist.md) passed.
- Memory profile acceptable (<200 MB during playback).
- Startup time < 2.5 seconds (cold start to UI visible).
- 60 FPS smooth scrolling on Library list.
- Offline mode shows appropriate messaging (no broken UX).
- No credentials, tokens, or PII in logs.

**Delivery Artifacts:**

- Platform-signed build (TestFlight for iOS, Play Store for Android).
- Release notes with feature list.
- Known limitations documented (Series, Collections not in MVP).
- Link to post-release roadmap (Phase 2+).

## 9. Change Log

**2026-01-15 (Latest):**

- Established 4-Feature MVP scope for mobile clients (Library, Player, Discussions, Profile, Auth).
- Implemented LocalizationService on iOS (Swift) and Android (Kotlin) with system language detection.
- Added mandatory health gate check (/api/v1/health) at app startup.
- All language-sensitive API queries require `?language=en|fr` parameter.
- Mobile clients link-out to web for admin tasks (no native admin UI in MVP).
- Updated all acceptance criteria to reflect MVP scope and i18n requirements.
- Added comprehensive MVVM testing strategy per platform.

**2026-04-11:**

- Locked strategy to Swift core (Apple), Kotlin core (Android), Electron (Windows).
- Confirmed Apple implementation should be one SwiftUI Multiplatform project with platform adapters.
- Established MVVM as mandatory mobile architecture baseline.
- Added complete Apple and Android starter project guides.
- Added in-repo client workspace scaffolds under `clients/apple`, `clients/android`, and `clients/windows-electron`.

## 10. Workspace Bootstrap Status

Current repo workspace paths:

- `clients/apple`
- `clients/android`
- `clients/windows-electron`

Quick start:

1. Apple: open `clients/apple` in Xcode and wire iOS/macOS targets to `Packages/AudiobookCore`.
2. Android: open `clients/android` in Android Studio and run Gradle sync.
3. Windows Electron: run `npm install` then `npm start` in `clients/windows-electron`.
