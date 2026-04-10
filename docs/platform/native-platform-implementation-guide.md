# Native Platform Implementation Guide

Purpose:
- Define how to build Android, iOS, macOS, Windows, and Linux clients with the same core product behavior as the web baseline.
- Specify platform-specific technical guidance while preserving API, UX, and design-token parity.

Scope:
- Included: capability matrix, platform architecture recommendations, storage/security, media integration, admin strategy, packaging, and release criteria.
- Excluded: detailed API endpoint shapes (see API docs), backend implementation details.

Related docs:
- [Web Frontend Technical Reference](./web-frontend-technical-reference.md)
- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Frontend Client Certification Checklist](./frontend-client-certification-checklist.md)

## 1. Product Parity Baseline

Native clients must implement, at minimum:
- Authentication and session lifecycle.
- Library/catalog browsing and filtering.
- Streaming playback with progress synchronization.
- Discussions (language-scoped channels + send/listen updates).
- Profile/settings including locale behavior.

Admin functionality baseline:
- Do not implement full admin UI by default in native clients.
- Provide admin role users an action that opens the web admin console:
  - `https://audiobook.aedev.pro/admin/overview/`

## 2. Cross-Platform Shared Rules

Network contracts:
- API: `/api/v1`
- Streaming: `/streaming`
- Realtime: `/ws`

Session rules:
- Access token used as bearer token.
- Refresh flow rotates tokens.
- One retry max on failed protected call after refresh.
- Refresh failure triggers full sign-out and state clear.

Localization rules:
- `en` and `fr` required.
- Locale persistence is mandatory.
- Locale switch must refresh language-sensitive content.

Design portability rules:
- Implement semantic design tokens (same roles as web), not pixel-perfect web CSS.
- Preserve color intent, contrast, typographic hierarchy, and spacing rhythm.

## 3. Shared Client Architecture Recommendation

Recommended layers for all native platforms:
1. API Layer:
- typed models, route groups, retry/timeout policy.
2. Auth Layer:
- token store, refresh coordinator, logout reset orchestration.
3. Domain Layer:
- library, playback, discussions, profile/settings modules.
4. Presentation Layer:
- platform-native screens/components.
5. Realtime Layer:
- websocket lifecycle + event router.
6. Media Layer:
- player service + OS media controls.

Recommended module ownership:
- Keep playback state and business rules in a shared domain module if using multiplatform strategy.
- Keep platform-specific UI and secure storage adapters separated.

## 4. Android Specifics

Recommended stack:
- Kotlin + Jetpack Compose.
- Coroutines + Flow for state streams.
- Media3/ExoPlayer for playback.
- Secure token storage via EncryptedSharedPreferences or Keystore-backed mechanism.

Platform requirements:
- Audio focus and interruption handling.
- Headset controls and notification/lock-screen media controls.
- Foreground service behavior for long playback sessions as required.
- Download/cache policy with storage quota limits.

Admin behavior:
- Add `Open Admin Console` in profile or overflow menu for admin users.
- Launch trusted browser intent; avoid passing credentials in URL.

## 5. iOS Specifics

Recommended stack:
- Swift + SwiftUI.
- Async/await + structured concurrency.
- AVPlayer for streaming playback.
- Keychain for secure token storage.

Platform requirements:
- Handle interruption and route-change events (calls, Bluetooth, headphones).
- Configure lock-screen metadata and remote command center.
- Background audio capability and lifecycle compliance.

Admin behavior:
- Show admin web entry point action.
- Use `SFSafariViewController` or external browser per UX/security policy.

## 6. macOS Specifics

Recommended stack:
- SwiftUI AppKit-hybrid where necessary.
- Shared networking/auth core with iOS where feasible.
- Keychain for secure credentials.

Platform requirements:
- Window-adaptive layout (sidebar + content behavior on resize).
- Keyboard-first navigation parity with web.
- Native menu/shortcut integration for playback controls where appropriate.

Admin behavior:
- Provide top-level menu item or settings action to open admin web console.

## 7. Windows Specifics

Recommended stack options:
- .NET MAUI (preferred for broad shared UI) or WinUI 3.
- HttpClient with resilient pipeline.
- Credential Locker or DPAPI-backed secure store.

Platform requirements:
- Media key support and transport control sync.
- Scalable layout from compact to ultra-wide windows.
- Installer/update strategy and signed package distribution.

Admin behavior:
- Admin deep action opens default browser at canonical admin URL.

## 8. Linux Specifics

Recommended stack options:
- Flutter desktop, Tauri, or Electron with strong native integration constraints.
- Secure storage via Secret Service API (GNOME Keyring/KWallet).

Platform requirements:
- Runtime dependency validation across target distributions.
- Media key support where desktop environment exposes controls.
- Configurable cache location and size limits.

Admin behavior:
- Launch admin in external browser by default.

## 9. Optional Shared-Webview Strategy

To minimize app size and implementation effort, clients may use webview-hybrid strategy for selected areas.

Recommended minimum native-first areas:
- Auth shell and session bootstrap.
- Playback shell and OS media integration.

Allowed web-linked areas:
- Full admin console.
- Potentially advanced management screens that are not core listening experience.

Rules for webview use:
- Keep host/domain allowlist strict.
- Avoid injecting credentials in URLs.
- Provide clear handoff between native and web context.

## 10. Theme Transfer Checklist

For each platform, map web semantic tokens to native theme resources:
- `bg`, `surface`, `surface-soft`, `surface-strong`, `surface-contrast`
- `text`, `text-muted`
- `primary`, `primary-dark`, `accent`, `accent-hover`
- `border`, `danger`, `success`
- `radius-sm`, `radius`, `radius-lg`
- `shadow-sm`, `shadow`, `shadow-lg`

Validation targets:
- Normal and disabled controls.
- Focus/pressed/selected affordances.
- Text contrast and accessibility across screens.

## 11. Delivery Phasing Recommendation

Phase 1 (minimum viable parity):
- Auth + library + playback + profile/settings + discussions.
- Admin link-out only.

Phase 2 (native quality expansion):
- Offline cache improvements.
- Enhanced notifications and platform shortcuts.
- Progressive performance optimization.

Phase 3 (optional advanced parity):
- Evaluate native admin subset only if operationally justified.

## 12. Acceptance Criteria

A platform release is acceptable only if:
- Core parity baseline is complete.
- Session and security rules are validated.
- Playback and progress sync behavior is stable.
- Locale behavior and tokenized theming are implemented.
- Admin link-out is present for admin users.
- Certification checklist is passed.

## 13. Change Notes

2026-04-10:
- Added dedicated native platform implementation guidance.
- Formalized admin web-link strategy to reduce native app footprint and scope risk.
